import { useEffect, useRef, useState } from "react";
import { sounds } from "./learning";
import {
  inspectTeachingFile,
  localSounds,
  saveLocalSound,
  type LocalSound,
} from "./soundAudio";

export function SoundAudioSettings({
  beforePreview,
  otherAudioActive,
}: {
  beforePreview(): void;
  otherAudioActive: boolean;
}) {
  const [id, setId] = useState(sounds[0].id);
  const [saved, setSaved] = useState<Record<string, LocalSound>>({});
  const [draft, setDraft] = useState<LocalSound | null>(null);
  const [speaker, setSpeaker] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [heard, setHeard] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLAudioElement>(null);
  const generation = useRef(0);
  const selected = draft ?? saved[id];
  useEffect(() => {
    if (otherAudioActive) preview.current?.pause();
  }, [otherAudioActive]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) preview.current?.pause();
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => {
    let live = true;
    void localSounds()
      .then((v) => {
        if (live) setSaved(v);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    const next = selected ? URL.createObjectURL(selected.blob) : "";
    setUrl(next);
    return () => {
      if (next) URL.revokeObjectURL(next);
    };
  }, [selected]);
  async function choose(file?: File) {
    const token = ++generation.current;
    preview.current?.pause();
    setDraft(null);
    setHeard(false);
    setError("");
    setMessage("");
    if (!file) return;
    setBusy(true);
    try {
      const duration = await inspectTeachingFile(file);
      if (token === generation.current)
        setDraft({
          id,
          blob: file,
          filename: file.name,
          speaker: "",
          duration,
        });
    } catch (e) {
      if (token === generation.current)
        setError(e instanceof Error ? e.message : "读取录音失败。");
    } finally {
      if (token === generation.current) setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function save(remove = false) {
    preview.current?.pause();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const value = remove
        ? null
        : { ...draft!, speaker: speaker.trim() || "自备真人录音" };
      await saveLocalSound(id, value);
      setSaved((old) => {
        const next = { ...old };
        if (value) next[id] = value;
        else delete next[id];
        return next;
      });
      setDraft(null);
      setHeard(false);
      setMessage(remove ? "已移除本机示范。" : "已保存，可在音标页离线播放。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="setting-details sound-import"
      onToggle={(e) => {
        if (!e.currentTarget.open) preview.current?.pause();
      }}
    >
      <summary>
        音标教学录音 · 本机已导入 {Object.keys(saved).length} / 48
      </summary>
      <p>
        音标示范使用独立录音，不受上方朗读声音和语速影响。旧版参考音已停用，内置合格录音暂缺。
      </p>
      <p>
        可导入自己录制或获准使用的英式教学录音。每个文件只读目标音一次；辅音组合连读，避免整词、讲解和多余元音。
      </p>
      <label className="setting-row">
        选择音标
        <select
          aria-label="导入录音的音标"
          disabled={busy}
          value={id}
          onChange={(e) => {
            preview.current?.pause();
            setId(e.target.value);
            setDraft(null);
            setHeard(false);
            setError("");
            setMessage("");
          }}
        >
          {sounds.map((s) => (
            <option key={s.id} value={s.id}>
              /{s.symbol}/ · {s.group}
              {saved[s.id] ? " · 已导入" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="setting-row">
        讲者或教材名称
        <input
          aria-label="录音来源名称"
          maxLength={80}
          value={speaker}
          onChange={(e) => setSpeaker(e.target.value)}
          placeholder="例如：老师姓名"
        />
      </label>
      <input
        ref={input}
        type="file"
        aria-label="选择音标录音文件"
        accept=".wav,.mp3,.ogg,.m4a,.webm"
        disabled={busy}
        onChange={(e) => void choose(e.target.files?.[0])}
      />
      <small>
        每项不超过 2 MB、8
        秒。文件保存在当前设备，清除应用或网站数据会移除录音，请保留原文件。
      </small>
      {selected && url && (
        <div className="sound-preview">
          <p>
            {draft ? "待保存" : "本机示范"} · {selected.filename} ·{" "}
            {selected.duration.toFixed(2)} 秒
          </p>
          <audio
            key={url}
            ref={preview}
            src={url}
            controls
            preload="metadata"
            aria-label="试听导入的音标录音"
            onPlay={beforePreview}
            onEnded={() => setHeard(true)}
            onError={() => {
              setHeard(false);
              setError("此录音无法播放，请更换文件。");
            }}
          />
          {!draft && <small>{selected.speaker}</small>}
        </div>
      )}
      {draft && (
        <>
          <p className="small-caption">
            请完整试听，确认读的是所选音标、口音一致且没有额外音节。文件检查不能判断发音是否标准。
          </p>
          <button
            className="secondary"
            disabled={busy || !heard}
            onClick={() => void save()}
          >
            采用这段示范
          </button>
        </>
      )}
      {saved[id] && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void save(true)}
        >
          移除此项本机录音
        </button>
      )}
      {busy && <p role="status">正在处理录音…</p>}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </details>
  );
}
