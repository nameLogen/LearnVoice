import {readFile} from 'node:fs/promises';
import {sounds,phonics} from '../src/learning.ts';
const words=[...new Set([...sounds,...phonics].flatMap(s=>s.words))];
for(const w of words){const entries=JSON.parse(await readFile(`public/lexicon/${w.replace(/[^a-z]/g,'').slice(0,2).padEnd(2,'_')}.json`));const e=entries.find(e=>e.word===w);const first=e?.translation.split('\n')[0];if(!first||/^(abbr|pl|s)\./.test(first)||(!/^(n|v|vt|vi|a|adj|ad|adv|pron|prep|conj|interj|num|art|det|aux|modal)\./.test(first)&&!e.pos))console.log(JSON.stringify(e));}
