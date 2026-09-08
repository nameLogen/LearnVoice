export type Mode = 'english' | 'phoneme' | 'pinyin';
export type Verdict = 'match' | 'different' | 'uncertain' | 'observation';
export interface Target {
  id: string; mode: Mode; text: string; ipa: string; phones: string[][]; hint: string;
}
export interface Phone { token: string; confidence: number; start: number; end: number }
export interface RawInference { phones: Phone[]; elapsedMs: number; engine: string }
export interface Quality {
  duration: number; rmsDb: number; peak: number; clipping: number;
  reason: string | null;
}
export interface PitchPoint { time: number; hz: number }
export interface Observation {
  id: string; createdAt: string; target: Target; quality: Quality; pitch: PitchPoint[];
  phones: Phone[]; elapsedMs: number; engine: string; modelRevision: string;
  verdict: Verdict; explanation: string;
  parentLabel: 'correct' | 'incorrect' | 'unsure' | null;
  note: string;
}
