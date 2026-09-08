import type { Observation } from './types';
import { isAndroid, VoiceLab } from './native';
const KEY = 'voice-lab-observations-v1';
export function loadObservations(): Observation[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Observation => !!item && typeof item.id === 'string' && !!item.target && Array.isArray(item.phones) && !!item.quality && typeof item.createdAt === 'string').slice(0, 200);
  } catch { return []; }
}
export function saveObservations(items: Observation[]) { localStorage.setItem(KEY, JSON.stringify(items.slice(0, 200))); }
export async function exportObservations(items: Observation[]) {
  const content = JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), description: '实验性音素序列比较，不是教学评分。未包含原始录音。', observations: items }, null, 2);
  const name = `voice-lab-${new Date().toISOString().slice(0,10)}.json`;
  if (isAndroid) { await VoiceLab.exportFile({ name, content }); return; }
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
