import { useCallback, useEffect, useRef, useState } from "react";
import { synthesize } from "./synthesis";
import { speakOffline, stopSpeech } from "./offlineSpeech";
import type { Preferences } from "./preferences";
export type PlaybackState = "idle" | "loading" | "playing" | "paused";
export function useSpeechPlayer(preferences: Preferences) {
  const [state, setState] = useState<PlaybackState>("idle"),
    [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null),
    token = useRef(0),
    url = useRef(""),
    resolve = useRef<((ok: boolean) => void) | undefined>(undefined),
    paused = useRef(false),
    system = useRef(false);
  const stop = useCallback(() => {
    token.current++;
    paused.current = false;
    if (audio.current) {
      audio.current.pause();
      audio.current.onended = null;
      audio.current.onerror = null;
    }
    resolve.current?.(false);
    resolve.current = undefined;
    setState("idle");
    if (system.current) void stopSpeech();
  }, []);
  const pause = useCallback(() => {
    paused.current = true;
    audio.current?.pause();
    setState((old) => (old === "idle" ? old : "paused"));
    if (system.current) {
      void stopSpeech();
      resolve.current?.(false);
      resolve.current = undefined;
    }
  }, []);
  const resume = useCallback(async () => {
    paused.current = false;
    if (audio.current?.getAttribute("src")) {
      try {
        await audio.current.play();
        setState("playing");
      } catch {
        setError("点击播放按钮再试一次。");
      }
    } else setState("loading");
  }, []);
  useEffect(() => {
    const el = new Audio();
    audio.current = el;
    const hide = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      token.current++;
      el.pause();
      resolve.current?.(false);
      if (url.current) URL.revokeObjectURL(url.current);
      document.removeEventListener("visibilitychange", hide);
      if (system.current) void stopSpeech();
    };
  }, [pause]);
  async function play(
    text: string,
    source?: string,
    voiceOverride?: string,
  ): Promise<boolean> {
    stop();
    const id = token.current;
    setError("");
    setState("loading");
    system.current = false;
    audio.current?.removeAttribute("src");
    try {
      const voice = voiceOverride ?? preferences.voice;
      if (!source && voice.startsWith("system:")) {
        system.current = true;
        setState("playing");
        const done = await speakOffline(text, voice.slice(7), preferences.rate);
        if (id === token.current) setState(done ? "idle" : "paused");
        return done;
      }
      const src =
        source ??
        URL.createObjectURL(await synthesize(text, voice, preferences.rate));
      if (id !== token.current) {
        if (!source) URL.revokeObjectURL(src);
        return false;
      }
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = source ? "" : src;
      const element = audio.current!;
      element.src = src;
      return await new Promise<boolean>((done, reject) => {
        resolve.current = done;
        element.onended = () => {
          if (id !== token.current) return;
          resolve.current = undefined;
          setState("idle");
          done(true);
        };
        element.onerror = () => {
          if (id !== token.current) return;
          resolve.current = undefined;
          setState("idle");
          reject(new Error("音频无法播放，请检查资源文件。"));
        };
        if (paused.current) {
          setState("paused");
          return;
        }
        void element.play().then(() => {
          if (id === token.current) setState("playing");
        }, reject);
      });
    } catch (e) {
      if (id === token.current) {
        setState("idle");
        setError(e instanceof Error ? e.message : "播放失败，请重试。");
      }
      return false;
    }
  }
  return {
    state,
    error,
    play,
    pause,
    resume,
    stop,
    system: preferences.voice.startsWith("system:"),
  };
}
