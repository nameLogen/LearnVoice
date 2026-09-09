import { appAssetUrl } from "./assets";
import { releaseAnalysisEngine } from "./inference";
let worker: Worker | undefined,
  serial = 0,
  idle: ReturnType<typeof setTimeout> | undefined;
const pending = new Map<
  number,
  {
    resolve(value: Blob): void;
    reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const cache = new Map<string, Blob>();
let bytes = 0;
export function releaseSpeechEngine() {
  clearTimeout(idle);
  worker?.terminate();
  worker = undefined;
  pending.forEach((p) => {
    clearTimeout(p.timer);
    p.reject(new Error("本次朗读已取消。"));
  });
  pending.clear();
}
export function pcmWav(pcm: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + pcm.length * 2),
    v = new DataView(buffer);
  const put = (at: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  put(0, "RIFF");
  v.setUint32(4, 36 + pcm.length * 2, true);
  put(8, "WAVE");
  put(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  put(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  pcm.forEach((s, i) =>
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 32767, true),
  );
  return new Blob([buffer], { type: "audio/wav" });
}
export async function synthesize(
  text: string,
  voice: string,
  rate: number,
  phones?: string,
): Promise<Blob> {
  const key = JSON.stringify([text, voice, rate, phones]);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  clearTimeout(idle);
  await releaseAnalysisEngine();
  if (!worker) {
    worker = new Worker(new URL("./tts.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      clearTimeout(p.timer);
      if (e.data.error) p.reject(new Error(`离线朗读未完成：${e.data.error}`));
      else p.resolve(pcmWav(e.data.pcm, e.data.rate));
      if (!pending.size) idle = setTimeout(releaseSpeechEngine, 45_000);
    };
    worker.onerror = () => releaseSpeechEngine();
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    const id = ++serial,
      timer = setTimeout(() => releaseSpeechEngine(), 120_000);
    pending.set(id, { resolve, reject, timer });
    worker!.postMessage({
      id,
      text,
      voice,
      rate,
      base: appAssetUrl(""),
      phones,
    });
  });
  cache.set(key, blob);
  bytes += blob.size;
  while (bytes > 16 * 1024 * 1024 && cache.size > 1) {
    const first = cache.keys().next().value!;
    bytes -= cache.get(first)!.size;
    cache.delete(first);
  }
  return blob;
}
