import {readFile,writeFile} from 'node:fs/promises';
const original=await readFile('artifacts/sources/espeakng.worker.js','utf8');
// The upstream phonemizer build leaves the optional audio callback-table
// helpers out. Restore them only in this build-time copy, not in the app.
const support=`
var ev;
function addFunction(fn){
 const id=wasmTable.length;wasmTable.grow(1);wasmTable.set(id,fn);return id;
}
function removeFunction(id){wasmTable.set(id,null);}
`;
await writeFile('artifacts/sources/espeak-audio.mjs',original+support);
const {default:Module}=await import('../artifacts/sources/espeak-audio.mjs');
await new Promise(resolve=>{if(Module.calledRun)resolve();else Module.onRuntimeInitialized=resolve;});
const engine=new Module.eSpeakNGWorker();engine.set_voice('en-gb');engine.set_rate(130);
const definitions={ua:'tour',oi:'boy',ou:'oh',dz:'beds',dr:'draw',au:'ow'};
for(const[id,phone]of Object.entries(definitions)){
 const parts=[];engine.synthesize(phone,pcm=>{parts.push(pcm);return false;});const count=parts.reduce((n,p)=>n+p.length/2,0),rate=engine.get_samplerate(),buffer=Buffer.alloc(44+count*2);buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVE',8);buffer.write('fmt ',12);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(count*2,40);let index=0;for(const p of parts)for(let n=0;n<p.length;n+=2)buffer.writeInt16LE(Math.round(p[n]*32767),44+2*index++);
 await writeFile(`artifacts/sources/word-demos/formant-${id}.wav`,buffer);console.log(JSON.stringify({id,phone,seconds:count/rate,ipa:engine.synthesize_ipa(phone).ipa}));
}
