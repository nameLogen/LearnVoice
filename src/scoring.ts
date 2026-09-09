import { canonicalPhone } from './speech';
import type { Observation, Phone, Quality, Target } from './types';

export const SCORE_VERSION = 'phone-distance-v1';
export interface SoundStep {
  expected: string | null;
  actual: string | null;
  similarity: number;
}
export interface PracticeScore {
  version: string;
  value: number | null;
  reason: string;
  steps: SoundStep[];
  tip: string;
}

// Small IPA feature inventory for this lesson set. Distances are experimental
// engineering weights, not probabilities or a clinically/educationally calibrated scale.
// Vowels: height (0 close..6 open), backness (0 front..4 back), rounding.
const vowels: Record<string, number[]> = {
  i:[0,0,0], ɪ:[1,1,0], e:[2,0,0], ɛ:[4,0,0], æ:[5,0,0],
  a:[6,0,0], ɑ:[6,4,0], ɐ:[5,2,0], ʌ:[4,4,0], ə:[3,2,0],
  ɜ:[4,2,0], u:[0,4,1], ʊ:[1,3,1], o:[2,4,1], ɔ:[4,4,1],
};
// Consonants: place, manner, voicing. No numeric ordering of place/manner.
const consonants: Record<string, string[]> = {
  p:['bilabial','stop','0'], b:['bilabial','stop','1'],
  t:['alveolar','stop','0'], d:['alveolar','stop','1'],
  k:['velar','stop','0'], ɡ:['velar','stop','1'],
  f:['labiodental','fricative','0'], v:['labiodental','fricative','1'],
  s:['alveolar','fricative','0'], z:['alveolar','fricative','1'],
  ʃ:['postalveolar','fricative','0'], ʒ:['postalveolar','fricative','1'],
  θ:['dental','fricative','0'], ð:['dental','fricative','1'],
  h:['glottal','fricative','0'], m:['bilabial','nasal','1'],
  n:['alveolar','nasal','1'], ŋ:['velar','nasal','1'],
  l:['alveolar','lateral','1'], ɹ:['alveolar','approximant','1'],
  w:['labiovelar','approximant','1'], j:['palatal','approximant','1'],
};
const tips: Record<string,string> = {
  æ:'试着把嘴张开一些，舌头靠前；对照 cat 的中间音，不要读成字母 A。',
  ɪ:'轻松、短促地读 ship 中间的音；不要只把 sheep 的长音缩短。',
  i:'对照 sheep 的中间音，舌位较高、较靠前；同时听音色，不只听长短。',
  'iː':'对照 sheep 的中间音，舌位较高、较靠前；同时听音色，不只听长短。',
  ʃ:'双唇稍微向前，轻轻送气，像提醒安静的 sh；后面不加“呃”。',
  s:'牙齿轻轻靠近，让气流从中间通过；对照 /s/ 和 /ʃ/ 的声音。',
  p:'双唇先合拢再放开；词尾不要额外加“坡”或“呃”。',
  t:'舌尖轻碰上齿后方再放开；词尾不需要额外加元音。',
  k:'舌后部抬起再放开，让气流出来；不要读字母 K 的名称。',
  m:'双唇合拢，轻轻哼出声音，再接下一个音。',
  n:'舌尖轻碰上齿后方，让声音从鼻腔出来。',
  ʌ:'对照 sun 的中间音，嘴唇放松，不要噘圆。',
  ɐ:'对照 sun 的中间音，嘴唇放松，不要噘圆。',
};

function soundCost(left: string, right: string): number {
  if (left === right) return 0;
  const a = left.replace(/ː/g,''), b = right.replace(/ː/g,'');
  if (a === b) return .2;
  if (vowels[a] && vowels[b]) {
    const va=vowels[a], vb=vowels[b];
    return Math.min(1, .25 + .45*Math.abs(va[0]-vb[0])/6 + .2*Math.abs(va[1]-vb[1])/4 + .1*Math.abs(va[2]-vb[2]));
  }
  if (consonants[a] && consonants[b]) {
    const ca=consonants[a], cb=consonants[b];
    return Math.min(1, .25 + (ca[0]!==cb[0] ? .3 : 0) + (ca[1]!==cb[1] ? .3 : 0) + (ca[2]!==cb[2] ? .15 : 0));
  }
  return 1;
}

function align(expected: string[], actual: string[]) {
  const costs = Array.from({length:expected.length+1},()=>new Array<number>(actual.length+1).fill(0));
  for(let i=0;i<=expected.length;i++) costs[i][0]=i;
  for(let j=0;j<=actual.length;j++) costs[0][j]=j;
  for(let i=1;i<=expected.length;i++) for(let j=1;j<=actual.length;j++) {
    costs[i][j]=Math.min(costs[i-1][j]+1,costs[i][j-1]+1,costs[i-1][j-1]+soundCost(expected[i-1],actual[j-1]));
  }
  const steps: SoundStep[]=[];
  let i=expected.length,j=actual.length;
  while(i || j) {
    if(i && j && Math.abs(costs[i][j]-costs[i-1][j-1]-soundCost(expected[i-1],actual[j-1]))<1e-8) {
      const cost=soundCost(expected[i-1],actual[j-1]);
      steps.unshift({expected:expected[--i],actual:actual[--j],similarity:Math.round(100*(1-cost))});
    } else if(i && Math.abs(costs[i][j]-costs[i-1][j]-1)<1e-8) {
      steps.unshift({expected:expected[--i],actual:null,similarity:0});
    } else steps.unshift({expected:null,actual:actual[--j],similarity:0});
  }
  const value=Math.max(0,Math.round(100*(1-costs[expected.length][actual.length]/Math.max(expected.length,actual.length,1))));
  return {value,steps};
}

export function scorePronunciation(target: Target, phones: Phone[], quality: Quality): PracticeScore {
  const unavailable=(reason:string):PracticeScore=>({version:SCORE_VERSION,value:null,reason,steps:[],tip:'先听示范，再自然读一遍。'});
  if(quality.reason) return unavailable(quality.reason);
  if(target.mode==='pinyin') return unavailable('拼音声调还没有可靠评分；请听四声示范，并结合回放和音高曲线观察。');
  if(!phones.length) return unavailable('没有听清可用音素，这次不计分。');
  if(phones.length>40 || phones.some(p=>!Number.isFinite(p.confidence) || p.confidence<.2 || p.confidence>1) || phones.reduce((s,p)=>s+p.confidence,0)/phones.length<.35) return unavailable('模型对部分声音不确定，这次不计分，请靠近麦克风重试。');
  const actual=phones.map(p=>canonicalPhone(p.token));
  if(actual.some(p=>!p || p.includes('<'))) return unavailable('模型输出包含未知音，暂不计分。');
  const variants=target.phones.filter(p=>p.length).map(p=>align(p.map(canonicalPhone),actual));
  if(!variants.length) return unavailable('这道题尚未配置比较目标。');
  const best=variants.reduce((a,b)=>b.value>a.value?b:a);
  const weakest=best.steps.reduce((a,b)=>b.similarity<a.similarity?b:a);
  const tip=best.value===100 ? '这一遍模型识别的音素已对齐。再听示范和自己的录音，留意音色；100 不代表标准发音。'
    : !weakest.expected ? `模型多听到了 /${weakest.actual}/，回放确认有没有在词尾加一个额外的声音。`
    : `${weakest.actual ? `模型在 /${weakest.expected}/ 的位置听到 /${weakest.actual}/。` : `模型没有听到 /${weakest.expected}/。`}${tips[weakest.expected] ?? '先听示范，再单独练这个音，最后接回整个单词。'}`;
  return {version:SCORE_VERSION,...best,reason:'根据识别音素与目标音素的距离估算，不是发音准确率。',tip};
}

export function previousComparable(current: Observation, history: Observation[]): Observation | undefined {
  const index=history.findIndex(o=>o.id===current.id);
  return (index<0?history:history.slice(index+1)).find(o=>
    o.id!==current.id && o.target.id===current.target.id && o.modelRevision===current.modelRevision &&
    o.engine===current.engine && JSON.stringify(o.target.phones)===JSON.stringify(current.target.phones) &&
    o.score?.version===current.score?.version && typeof o.score?.value==='number');
}
