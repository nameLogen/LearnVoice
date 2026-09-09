import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {sounds} from '../src/learning.ts';
const catalog=JSON.parse(await readFile('public/sounds/catalog.json','utf8'));
const words={ua:'tour',oi:'boy',ou:'oh',dz:'beds',dr:'draw'};
for(const[id,word]of Object.entries(words)){
 const path=`sounds/${id}.wav`;await copyFile(`artifacts/sources/word-demos/formant-${id}.wav`,'public/'+path);
 catalog[id]={path,kind:'synthesized-word',label:`合成词例 ${word} · 注意目标声音`,source:'https://github.com/xenova/phonemizer.js/tree/6835144b7ee9043129222549c1ed2f6a27216278',author:'Generated using eSpeak NG (en-gb)',license:'Generated speech; eSpeak NG engine GPL-3.0-or-later',licenseUrl:'https://www.gnu.org/licenses/gpl-3.0.html',changes:`固定词例 ${word}，eSpeak NG formant synthesis，rate 130；无神经模型自由生成，无人类录音。`,sha256:createHash('sha256').update(await readFile('public/'+path)).digest('hex')};
}
for(const s of sounds){const a=catalog[s.id];if(a.kind==='sound')a.label=s.kind==='vowel'?'真人元音参考':'真人音节参考（可能含衬元音）';else if(a.kind==='word')a.label=`真人词例 ${a.source.match(/En-(?:us|uk)-(.+)\.ogg/)?.[1]??s.words[0]} · 注意目标声音`;}
await writeFile('public/sounds/catalog.json',JSON.stringify(catalog,null,2)+'\n');
await writeFile('public/sounds/ATTRIBUTION.md','# 音标示范来源\n\n43 项真人参考、5 项可控合成词例。真人语音学录音可能带衬元音；词例不等于孤立音素，应用在播放处明确显示。神经朗读模型不用于这些固定音标素材。\n\n'+sounds.map(s=>{const a=catalog[s.id];return `## /${s.symbol}/\n\n- 文件：${a.path}\n- 作者：${a.author}\n- 来源：${a.source}\n- 授权：${a.license} (${a.licenseUrl})\n- 处理：${a.changes}\n- SHA-256：${a.sha256}\n`;}).join('\n'));
console.log(Object.values(catalog).reduce((r,a)=>(r[a.kind]=(r[a.kind]??0)+1,r),{}));
