import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { startRecorder, type Recorder } from "./audio";
import { analyse } from "./inference";
import { comparePhones, encodeWav, inspectAudio, extractPitch } from "./speech";
import { releaseSpeechEngine } from "./synthesis";
import { scorePronunciation } from "./scoring";
import { ScoreCard } from "./ScoreCard";
import { loadObservations } from "./storage";
import manifest from "../models/manifest.json";
import type { Observation, Target } from "./types";

export function ReadingPractice({
  text,
  target,
  word,
  beforeRecord,
  onBusy,
  onObservation,
  onComplete,
}: {
  text: string;
  target: Target | null;
  word: boolean;
  beforeRecord(): Promise<void>;
  onBusy(busy: boolean): void;
  onObservation(observation: Observation): void;
  onComplete?(): void;
}) {
  const [phase, setPhase] = useState<
    "idle" | "requesting" | "recording" | "stopping" | "analysing"
  >("idle");
  const [clip, setClip] = useState<Float32Array | null>(null);
  const [url, setUrl] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Observation | null>(null);
  const active = useRef<Recorder | null>(null),
    generation = useRef(0);
  const audio = useRef<HTMLAudioElement>(null);
  const lock = useRef(false);
  const limit = word ? 5 : 30;
  const busy = phase !== "idle";
  const quality = clip ? inspectAudio(clip) : null;

  useEffect(() => {
    onBusy(busy);
  }, [busy, onBusy]);
  useEffect(() => {
    if (!clip) {
      setUrl("");
      return;
    }
    const url = URL.createObjectURL(encodeWav(clip));
    setUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [clip]);
  useEffect(() => {
    const player = audio.current;
    const hide = () => {
      if (!document.hidden) return;
      generation.current++;
      player?.pause();
      const recorder = active.current;
      active.current = null;
      if (recorder) void recorder.cancel();
      lock.current = false;
      setPhase("idle");
      setError("切到后台已停止本次操作，请重新开始。");
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      generation.current++;
      player?.pause();
      void active.current?.cancel();
      onBusy(false);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [onBusy]);
  useEffect(() => {
    if (phase !== "recording") return;
    const start = performance.now();
    const tick = setInterval(
      () => setSeconds((performance.now() - start) / 1000),
      100,
    );
    const timer = setTimeout(() => void stop(true), limit * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, [phase]);

  async function record() {
    if (lock.current) return;
    lock.current = true;
    const token = ++generation.current;
    setPhase("requesting");
    setError("");
    setClip(null);
    setResult(null);
    setSeconds(0);
    audio.current?.pause();
    try {
      await beforeRecord();
      if (token !== generation.current) return;
      const recorder = await startRecorder(() => {}, limit);
      if (token !== generation.current || document.hidden) {
        await recorder.cancel();
        return;
      }
      active.current = recorder;
      setPhase("recording");
    } catch (e) {
      if (token === generation.current) {
        lock.current = false;
        setPhase("idle");
        setError(
          e instanceof Error ? e.message : "无法录音，请检查麦克风权限。",
        );
      }
    }
  }
  async function stop(timedOut = false) {
    const recorder = active.current;
    if (!recorder) return;
    const token = generation.current;
    active.current = null;
    setPhase("stopping");
    try {
      const samples = await recorder.stop();
      if (token === generation.current) {
        setClip(samples);
        if (timedOut)
          setError(`已达到 ${limit} 秒，录音自动结束；如未读完，请重新录制。`);
        if (word && target) await evaluate(samples, token);
      }
    } catch (e) {
      if (token === generation.current)
        setError(e instanceof Error ? e.message : "录音失败。");
    } finally {
      if (token === generation.current) {
        lock.current = false;
        setPhase("idle");
      }
    }
  }
  async function evaluate(samples = clip, existingToken?: number) {
    if (!samples || !target || (lock.current && existingToken === undefined))
      return;
    lock.current = true;
    setPhase("analysing");
    setError("");
    audio.current?.pause();
    const token = existingToken ?? ++generation.current;
    try {
      await beforeRecord();
      releaseSpeechEngine();
      if (token !== generation.current) return;
      const quality = inspectAudio(samples);
      const raw = quality.reason
        ? { phones: [], elapsedMs: 0, engine: "录音质量检查" }
        : await analyse(samples);
      if (token !== generation.current) return;
      const comparison = quality.reason
        ? { verdict: "uncertain" as const, explanation: quality.reason }
        : comparePhones(target, raw.phones);
      const observation: Observation = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        target,
        quality,
        pitch: target.mode === "pinyin" ? extractPitch(samples) : [],
        ...raw,
        ...comparison,
        modelRevision: manifest.revision,
        parentLabel: null,
        note: "文章点词练习",
        score: scorePronunciation(target, raw.phones, quality),
      };
      setResult(observation);
      onObservation(observation);
    } catch (e) {
      if (token === generation.current)
        setError(e instanceof Error ? e.message : "分析失败，请重试。");
    } finally {
      if (token === generation.current) {
        lock.current = false;
        setPhase("idle");
      }
    }
  }

  return (
    <div className="reading-practice">
      <p className="muted-small">
        {word ? "录音结束后自动分析" : "跟读短句"} · 最多 {limit} 秒
      </p>
      {!word && (
        <p className="practice-prompt" lang="en">
          {text}
        </p>
      )}
      <div className="reading-actions">
        <button
          className="primary"
          disabled={busy && phase !== "recording"}
          onClick={() => (phase === "recording" ? void stop() : void record())}
        >
          {phase === "recording" ? <Square size={17} /> : <Mic size={17} />}
          {phase === "recording"
            ? "结束跟读录音"
            : phase === "requesting"
              ? "正在开启麦克风…"
              : clip
                ? "再读一次"
                : "开始跟读录音"}
        </button>
        <span role="status">
          {phase === "recording"
            ? `${seconds.toFixed(1)} 秒`
            : phase === "analysing"
              ? "正在本机分析…"
              : phase === "stopping"
                ? "正在准备回放…"
                : clip
                  ? `已录 ${(clip.length / 16000).toFixed(1)} 秒`
                  : ""}
        </span>
      </div>
      <audio
        ref={audio}
        aria-label="跟读录音回放"
        controls={!!url}
        src={url || undefined}
        onPlay={() => {
          if (lock.current) {
            audio.current?.pause();
            return;
          }
          void beforeRecord().catch(() => audio.current?.pause());
        }}
      />
      {error && (
        <p className="reference-error" role="alert">
          {error}
        </p>
      )}
      {quality?.reason && <p className="reference-error">{quality.reason}</p>}
      {word && (
        <>
          {clip && target && !result && !busy && (
            <button className="text-button" onClick={() => void evaluate()}>
              重新分析
            </button>
          )}
          {!target && (
            <p className="muted-small">
              词典未收录，暂不自动评分。可以听示范并回放自己的声音。
            </p>
          )}
          {result && (
            <ScoreCard observation={result} history={loadObservations()} />
          )}
          {result?.target.mode === "pinyin" && result.pitch.length > 3 && (
            <div className="tone-chart">
              <svg
                viewBox="0 0 300 90"
                aria-label="本次发音音高曲线"
                role="img"
              >
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  points={result.pitch
                    .map(
                      (p) =>
                        `${(p.time / result.quality.duration) * 300},${85 - (Math.min(650, Math.max(70, p.hz)) / 650) * 75}`,
                    )
                    .join(" ")}
                />
              </svg>
              <small>音高变化供家长观察，不判断声调是否正确。</small>
            </div>
          )}
        </>
      )}
      {!word && (
        <>
          <p className="muted-small">
            这一版保存跟读进度，不评判整句是否读对。
          </p>
          <button
            className="model-button"
            disabled={!clip || !!quality?.reason || busy}
            onClick={() => {
              audio.current?.pause();
              onComplete?.();
            }}
          >
            这一句练好了，继续 →
          </button>
        </>
      )}
    </div>
  );
}
