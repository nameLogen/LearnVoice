import { appAssetUrl } from './assets';
import { targets } from './targets';
import type { Target } from './types';

// CMU's ARPAbet -> broad US IPA, with diphthongs matching the model's label units.
const ipa: Record<string, string[]> = {
  AA:['ɑː'], AE:['æ'], AH:['ʌ'], AO:['ɔː'], AW:['aʊ'], AY:['aɪ'], B:['b'], CH:['tʃ'],
  D:['d'], DH:['ð'], EH:['ɛ'], ER:['ɜː','ɹ'], EY:['eɪ'], F:['f'], G:['ɡ'], HH:['h'],
  IH:['ɪ'], IY:['iː'], JH:['dʒ'], K:['k'], L:['l'], M:['m'], N:['n'], NG:['ŋ'],
  OW:['oʊ'], OY:['ɔɪ'], P:['p'], R:['ɹ'], S:['s'], SH:['ʃ'], T:['t'], TH:['θ'],
  UH:['ʊ'], UW:['uː'], V:['v'], W:['w'], Y:['j'], Z:['z'], ZH:['ʒ'],
};
export function arpabetToPhones(value: string): string[] | null {
  const out: string[] = [];
  for (const token of value.split(/\s+/).filter(Boolean)) {
    const phones = token === 'AH0' ? ['ə'] : token === 'ER0' ? ['ə','ɹ'] : ipa[token.replace(/[012]$/, '')];
    if (!phones) return null; out.push(...phones);
  }
  return out.length ? out : null;
}
export function parseDictionary(raw: string): Map<string, string[][]> {
  const entries = new Map<string, string[][]>();
  for (const line of raw.split('\n')) {
    const match = /^([^\s]+)\s+([^#]+)/.exec(line); if (!match) continue;
    const key = match[1].replace(/\(\d+\)$/, '').toLowerCase();
    const phones = arpabetToPhones(match[2].trim()); if (!phones) continue;
    const variants = entries.get(key) ?? [];
    if (!variants.some(v => v.join(' ') === phones.join(' '))) variants.push(phones);
    entries.set(key, variants);
  }
  return entries;
}
let dictionary: Promise<Map<string, string[][]>> | undefined;
export async function lookupWord(word: string): Promise<Target | null> {
  const key = word.toLowerCase().replace(/’/g, "'");
  const preset = targets.find(t => t.mode === 'english' && t.text === key);
  if (preset) return preset;
  dictionary ??= fetch(appAssetUrl('dictionary/cmudict.dict')).then(async r => {
    if (!r.ok) throw new Error('离线发音词典未能加载，请检查部署文件。');
    const parsed = parseDictionary(await r.text());
    if (parsed.size < 100_000) throw new Error('离线发音词典不完整，请重新部署。');
    return parsed;
  }).catch(e => { dictionary = undefined; throw e; });
  const phones = (await dictionary).get(key);
  if (!phones) return null;
  return { id: `cmu:${key}`, text: key, mode: 'english', phones,
    ipa: phones.map(p => `/${p.join('')}/`).join(' 或 '),
    hint: '美式发音参考。有些词会随句意改变读音，这里列出词典中的常见读法；分数暂不判断重音。' };
}
