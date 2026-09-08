import { isAndroid, VoiceLab } from './native';
import type { RawInference } from './types';

let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
function stopWorker(message: string) {
  worker?.terminate(); worker = undefined;
  pending.forEach(p => { clearTimeout(p.timer); p.reject(new Error(message)); }); pending.clear();
}
function callWorker<T>(command: string, samples?: Float32Array): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('./inference.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = event => {
      const { id, result, error } = event.data, item = pending.get(id);
      if (!item) return;
      clearTimeout(item.timer); pending.delete(id);
      if (error) item.reject(new Error(error)); else item.resolve(result);
    };
    worker.onerror = () => stopWorker('语音运行库加载失败或内存不足。请关闭其他页面后重试，或使用安卓 APK。');
  }
  return new Promise<T>((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => stopWorker('本次处理超过 90 秒，已停止。此设备可能不适合该模型，请尝试更短的录音。'), 90_000);
    pending.set(id, { resolve: value => resolve(value as T), reject, timer });
    worker!.postMessage({ id, command, samples });
  });
}
export const prepareModel = () => isAndroid ? VoiceLab.prepare() : callWorker<{ engine: string }>('prepare');
export const analyse = (pcm: Float32Array) => isAndroid ? VoiceLab.analyse({ samples: Array.from(pcm) }) : callWorker<RawInference>('analyse', pcm);
