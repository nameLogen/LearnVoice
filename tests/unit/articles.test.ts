import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { articleParts, decodeLibrary, starterArticle, validateArticle, wordPieces } from '../../src/articles';
import { arpabetToPhones, parseDictionary } from '../../src/dictionary';

describe('article content and backups', () => {
  it('preserves contractions, punctuation, repeated words and paragraph identity', () => {
    const parts = articleParts('Mr. Smith says, “Don’t go!”\r\n\r\nThe cat sees the cat.');
    expect(parts).toHaveLength(2);
    expect(parts[1].sentences[0].id).toBe('p1s0');
    const text = 'Don’t re-read <script>alert(1)</script>. cat cat';
    const tokens = wordPieces(text);
    expect(tokens.map(t => t.text).join('')).toBe(text);
    expect(tokens.filter(t => t.word).map(t => t.text)).toContain('Don’t');
    expect(tokens.filter(t => t.text === 'cat')).toHaveLength(2);
  });
  it('bounds long unpunctuated text and never loses its words', () => {
    const original = Array.from({length:100}, (_,i) => `word${i}`).join(' ');
    const parts = articleParts(original)[0].sentences;
    expect(parts.length).toBeGreaterThan(5);
    expect(parts.map(s => s.text).join(' ')).toBe(original);
    for (const s of parts) expect(s.text.split(' ').length).toBeLessThanOrEqual(18);
    expect(articleParts('a'.repeat(900))[0].sentences.every(s => s.text.length <= 300)).toBe(true);
  });
  it('rejects invalid backups and limits size without silently replacing data', () => {
    expect(() => validateArticle('hello', 'a'.repeat(30001))).toThrow();
    expect(() => decodeLibrary('{}')).toThrow();
    expect(() => decodeLibrary(JSON.stringify([starterArticle, starterArticle]))).toThrow();
    const restored = decodeLibrary(JSON.stringify([{...starterArticle, completed:['p0s0','p0s0','missing',null]}]));
    expect(restored[0].completed).toEqual(['p0s0']);
    expect(decodeLibrary('[]')).toEqual([]);
  });
});

describe('bundled pronunciation dictionary', () => {
  it('verifies the pinned source and covers new words with multiple readings', () => {
    const raw = readFileSync('public/dictionary/cmudict.dict');
    expect(createHash('sha256').update(raw).digest('hex')).toBe('81917843c7f44ce2b094ac63873c2c7a4cf802040792c455ba3ca406891c3d22');
    const dictionary = parseDictionary(raw.toString('utf8'));
    expect(dictionary.size).toBeGreaterThan(100000);
    expect(dictionary.get('elephant')).toContainEqual(['ɛ','l','ə','f','ə','n','t']);
    expect(dictionary.get('read')).toContainEqual(['ɹ','iː','d']);
    expect(dictionary.get('read')).toContainEqual(['ɹ','ɛ','d']);
    expect(dictionary.get('qzxxnewword')).toBeUndefined();
    expect(dictionary.has('constructor')).toBe(true);
  });
  it('keeps schwa distinct from stressed vowels and rejects unknown symbols', () => {
    expect(arpabetToPhones('AH0 AH1 CH OY1')).toEqual(['ə','ʌ','tʃ','ɔɪ']);
    expect(arpabetToPhones('AE1 INVALID')).toBeNull();
  });
});
