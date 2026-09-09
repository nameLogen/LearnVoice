import type { Phone, PitchPoint, Quality, Target, Verdict } from './types';

export const SAMPLE_RATE = 16000;
export const MAX_SECONDS = 5;

export function inspectAudio(pcm: Float32Array): Quality {
  let energy = 0, peak = 0, clipped = 0;
  for (const value of pcm) {
    if (!Number.isFinite(value)) return { duration: pcm.length / SAMPLE_RATE, rmsDb: -120, peak: 0, clipping: 0, reason: '录音数据损坏，请重新录制。' };
    energy += value * value; peak = Math.max(peak, Math.abs(value));
    if (Math.abs(value) >= 0.99) clipped++;
  }
  const rmsDb = 20 * Math.log10(Math.max(1e-6, Math.sqrt(energy / Math.max(1, pcm.length))));
  const duration = pcm.length / SAMPLE_RATE;
  const clipping = clipped / Math.max(1, pcm.length);
  const reason = duration < 0.25 ? '录音太短，请说完后再停止。'
    : rmsDb < -48 ? '声音太轻或没有听到声音，请靠近一点重试。'
    : clipping > 0.03 ? '声音过大导致失真，请离麦克风稍远一些。' : null;
  return { duration, rmsDb, peak, clipping, reason };
}

// Wav2Vec2 feature-extractor normalization; do not change gain before quality checks.
export function normalizeAudio(pcm: Float32Array): Float32Array {
  const mean = pcm.reduce((sum, x) => sum + x, 0) / pcm.length;
  const variance = pcm.reduce((sum, x) => sum + (x - mean) ** 2, 0) / pcm.length;
  const denominator = Math.sqrt(variance + 1e-7);
  return Float32Array.from(pcm, x => (x - mean) / denominator);
}

export function decodeCTC(data: ArrayLike<number>, frames: number, size: number, vocabulary: string[], duration: number): Phone[] {
  const phones: Phone[] = [];
  let previous = -1;
  for (let frame = 0; frame < frames; frame++) {
    const offset = frame * size;
    let best = 0;
    for (let i = 1; i < size; i++) if (data[offset + i] > data[offset + best]) best = i;
    const token = vocabulary[best] ?? '<unk>';
    if (best === previous) {
      if (phones.length && (!token.startsWith('<') || token === '<unk>') && token !== '|') phones[phones.length - 1].end = (frame + 1) / frames * duration;
      continue;
    }
    previous = best; // Collapse repeated labels BEFORE removing CTC blanks.
    if ((token.startsWith('<') && token !== '<unk>') || token === '|') continue;
    let denominator = 0;
    for (let i = 0; i < size; i++) denominator += Math.exp(data[offset + i] - data[offset + best]);
    phones.push({ token, confidence: 1 / denominator, start: frame / frames * duration, end: (frame + 1) / frames * duration });
  }
  return phones;
}

export function canonicalPhone(phone: string): string {
  return phone.normalize('NFC').replace(/[ˈˌ͜͡]/g, '').replace(/g/g, 'ɡ').trim();
}

export function comparePhones(target: Target, phones: Phone[]): { verdict: Verdict; explanation: string } {
  if (target.mode === 'pinyin') return { verdict: 'observation', explanation: '拼音仅记录声韵候选与音高曲线；本模型未针对儿童普通话校准，未执行声调评分。请家长结合回放标注。' };
  if (!phones.length) return { verdict: 'uncertain', explanation: '没有识别出可用音素。可能是发音很短、环境干扰或模型不适合本次声音。' };
  const confidence = phones.reduce((sum, p) => sum + p.confidence, 0) / phones.length;
  if (confidence < 0.35) return { verdict: 'uncertain', explanation: '模型输出不稳定，暂不比较。此阈值是实验规则，不是经过校准的教学评分。' };
  const actual = phones.map(p => canonicalPhone(p.token)).join('');
  const matches = target.phones.some(variant => variant.map(canonicalPhone).join('') === actual);
  return matches
    ? { verdict: 'match', explanation: '模型输出与预设音素序列相符。这个结果不等于发音标准，仍需家长标注核对。' }
    : { verdict: 'different', explanation: '模型输出与预设序列不同。可能是读音不同，也可能是识别错误，请回放后标注。' };
}

// Normalized autocorrelation. A visualization aid only, never a tone grader.
export function extractPitch(pcm: Float32Array): PitchPoint[] {
  const frameSize = 640, hop = 320, points: PitchPoint[] = [];
  for (let start = 0; start + frameSize <= pcm.length; start += hop) {
    let rms = 0, mean = 0;
    for (let i = 0; i < frameSize; i++) mean += pcm[start + i];
    mean /= frameSize;
    const frame = new Float32Array(frameSize);
    for (let i = 0; i < frameSize; i++) { frame[i] = pcm[start + i] - mean; rms += frame[i] ** 2; }
    if (Math.sqrt(rms / frameSize) < 0.006) continue;
    const correlations: number[] = [];
    const minimum = Math.floor(SAMPLE_RATE / 650), maximum = Math.floor(SAMPLE_RATE / 75);
    for (let lag = minimum; lag <= maximum; lag++) {
      let cross = 0, left = 0, right = 0;
      for (let i = 0; i < frameSize - lag; i++) {
        cross += frame[i] * frame[i + lag]; left += frame[i] ** 2; right += frame[i + lag] ** 2;
      }
      correlations[lag] = cross / Math.max(1e-9, Math.sqrt(left * right));
    }
    let best = -1;
    for (let lag = minimum + 1; lag < maximum; lag++) {
      if (correlations[lag] > 0.8 && correlations[lag] >= correlations[lag - 1] && correlations[lag] > correlations[lag + 1]) { best = lag; break; }
    }
    if (best > 0) points.push({ time: (start + frameSize / 2) / SAMPLE_RATE, hz: SAMPLE_RATE / best });
  }
  return points;
}

export function encodeWav(pcm: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + pcm.length * 2), view = new DataView(buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + pcm.length * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, pcm.length * 2, true);
  pcm.forEach((x, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x)) * (x < 0 ? 32768 : 32767)), true));
  return new Blob([buffer], { type: 'audio/wav' });
}
