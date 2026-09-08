import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
const dest = new URL('../public/ort/', import.meta.url);
const source = new URL('../node_modules/onnxruntime-web/dist/', import.meta.url);
await mkdir(dest, { recursive: true });
const wasmFiles = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'];
for (const name of await readdir(dest)) {
  if (name.startsWith('ort-wasm') && !wasmFiles.includes(name)) await rm(new URL(name, dest));
}
for (const name of wasmFiles) {
  await copyFile(new URL(name, source), new URL(name, dest));
}
const licenses = new URL('../public/licenses/', import.meta.url);
await mkdir(licenses, { recursive: true });
for (const [relative, name] of [
  ['node_modules/@capacitor/core/LICENSE', 'Capacitor.txt'],
  ['node_modules/react/LICENSE', 'React.txt'],
  ['models/licenses/ONNX-Runtime.txt', 'ONNX-Runtime.txt'],
  ['node_modules/lucide-react/LICENSE', 'Lucide.txt'],
  ['models/licenses/Apache-2.0.txt', 'Model-Apache-2.0.txt'],
  ['THIRD_PARTY_NOTICES.md', 'NOTICES.md'],
]) await copyFile(new URL('../' + relative, import.meta.url), new URL(name, licenses));
console.log('浏览器推理运行库已复制到本地资源目录。');
