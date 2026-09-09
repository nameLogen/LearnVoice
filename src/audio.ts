import { SAMPLE_RATE, MAX_SECONDS } from './speech';
import { isAndroid, VoiceLab } from './native';
import { appAssetUrl } from './assets';

export interface Recorder { stop(): Promise<Float32Array>; cancel(): Promise<void> }
async function resample(samples: Float32Array, rate: number): Promise<Float32Array> {
  if (rate === SAMPLE_RATE) return samples;
  const context = new OfflineAudioContext(1, Math.ceil(samples.length / rate * SAMPLE_RATE), SAMPLE_RATE);
  const buffer = context.createBuffer(1, samples.length, rate);
  buffer.copyToChannel(Float32Array.from(samples), 0);
  const source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination); source.start();
  const rendered = await context.startRendering();
  return Float32Array.from(rendered.getChannelData(0));
}

export async function startRecorder(onLevel: (level: number) => void): Promise<Recorder> {
  if (isAndroid) {
    await VoiceLab.startRecording();
    return { stop: async () => Float32Array.from((await VoiceLab.stopRecording()).samples), cancel: () => VoiceLab.cancelRecording() };
  }
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前页面无法使用麦克风。请使用安卓安装包，或通过 HTTPS／本机 localhost 打开网页。');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const context = new AudioContext();
  let source: MediaStreamAudioSourceNode | undefined, node: AudioWorkletNode | undefined;
  const chunks: Float32Array[] = [];
  let count = 0;
  const cleanup = async () => {
    if (node) { node.port.onmessage = null; node.disconnect(); }
    source?.disconnect(); stream.getTracks().forEach(track => track.stop());
    if (context.state !== 'closed') await context.close();
  };
  try {
    await context.resume();
    await context.audioWorklet.addModule(appAssetUrl('recorder-worklet.js'));
    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, 'voice-capture');
    node.port.onmessage = event => {
      const data = event.data as Float32Array;
      if (count + data.length > context.sampleRate * MAX_SECONDS) return;
      chunks.push(data); count += data.length;
      onLevel(Math.min(1, Math.sqrt(data.reduce((sum, x) => sum + x * x, 0) / data.length) * 6));
    };
    const mute = context.createGain(); mute.gain.value = 0;
    source.connect(node); node.connect(mute); mute.connect(context.destination);
  } catch (error) { await cleanup(); throw error; }
  return {
    stop: async () => {
      await cleanup();
      const samples = new Float32Array(count); let offset = 0;
      for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
      return count ? resample(samples, context.sampleRate) : samples;
    },
    cancel: cleanup,
  };
}

export async function readAudioFile(file: File): Promise<Float32Array> {
  if (file.size > 15 * 1024 * 1024) throw new Error('请选择小于 15 MB 的短录音。');
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (decoded.duration > MAX_SECONDS + 0.1) throw new Error(`录音最长 ${MAX_SECONDS} 秒。请先裁剪，避免手机占用过多内存。`);
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const samples = decoded.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) mono[i] += samples[i] / decoded.numberOfChannels;
    }
    return resample(mono, decoded.sampleRate);
  } finally { await context.close(); }
}
