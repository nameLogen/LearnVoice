import * as ort from 'onnxruntime-web/wasm';
import { decodeCTC, normalizeAudio, SAMPLE_RATE } from './speech';

ort.env.wasm.wasmPaths = '/ort/';
ort.env.wasm.numThreads = 1;
let session: ort.InferenceSession | null = null;
let vocabulary: string[] = [];

async function prepare() {
  if (session) return;
  const response = await fetch('/models/phoneme/vocab.json');
  if (!response.ok || !response.headers.get('content-type')?.includes('json')) throw new Error('本地模型未准备。开发时请先运行 npm run models:download，安卓请安装包含模型的 APK。');
  const vocab = await response.json() as Record<string, number>;
  vocabulary = [];
  for (const [token, id] of Object.entries(vocab)) vocabulary[id] = token;
  session = await ort.InferenceSession.create('/models/phoneme/model.onnx', { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}

self.onmessage = async event => {
  const { id, command, samples } = event.data;
  try {
    await prepare();
    if (command === 'prepare') { self.postMessage({ id, result: { engine: 'ONNX Runtime Web · WASM' } }); return; }
    const pcm = new Float32Array(samples), input = normalizeAudio(pcm);
    const feeds: Record<string, ort.Tensor> = { input_values: new ort.Tensor('float32', input, [1, input.length]) };
    if (session!.inputNames.includes('attention_mask')) feeds.attention_mask = new ort.Tensor('int64', new BigInt64Array(input.length).fill(1n), [1, input.length]);
    const start = performance.now();
    let results: ort.InferenceSession.ReturnType | undefined;
    try {
      results = await session!.run(feeds);
      const logits = results.logits ?? results[session!.outputNames[0]];
      const phones = decodeCTC(logits.data as Float32Array, logits.dims[1], logits.dims[2], vocabulary, pcm.length / SAMPLE_RATE);
      self.postMessage({ id, result: { phones, elapsedMs: performance.now() - start, engine: 'ONNX Runtime Web · WASM' } });
    } finally { if (results) Object.values(results).forEach(t => t.dispose()); Object.values(feeds).forEach(t => t.dispose()); }
  } catch (error) { self.postMessage({ id, error: error instanceof Error ? error.message : String(error) }); }
};
