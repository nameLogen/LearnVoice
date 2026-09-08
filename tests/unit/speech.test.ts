import { describe, expect, it } from 'vitest';
import { comparePhones, decodeCTC, encodeWav, extractPitch, inspectAudio, normalizeAudio } from '../../src/speech';
import { targets } from '../../src/targets';

describe('recording quality', () => {
  it('rejects silence, short audio, clipping and invalid samples before normalization', () => {
    expect(inspectAudio(new Float32Array(16000)).reason).toContain('太轻');
    expect(inspectAudio(new Float32Array(100)).reason).toContain('太短');
    expect(inspectAudio(new Float32Array(16000).fill(1)).reason).toContain('失真');
    expect(inspectAudio(new Float32Array([NaN])).reason).toContain('损坏');
  });
  it('does not require pitch, so an audible unvoiced consonant is not silence', () => {
    const signal = Float32Array.from({length:8000},(_,i) => Math.sin(i * 2.32) * .08);
    expect(inspectAudio(signal).reason).toBeNull();
  });
  it('normalizes using the pretrained feature-extractor convention', () => {
    const result = normalizeAudio(new Float32Array([1,2,3,4]));
    expect(result.reduce((a,b) => a+b,0)).toBeCloseTo(0);
    expect(result.reduce((a,b) => a+b*b,0)/4).toBeCloseTo(1);
  });
});

describe('CTC labels', () => {
  it('collapses repeats before removing blanks, preserving separate repeated sounds', () => {
    const labels = [1,1,0,1,2,2], logits = labels.flatMap(x => [0,1,2].map(i => x===i ? 8 : -8));
    const phones = decodeCTC(logits,6,3,['<pad>','m','a'],1);
    expect(phones.map(p=>p.token)).toEqual(['m','m','a']);
    expect(phones[0].end).toBeCloseTo(2/6);
    expect(phones[0].confidence).toBeGreaterThan(.99);
  });
  it('accepts the reference sequence but detects a changed final consonant', () => {
    const phone = (token:string) => ({token,confidence:.9,start:0,end:.2});
    expect(comparePhones(targets[0],['k','æ','t'].map(phone)).verdict).toBe('match');
    expect(comparePhones(targets[0],['k','æ','p'].map(phone)).verdict).toBe('different');
    expect(comparePhones(targets[0],[]).verdict).toBe('uncertain');
    expect(comparePhones(targets[0],[{...phone('k'),confidence:.1}]).verdict).toBe('uncertain');
  });
  it('never turns a pinyin phone match into a tone pass', () => {
    for (const target of targets.filter(t=>t.mode==='pinyin')) {
      expect(comparePhones(target,[{token:'m',confidence:1,start:0,end:.1},{token:'a',confidence:1,start:.1,end:.3}]).verdict).toBe('observation');
    }
  });
});

describe('pitch observation and WAV export', () => {
  it('estimates a 220 Hz fixture without inventing a tone grade', () => {
    const signal = Float32Array.from({length:16000},(_,i) => .2*Math.sin(2*Math.PI*220*i/16000));
    const points = extractPitch(signal);
    expect(points.length).toBeGreaterThan(20);
    expect(points[10].hz).toBeCloseTo(220, -1);
    expect(extractPitch(new Float32Array(16000))).toEqual([]);
  });
  it('writes a valid mono PCM16 WAV header and signed samples', async () => {
    const blob = encodeWav(new Float32Array([-1,0,1]));
    const buffer = await blob.arrayBuffer(), view = new DataView(buffer);
    expect(new TextDecoder().decode(buffer.slice(0,4))).toBe('RIFF');
    expect(view.getUint32(24,true)).toBe(16000);
    expect(view.getUint32(40,true)).toBe(6);
    expect(view.getInt16(44,true)).toBe(-32768);
    expect(view.getInt16(48,true)).toBe(32767);
  });
});
