import { useEffect, useRef, useState } from "react";
import { ScoreCard } from "./ScoreCard";
import { builtInVoices, type Preferences } from "./preferences";
import { offlineVoices, type OfflineVoice } from "./offlineSpeech";
import { useSpeechPlayer } from "./useSpeechPlayer";
import {
  decodeLibrary,
  loadArticles,
  saveArticles,
  type ReadingArticle,
} from "./articles";
import { exportObservations } from "./storage";
import { isAndroid, VoiceLab } from "./native";
import { prepareModel } from "./inference";
import { startRecorder, type Recorder } from "./audio";
import { inspectAudio } from "./speech";
import { releaseSpeechEngine } from "./synthesis";
import { appAssetUrl } from "./assets";
import type { Observation } from "./types";

export function SettingsPage({
  preferences,
  onChange,
  observations,
  onObservations,
  onBusy,
}: {
  preferences: Preferences;
  onChange(p: Preferences): void;
  observations: Observation[];
  onObservations(items: Observation[]): void;
  onBusy(b: boolean): void;
}) {
  const [tab, setTab] = useState("声音"),
    [systemVoices, setSystemVoices] = useState<OfflineVoice[]>([]),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const [articles, setArticles] = useState<ReadingArticle[]>(() => {
    try {
      return loadArticles();
    } catch {
      return [];
    }
  });
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    recorder = useRef<Recorder | null>(null);
  const player = useSpeechPlayer(preferences);
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  useEffect(
    () => () => {
      void recorder.current?.cancel();
    },
    [],
  );
  function update(change: Partial<Preferences>) {
    player.stop();
    onChange({ ...preferences, ...change });
  }
  async function exportArticles() {
    try {
      const raw =
        localStorage.getItem("voice-lab-articles-v1") ??
        JSON.stringify(articles);
      if (isAndroid)
        await VoiceLab.exportFile({
          name: "listen-learn-articles.json",
          content: raw,
        });
      else {
        const url = URL.createObjectURL(
          new Blob([raw], { type: "application/json" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "listen-learn-articles.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败。");
    }
  }
  async function importArticles(input?: File) {
    if (!input) return;
    try {
      if (input.size > 3000000) throw new Error("备份文件过大。");
      const added = decodeLibrary(
        (await input.text()).replace(/^\uFEFF/, ""),
      ).map((a) => ({ ...a, id: crypto.randomUUID() }));
      const current = loadArticles();
      if (current.length + added.length > 20)
        throw new Error("导入后超过 20 篇，请先移除部分文章。");
      const next = [...current, ...added];
      saveArticles(next);
      setArticles(next);
      setStatus(`已导入 ${added.length} 篇文章。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败。");
    } finally {
      if (file.current) file.current.value = "";
    }
  }
  async function checkModel() {
    setBusy(true);
    setStatus("正在检查发音分析模型…");
    setError("");
    player.stop();
    releaseSpeechEngine();
    try {
      const r = await prepareModel();
      setStatus(`发音分析已就绪 · ${r.engine}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "模型不可用。");
    } finally {
      setBusy(false);
    }
  }
  async function checkMic() {
    setBusy(true);
    setStatus("请说一句话，2 秒后自动结束。");
    setError("");
    player.stop();
    try {
      recorder.current = await startRecorder(() => {}, 2);
      await new Promise((r) => setTimeout(r, 2000));
      const pcm = await recorder.current.stop();
      recorder.current = null;
      setStatus(inspectAudio(pcm).reason ?? "麦克风正常，已收到声音。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "麦克风不可用。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-page">
      <div className="page-title">
        <div>
          <h1>设置</h1>
          <p>把学习调整到舒服的节奏。</p>
        </div>
      </div>
      <div className="category-tabs">
        {["声音", "阅读", "数据", "家长"].map((t) => (
          <button
            disabled={busy}
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => {
              player.stop();
              setTab(t);
              setStatus("");
              setError("");
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {(error || player.error) && (
        <p className="error" role="alert">
          {error || player.error}
        </p>
      )}
      {status && (
        <p className="setting-status" role="status">
          {status}
        </p>
      )}
      {tab === "声音" && (
        <>
          <h2 className="section-label">内置离线声音</h2>
          <div className="voice-cards">
            {builtInVoices.map((v) => (
              <div
                key={v.id}
                className={`voice-card ${preferences.voice === v.id ? "chosen" : ""}`}
              >
                <button
                  aria-pressed={preferences.voice === v.id}
                  onClick={() => update({ voice: v.id })}
                >
                  <b>{v.name}</b>
                  <span>{v.label}</span>
                  <small>
                    {preferences.voice === v.id ? "正在使用" : "选择声音"}
                  </small>
                </button>
                <button
                  className="text-button"
                  aria-label={`试听 ${v.name}`}
                  onClick={() =>
                    void player.play(
                      "Hello! Let us read a story together.",
                      undefined,
                      v.id,
                    )
                  }
                >
                  试听
                </button>
              </div>
            ))}
          </div>
          <p className="small-caption">
            四种声音随应用提供，首次合成需要载入模型。
            {player.state === "loading" ? "正在准备声音…" : ""}
          </p>
          <label className="setting-row">
            朗读速度
            <select
              aria-label="朗读速度"
              value={preferences.rate}
              onChange={(e) => update({ rate: Number(e.target.value) })}
            >
              <option value={0.65}>很慢</option>
              <option value={0.8}>慢速</option>
              <option value={0.9}>舒缓</option>
              <option value={1}>正常</option>
              <option value={1.1}>稍快</option>
            </select>
          </label>
          <details className="setting-details">
            <summary>使用设备上的其他离线声音</summary>
            <button
              className="secondary"
              onClick={() => {
                void offlineVoices()
                  .then((v) => {
                    setSystemVoices(v);
                    setStatus(
                      v.length
                        ? `找到 ${v.length} 个本地英语声音。`
                        : "设备未提供其他离线英语声音，可使用上方内置声音。",
                    );
                  })
                  .catch((e) =>
                    setError(e instanceof Error ? e.message : "读取失败。"),
                  );
              }}
            >
              检测系统声音
            </button>
            {systemVoices.map((v) => (
              <button
                key={v.id}
                className="system-voice"
                onClick={() => update({ voice: `system:${v.id}` })}
              >
                {v.name} · {v.lang}
                {preferences.voice === `system:${v.id}` ? " ✓" : ""}
              </button>
            ))}
            <p className="small-caption">
              系统声音不一定支持精确暂停，继续时可能重听本句。
            </p>
          </details>
        </>
      )}
      {tab === "阅读" && (
        <div className="settings-panel">
          <label className="setting-row">
            正文字号
            <select
              aria-label="正文字号"
              value={preferences.fontSize}
              onChange={(e) => update({ fontSize: Number(e.target.value) })}
            >
              {[20, 22, 26, 30].map((n) => (
                <option key={n} value={n}>
                  {n} ·{" "}
                  {n === 20
                    ? "标准"
                    : n === 22
                      ? "舒适"
                      : n === 26
                        ? "大字"
                        : "特大"}
                </option>
              ))}
            </select>
          </label>
          <label className="setting-row">
            阅读行距
            <select
              aria-label="阅读行距"
              value={preferences.lineHeight}
              onChange={(e) => update({ lineHeight: Number(e.target.value) })}
            >
              <option value={1.6}>紧凑</option>
              <option value={1.9}>舒适</option>
              <option value={2.2}>宽松</option>
            </select>
          </label>
          <label className="setting-row">
            跟随朗读滚动
            <input
              type="checkbox"
              checked={preferences.follow}
              onChange={(e) => update({ follow: e.target.checked })}
            />
          </label>
          <p
            className="reading-preview"
            style={{
              fontSize: preferences.fontSize,
              lineHeight: preferences.lineHeight,
            }}
          >
            A little book opens a big world.
          </p>
        </div>
      )}
      {tab === "数据" && (
        <>
          <div className="action-row">
            <button className="secondary" onClick={() => void exportArticles()}>
              导出文章备份
            </button>
            <button className="secondary" onClick={() => file.current?.click()}>
              导入文章备份
            </button>
            <input
              ref={file}
              hidden
              type="file"
              accept=".json,application/json"
              onChange={(e) => void importArticles(e.target.files?.[0])}
            />
          </div>
          <h2 className="section-label">我的文章 · {articles.length}</h2>
          <div className="managed-articles">
            {articles.map((a) => (
              <div key={a.id}>
                <span>
                  {a.title}
                  <small>已练 {a.completed.length} 小句</small>
                </span>
                <button
                  className="text-button danger"
                  onClick={() => {
                    if (!window.confirm(`移除《${a.title}》及其进度？`)) return;
                    try {
                      const next = articles.filter((x) => x.id !== a.id);
                      saveArticles(next);
                      setArticles(next);
                    } catch {
                      setError("移除失败，数据未更改。");
                    }
                  }}
                >
                  移除
                </button>
              </div>
            ))}
          </div>
          <p className="small-caption">
            文章、设置和记录保存在本机。卸载应用或清除网站数据前，请先备份。
          </p>
        </>
      )}
      {tab === "家长" && (
        <>
          <div className="action-row">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void checkMic()}
            >
              检查麦克风
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void checkModel()}
            >
              检查分析模型
            </button>
            <button
              className="secondary"
              disabled={!observations.length || busy}
              onClick={() =>
                void exportObservations(observations).catch(() =>
                  setError("导出失败。"),
                )
              }
            >
              导出练习记录
            </button>
          </div>
          <details className="setting-details">
            <summary>练习记录 · {observations.length}</summary>
            <div className="parent-records">
              {observations.map((o) => (
                <details key={o.id}>
                  <summary>
                    {o.target.text} ·{" "}
                    {o.score?.value == null ? "待观察" : `${o.score.value} 分`}
                    <small>
                      {new Date(o.createdAt).toLocaleDateString("zh-CN")}
                    </small>
                  </summary>
                  <ScoreCard observation={o} history={observations} />
                  <p>{o.explanation}</p>
                  <p>
                    模型听到：
                    {o.phones.map((p) => p.token).join(" ") || "未听清"}
                  </p>
                  <div className="action-row">
                    {(["correct", "incorrect", "unsure"] as const).map(
                      (label, i) => (
                        <button
                          className={
                            o.parentLabel === label ? "primary" : "secondary"
                          }
                          key={label}
                          onClick={() =>
                            onObservations(
                              observations.map((x) =>
                                x.id === o.id
                                  ? { ...x, parentLabel: label }
                                  : x,
                              ),
                            )
                          }
                        >
                          {["读得符合目标", "需要再练", "暂不确定"][i]}
                        </button>
                      ),
                    )}
                  </div>
                  <label>
                    备注
                    <textarea
                      value={o.note}
                      maxLength={300}
                      onChange={(e) =>
                        onObservations(
                          observations.map((x) =>
                            x.id === o.id ? { ...x, note: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    className="text-button danger"
                    onClick={() =>
                      onObservations(observations.filter((x) => x.id !== o.id))
                    }
                  >
                    删除本条
                  </button>
                </details>
              ))}
            </div>
          </details>
          <details className="setting-details">
            <summary>评分和教学说明</summary>
            <p>
              评分是识别音素与美式参考的接近程度，尚未针对儿童发音校准；不判断重音、节奏或声音是否好听。100
              分不代表发音标准。英式示范与美式参考可能有差异。
            </p>
            <p>
              拼音显示音高供家长观察，暂不判断四声对错。段落记录完成进度，不提供整句准确率。
            </p>
            <p>
              48 项采用传统英式教学编排，包含 20 项元音、24 项辅音及 4
              项辅音组合。真人录音为语音学参考，不代表教学机构认证。
            </p>
          </details>
          <details className="setting-details">
            <summary>关于听读乐园与资源来源</summary>
            <p>听读乐园 0.4 · 英语与拼音学习</p>
            <p>
              Android
              安装包内置词典、示范和模型；网页需先从部署站点加载资源，未提供完整断网冷启动缓存。录音不上传，原始录音不会长期保存。
            </p>
            <a
              href={appAssetUrl("licenses/NOTICES.md")}
              target="_blank"
              rel="noreferrer"
            >
              第三方组件说明
            </a>
            <a
              href={appAssetUrl("sounds/ATTRIBUTION.md")}
              target="_blank"
              rel="noreferrer"
            >
              音标录音来源
            </a>
            <a
              href={appAssetUrl("references/ATTRIBUTION.md")}
              target="_blank"
              rel="noreferrer"
            >
              原有真人示范来源
            </a>
            <a
              href={appAssetUrl("lexicon/SOURCE.json")}
              target="_blank"
              rel="noreferrer"
            >
              词典数据来源
            </a>
          </details>
        </>
      )}
    </section>
  );
}
