import { Capacitor, registerPlugin } from '@capacitor/core';
import type { RawInference } from './types';

interface VoiceLabPlugin {
  startRecording(): Promise<void>;
  stopRecording(): Promise<{ samples: number[] }>;
  cancelRecording(): Promise<void>;
  prepare(): Promise<{ engine: string }>;
  analyse(options: { samples: number[] }): Promise<RawInference>;
  exportFile(options: { name: string; content: string }): Promise<void>;
}
export const VoiceLab = registerPlugin<VoiceLabPlugin>('VoiceLab');
export const isAndroid = Capacitor.getPlatform() === 'android';
