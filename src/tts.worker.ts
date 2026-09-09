import { KokoroTTS } from "kokoro-js";
import { env } from "@huggingface/transformers";
let model: Promise<KokoroTTS> | undefined;
let queue = Promise.resolve();
let initialized = false;
let latest = 0;
function configure(base: string) {
  if (initialized) return;
  initialized = true;
  const root = new URL(base),
    nativeFetch = globalThis.fetch.bind(globalThis);
  // Kokoro 1.2.1 hardcodes its voice URL. Redirect only those four known files
  // to bundled, pinned assets; reject every other off-origin request.
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    let url = new URL(
      input instanceof Request ? input.url : String(input),
      root,
    );
    const voice =
      /^https:\/\/huggingface\.co\/onnx-community\/Kokoro-82M-v1\.0-ONNX\/resolve\/main\/voices\/(af_heart|am_michael|bf_emma|bm_george)\.bin$/.exec(
        url.href,
      );
    if (voice) url = new URL(`models/kokoro/voices/${voice[1]}.bin`, root);
    if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname))
      throw new Error("离线朗读阻止了外部资源请求。");
    return nativeFetch(url, init);
  }) as typeof fetch;
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = new URL("models/", root).href;
  env.useBrowserCache = false;
  // The upstream voice loader has its own CacheStorage path; do not reuse
  // an unpinned voice previously fetched by another version on this origin.
  Object.defineProperty(globalThis, "caches", {
    value: undefined,
    configurable: true,
  });
  env.backends.onnx.wasm!.wasmPaths = new URL("tts-ort/", root).href;
  env.backends.onnx.wasm!.numThreads = 1;
}
self.onmessage = (event) => {
  const { id, text, voice, rate, base, phones } = event.data;
  latest = id;
  queue = queue.then(async () => {
    try {
      if (id !== latest) throw new Error("已切换到新的朗读内容。");
      configure(base);
      model ??= KokoroTTS.from_pretrained("kokoro", {
        dtype: "q8",
        device: "wasm",
      }).catch((e) => {
        model = undefined;
        throw e;
      });
      const engine = await model;
      const audio = phones
        ? await engine.generate_from_ids(
            engine.tokenizer(phones, { truncation: true }).input_ids,
            { voice, speed: rate },
          )
        : await engine.generate(text, { voice, speed: rate });
      const pcm = Float32Array.from(audio.audio);
      self.postMessage(
        { id, pcm, rate: audio.sampling_rate },
        { transfer: [pcm.buffer] },
      );
    } catch (e) {
      self.postMessage({
        id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });
};
