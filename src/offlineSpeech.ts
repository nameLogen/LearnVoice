import { registerPlugin } from '@capacitor/core';
import { isAndroid } from './native';

export interface OfflineVoice { id: string; name: string; lang: string }
interface SpeechPlugin {
  voices(): Promise<{ voices: OfflineVoice[] }>;
  speak(options: { text: string; voiceId: string; rate: number }): Promise<{ cancelled: boolean }>;
  stop(): Promise<void>;
}
const nativeSpeech = registerPlugin<SpeechPlugin>('OfflineSpeech');
let cancelWeb: (() => void) | undefined;
let revision = 0;
export const NO_VOICE = '没有可用的离线英语声音。请在设备的文字转语音设置中安装英语离线语音包，再点击“重新检测”；也可以使用有离线英语声音的 Android 设备。不会改用在线朗读。';

export async function offlineVoices(): Promise<OfflineVoice[]> {
  if (isAndroid) return (await nativeSpeech.voices()).voices;
  if (!('speechSynthesis' in window)) return [];
  const synth = window.speechSynthesis;
  if (!synth.getVoices().length) await new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); synth.removeEventListener('voiceschanged', done); resolve(); };
    const timer = setTimeout(done, 1500); synth.addEventListener('voiceschanged', done);
  });
  return synth.getVoices().filter(v => v.localService && /^en(?:[-_]|$)/i.test(v.lang))
    .map(v => ({ id: v.voiceURI, name: v.name, lang: v.lang }))
    .sort((a,b) => Number(/^en[-_]US$/i.test(b.lang)) - Number(/^en[-_]US$/i.test(a.lang)) || a.name.localeCompare(b.name));
}
export async function stopSpeech(): Promise<void> {
  revision++; cancelWeb?.(); cancelWeb = undefined;
  if (isAndroid) { await nativeSpeech.stop(); return; }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
export async function speakOffline(text: string, voiceId: string, rate = .85): Promise<boolean> {
  await stopSpeech(); const token = revision;
  if (!text.trim()) return true;
  if (isAndroid) return !(await nativeSpeech.speak({ text, voiceId, rate })).cancelled && token === revision;
  if (!('speechSynthesis' in window)) throw new Error(NO_VOICE);
  // Revalidate immediately before every utterance; never let the browser choose a default remote voice.
  const synth = window.speechSynthesis;
  const voice = synth.getVoices().find(v => v.voiceURI === voiceId && v.localService && /^en(?:[-_]|$)/i.test(v.lang));
  if (!voice) throw new Error(NO_VOICE);
  return new Promise<boolean>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text); utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = rate;
    let settled = false;
    const finish = (complete: boolean, error?: Error) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (cancelWeb === cancel) cancelWeb = undefined;
      utterance.onend = null; utterance.onerror = null;
      if (error) reject(error); else resolve(complete && token === revision);
    };
    const cancel = () => finish(false);
    const timer = setTimeout(() => { finish(false, new Error('离线朗读没有响应，请检查语音包后重试。')); synth.cancel(); }, 60_000);
    cancelWeb = cancel;
    utterance.onend = () => finish(true);
    utterance.onerror = () => finish(false, new Error('离线朗读失败，请重新检测声音或检查本地语音包。'));
    try { synth.speak(utterance); } catch (e) { finish(false, e instanceof Error ? e : new Error('朗读失败。')); }
  });
}
