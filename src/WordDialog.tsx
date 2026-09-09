import { useEffect, useRef, useState } from "react";
import { Volume2, Square } from "lucide-react";
import { Dialog } from "./Dialog";
import { findEntry, meanings, displayIpa, type WordEntry } from "./lexicon";
import { lookupWord } from "./dictionary";
import { ReadingPractice } from "./ReadingPractice";
import { useSpeechPlayer } from "./useSpeechPlayer";
import { appAssetUrl } from "./assets";
import catalog from "../public/references/catalog.json";
import type { Preferences } from "./preferences";
import type { Observation, Target } from "./types";

export function WordDialog({
  word,
  context,
  preferences,
  onClose,
  onObservation,
  onBusy,
}: {
  word: string;
  context?: string;
  preferences: Preferences;
  onClose(): void;
  onObservation(o: Observation): void;
  onBusy(b: boolean): void;
}) {
  const [entry, setEntry] = useState<WordEntry | null>(null),
    [target, setTarget] = useState<Target | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const player = useSpeechPlayer(preferences),
    panel = useRef<HTMLDivElement>(null);
  const defs = meanings(entry);
  const reference = ["cat", "cap", "ship", "sheep", "map", "sun"].includes(
    word.toLowerCase(),
  )
    ? catalog[word.toLowerCase() as keyof typeof catalog]
    : undefined;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.allSettled([findEntry(word), lookupWord(word)])
      .then(([e, t]) => {
        if (!active) return;
        if (e.status === "fulfilled") setEntry(e.value);
        if (t.status === "fulfilled") setTarget(t.value);
        if (e.status === "rejected" || t.status === "rejected")
          setError("部分词典资源未能加载，请关闭后重试。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [word]);
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  const pronunciation = () => {
    panel.current?.querySelector("audio")?.pause();
    return player.play(
      word,
      reference ? appAssetUrl(reference.path) : undefined,
    );
  };
  return (
    <Dialog title="单词学习" busy={busy} onClose={onClose}>
      <div ref={panel} className="word-content">
        <div className="word-title">
          <h2 lang="en">{word}</h2>
          <button
            className="sound-button"
            disabled={busy}
            aria-label={
              player.state === "playing" ? "停止单词发音" : "播放单词发音"
            }
            onClick={() =>
              player.state === "playing" ? player.stop() : void pronunciation()
            }
          >
            {player.state === "playing" ? (
              <Square size={22} />
            ) : (
              <Volume2 size={24} />
            )}
          </button>
        </div>
        <div className="pronunciations">
          {entry?.ipa && <span>词典 /{displayIpa(entry.ipa)}/</span>}
          {target && <span>美式 {target.ipa}</span>}
        </div>
        <p className="small-caption">
          {player.state === "loading"
            ? "正在准备离线声音…"
            : reference
              ? "真人示范 · 美式"
              : preferences.voice.startsWith("b")
                ? "离线合成 · 英式"
                : "离线合成朗读"}
        </p>
        {loading ? (
          <p role="status">正在查询…</p>
        ) : defs.length ? (
          <div className="definitions">
            {defs.slice(0, 2).map((d, i) => (
              <p key={i}>
                <span>{d.pos}</span>
                {d.text}
              </p>
            ))}
            {defs.length > 2 && (
              <details>
                <summary>更多释义</summary>
                {defs.slice(2).map((d, i) => (
                  <p key={i}>
                    <span>{d.pos}</span>
                    {d.text}
                  </p>
                ))}
              </details>
            )}
          </div>
        ) : (
          <p className="empty-note">词库暂未收录释义，可继续听读和录音。</p>
        )}
        {context && (
          <details className="word-context">
            <summary>在句子中看一看</summary>
            <p lang="en">{context}</p>
          </details>
        )}
        {entry?.exchange && (
          <details className="word-context">
            <summary>词形变化</summary>
            <p>
              {entry.exchange
                .split("/")
                .map((s) => {
                  const [code, value] = s.split(":");
                  return `${({ p: "过去式", d: "过去分词", i: "现在分词", "3": "第三人称单数", s: "复数", r: "比较级", t: "最高级", "0": "原形" } as Record<string, string>)[code] ?? "变化"}：${value}`;
                })
                .join("；")}
            </p>
          </details>
        )}
        {(error || player.error) && (
          <p className="error" role="alert">
            {error || player.error}
          </p>
        )}
        {!loading && (
          <ReadingPractice
            key={word}
            text={word}
            target={target}
            word
            beforeRecord={async () => player.stop()}
            onBusy={setBusy}
            onObservation={onObservation}
          />
        )}
      </div>
    </Dialog>
  );
}
