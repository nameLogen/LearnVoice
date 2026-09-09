import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { scorePronunciation, previousComparable, SCORE_VERSION } from '../../src/scoring';
import { decodeCTC } from '../../src/speech';
import { targets } from '../../src/targets';
import type { Observation, Phone } from '../../src/types';
import catalog from '../../public/references/catalog.json';
const quality={duration:1,rmsDb:-20,peak:.5,clipping:0,reason:null};
const phones=(values:string[],confidence=.9):Phone[]=>values.map((token,i)=>({token,confidence,start:i*.1,end:(i+1)*.1}));
const target=targets[0];
const score=(values:string[])=>scorePronunciation(target,phones(values),quality);

describe('experimental phoneme proximity',()=>{
  it('gives partial credit while identifying the changed or missing sound',()=>{
    expect(score(['k','æ','t']).value).toBe(100);
    const similarVowel=score(['k','ɛ','t']),wrongWord=score(['ʃ','ɪ','p']),missing=score(['k','æ']);
    expect(similarVowel.value!).toBeGreaterThan(wrongWord.value!);
    expect(similarVowel.value!).toBeLessThan(100);
    expect(similarVowel.tip).toContain('/æ/ 的位置听到 /ɛ/');
    expect(missing.steps).toContainEqual({expected:'t',actual:null,similarity:0});
    expect(missing.value!).toBeGreaterThan(0);
    const extra=score(['k','æ','t','ə']);
    expect(extra.steps).toContainEqual({expected:null,actual:'ə',similarity:0});
    expect(extra.tip).toContain('多听到了');
    expect(score(['k','æ','p']).value!).toBeLessThan(100);
  });
  it('accepts configured variants without treating confidence as a pronunciation score',()=>{
    const sheep=targets.find(t=>t.id==='sheep')!;
    expect(scorePronunciation(sheep,phones(['ʃ','i','p'],.4),quality).value).toBe(100);
    expect(scorePronunciation(sheep,phones(['ʃ','iː','p']),quality).value).toBe(100);
    expect(scorePronunciation(sheep,phones(['ʃ','ɪ','p']),quality).value!).toBeLessThan(100);
  });
  it('withholds numbers for silence, unknowns, unstable labels and unimplemented tones',()=>{
    expect(scorePronunciation(target,phones(['k','æ','t']),{...quality,reason:'静音'}).value).toBeNull();
    expect(scorePronunciation(target,phones(['k','æ','t'],.1),quality).value).toBeNull();
    expect(scorePronunciation(target,phones(['k','æ','t'],NaN),quality).value).toBeNull();
    expect(score(['k','<unk>','t']).value).toBeNull();
    expect(score([]).value).toBeNull();
    for(const t of targets.filter(t=>t.mode==='pinyin')) expect(scorePronunciation(t,phones(['m','a']),quality).value).toBeNull();
    const logits=[0,8,0,0,0,8,8,0,0];
    expect(decodeCTC(logits,3,3,['<pad>','k','<unk>'],1).map(p=>p.token)).toEqual(['k','<unk>']);
  });
  it('never compares with a later attempt, another engine or another score version',()=>{
    const observation=(id:string):Observation=>({id,createdAt:id,target,quality,pitch:[],phones:phones(['k','æ','t']),elapsedMs:10,engine:'test',modelRevision:'model1',verdict:'match',explanation:'',parentLabel:null,note:'',score:score(['k','æ','t'])});
    const current=observation('current'),previous=observation('previous');
    const history=[observation('future'),current,{...previous,id:'other-engine',engine:'different'},{...previous,id:'other-model',modelRevision:'different'},{...previous,id:'old-score',score:{...previous.score!,version:'older'}},previous];
    expect(previousComparable(current,history)?.id).toBe('previous');
    expect(previousComparable(previous,history)).toBeUndefined();
    expect(previous.score?.version).toBe(SCORE_VERSION);
  });
});

it('bundles a licensed, hash-verified reference for every target',()=>{
  for(const t of targets){
    const reference=catalog[t.id as keyof typeof catalog];
    expect(reference).toBeDefined();
    expect(reference.author).toBeTruthy();expect(reference.licenseUrl).toMatch(/^https:/);
    const bytes=readFileSync(`public${reference.path}`);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(reference.sha256);
    expect(bytes.subarray(0,4).toString()).toMatch(/OggS|RIFF/);
  }
});
