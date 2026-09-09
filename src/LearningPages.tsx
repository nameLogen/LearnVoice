import { useEffect, useState } from "react";
import { Search, Volume2, ChevronLeft } from "lucide-react";
import {
  searchWords,
  meanings,
  findEntry,
  lexiconIndex,
  type WordEntry,
} from "./lexicon";
import {
  sounds,
  phonics,
  type SoundLesson,
  type PhonicsLesson,
} from "./learning";
import type { Preferences } from "./preferences";
import { useSpeechPlayer } from "./useSpeechPlayer";
import { appAssetUrl } from "./assets";
import { ReadingPractice } from "./ReadingPractice";
import { targets } from "./targets";
import type { Observation } from "./types";

export function WordExample({
  word,
  onWord,
}: {
  word: string;
  onWord(word: string): void;
}) {
  const [entry, setEntry] = useState<WordEntry | null>(null);
  useEffect(() => {
    let live = true;
    void findEntry(word)
      .then((e) => {
        if (live) setEntry(e);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [word]);
  const meaning = meanings(entry)[0];
  return (
    <button className="example-word" onClick={() => onWord(word)}>
      <span lang="en">{word}</span>
      <small>{meaning ? `${meaning.pos} · ${meaning.text}` : "释义暂缺"}</small>
      <Volume2 size={17} />
    </button>
  );
}
export function DictionaryPage({ onWord }: { onWord(word: string): void }) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<WordEntry[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [count, setCount] = useState(0);
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem("listen-learn-recent") ?? "[]");
      return Array.isArray(v)
        ? v.filter((x) => typeof x === "string").slice(0, 12)
        : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    void lexiconIndex()
      .then((i) => setCount(i.count))
      .catch(() => setError("词库未能加载。"));
  }, []);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      if (!query.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      searchWords(query)
        .then(
          (r) => {
            if (live) setResults(r);
          },
          (e) => {
            if (live) setError(e instanceof Error ? e.message : "查询失败。");
          },
        )
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);
  function open(word: string) {
    const next = [word, ...recent.filter((w) => w !== word)].slice(0, 12);
    setRecent(next);
    try {
      localStorage.setItem("listen-learn-recent", JSON.stringify(next));
    } catch {
      /* history is optional */
    }
    onWord(word);
  }
  return (
    <section>
      <div className="page-title">
        <div>
          <h1>今天想认识哪个词？</h1>
          <p>听发音，懂意思，试着读。</p>
        </div>
        <span className="page-emblem">Aa</span>
      </div>
      <label className="dictionary-search">
        <Search size={23} />
        <input
          aria-label="搜索英文单词"
          maxLength={80}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入英文单词"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        {query && (
          <button aria-label="清空搜索" onClick={() => setQuery("")}>
            ×
          </button>
        )}
      </label>
      <p className="small-caption">
        离线词典 · {count ? `${count.toLocaleString()} 条词条` : "正在准备词库"}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {query ? (
        <>
          <div className="result-heading">
            <h2>搜索结果</h2>
            <span role="status">
              {loading ? "正在查询…" : `${results.length} 条候选`}
            </span>
          </div>
          <div className="dictionary-results">
            {results.map((e) => (
              <button
                key={e.word}
                className="dictionary-result"
                onClick={() => open(e.word)}
              >
                <b lang="en">{e.word}</b>
                <span>
                  {meanings(e)[0]?.pos} · {meanings(e)[0]?.text || "释义暂缺"}
                </span>
                <Volume2 size={18} />
              </button>
            ))}
          </div>
          {!loading && !results.length && (
            <div className="empty-note">
              没有找到这个词。检查拼写，或
              <button
                className="text-button"
                onClick={() => open(query.trim())}
              >
                直接听读这个词
              </button>
              。
            </div>
          )}
        </>
      ) : (
        <>
          <div className="result-heading">
            <h2>{recent.length ? "最近学过" : "从这些词开始"}</h2>
            <span>点开就能听</span>
          </div>
          <div className="word-examples">
            {(recent.length
              ? recent
              : ["cat", "apple", "book", "sun", "happy", "friend"]
            ).map((w) => (
              <WordExample key={w} word={w} onWord={open} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
interface SoundAsset {
  path: string;
  kind: string;
  changes: string;
  label?: string;
}
export function SoundPage({
  preferences,
  onWord,
}: {
  preferences: Preferences;
  onWord(word: string): void;
}) {
  const [group, setGroup] = useState("元音"),
    [selected, setSelected] = useState<SoundLesson | null>(null),
    [assets, setAssets] = useState<Record<string, SoundAsset>>({}),
    [page, setPage] = useState(0),
    [subgroup, setSubgroup] = useState("全部");
  const player = useSpeechPlayer(preferences);
  useEffect(() => {
    void fetch(appAssetUrl("sounds/catalog.json"))
      .then((r) => r.json())
      .then(setAssets)
      .catch(() => {});
  }, []);
  const groups = ["元音", "辅音", "辅音组合"];
  const categorySounds = sounds.filter((s) =>
    group === "元音"
      ? s.kind === "vowel"
      : group === "辅音"
        ? s.kind === "consonant"
        : s.kind === "cluster",
  );
  const filtered = categorySounds.filter(
    (s) => subgroup === "全部" || s.group === subgroup,
  );
  function play(s: SoundLesson) {
    player.stop();
    setSelected(s);
    const asset = assets[s.id];
    if (asset) void player.play("", appAssetUrl(asset.path));
    else void player.play(s.words[0]);
  }
  return (
    <section>
      <div className="page-title">
        <div>
          <h1>音标学习</h1>
          <p>48 项教学音标 · 从听见到会读</p>
        </div>
        <span className="page-emblem">/æ/</span>
      </div>
      {selected ? (
        <>
          <button
            className="text-button"
            onClick={() => {
              player.stop();
              setSelected(null);
            }}
          >
            <ChevronLeft size={18} /> 返回音标表
          </button>
          <div className="sound-detail">
            <span className="lesson-category">{selected.group}</span>
            <button
              className="big-sound"
              aria-label={`播放音标 ${selected.symbol}`}
              onClick={() => play(selected)}
            >
              /{selected.symbol}/ <Volume2 size={26} />
            </button>
            <p>{selected.tip}</p>
            <small>
              {assets[selected.id]?.label ??
                (assets[selected.id]?.kind === "word"
                  ? "真人词例示范，请注意目标声音"
                  : "真人音节参考（可能含衬元音）")}
              {player.state === "loading" ? " · 加载中" : ""}
            </small>
          </div>
          <h2 className="section-label">在单词里听一听</h2>
          <div className="word-examples">
            {selected.words.map((w) => (
              <WordExample
                key={w}
                word={w}
                onWord={(w) => {
                  player.stop();
                  onWord(w);
                }}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="category-tabs">
            {groups.map((g) => (
              <button
                key={g}
                className={g === group ? "active" : ""}
                onClick={() => {
                  setGroup(g);
                  setSubgroup("全部");
                  setPage(0);
                }}
              >
                {g}
              </button>
            ))}
          </div>
          <label className="book-select">
            发音方式
            <select
              aria-label="音标分类"
              value={subgroup}
              onChange={(e) => {
                setSubgroup(e.target.value);
                setPage(0);
              }}
            >
              {["全部", ...new Set(categorySounds.map((s) => s.group))].map(
                (g) => (
                  <option key={g}>{g}</option>
                ),
              )}
            </select>
          </label>
          <div className="sound-grid">
            {filtered.slice(page * 12, page * 12 + 12).map((s) => (
              <button key={s.id} onClick={() => play(s)}>
                <b>/{s.symbol}/</b>
                <small>{s.group}</small>
              </button>
            ))}
          </div>
          <div className="page-controls">
            <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
              上一页
            </button>
            <span>
              {page + 1} / {Math.ceil(filtered.length / 12)}
            </span>
            <button
              disabled={(page + 1) * 12 >= filtered.length}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </div>
          <p className="small-caption">
            按常见英式教学表编排；组合音已单独标注。
          </p>
        </>
      )}
      {player.error && (
        <p role="alert" className="error">
          {player.error}
        </p>
      )}
    </section>
  );
}
export function PhonicsPage({
  preferences,
  onWord,
}: {
  preferences: Preferences;
  onWord(word: string): void;
}) {
  const groups = [...new Set(phonics.map((p) => p.group))];
  const [group, setGroup] = useState(groups[0]),
    [selected, setSelected] = useState<PhonicsLesson | null>(null),
    [page, setPage] = useState(0);
  const player = useSpeechPlayer(preferences);
  const filtered = phonics.filter((p) => p.group === group);
  return (
    <section>
      <div className="page-title">
        <div>
          <h1>自然拼读</h1>
          <p>{phonics.length} 组常用读法 · 看字母，拼出声音</p>
        </div>
        <span className="page-emblem">sh</span>
      </div>
      {selected ? (
        <>
          <button
            className="text-button"
            onClick={() => {
              player.stop();
              setSelected(null);
            }}
          >
            <ChevronLeft size={18} /> 返回拼读组合
          </button>
          <div className="sound-detail">
            <span className="lesson-category">{selected.group}</span>
            <h2 className="pattern-title">{selected.pattern}</h2>
            <p className="pattern-ipa">
              {selected.sound === "连读" ? "辅音连读" : `/${selected.sound}/`}
            </p>
            <p>{selected.tip}</p>
            <button
              className="secondary"
              onClick={() => void player.play(selected.words.join(", "))}
            >
              <Volume2 size={18} /> 听这组例词
            </button>
            <small>
              {player.state === "loading"
                ? "正在准备声音…"
                : "例词连读，注意相同的字母组合"}
            </small>
          </div>
          {player.error && (
            <p className="error" role="alert">
              {player.error}
            </p>
          )}
          <div className="word-examples">
            {selected.words.map((w) => (
              <WordExample
                key={w}
                word={w}
                onWord={(w) => {
                  player.stop();
                  onWord(w);
                }}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <label className="book-select">
            学习分类
            <select
              aria-label="拼读分类"
              value={group}
              onChange={(e) => {
                setGroup(e.target.value);
                setPage(0);
              }}
            >
              {groups.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <div className="sound-grid phonics-grid">
            {filtered.slice(page * 12, page * 12 + 12).map((p) => (
              <button key={p.id} onClick={() => setSelected(p)}>
                <b>{p.pattern}</b>
                <small>
                  {p.sound === "连读" ? "辅音连读" : `/${p.sound}/`}
                </small>
              </button>
            ))}
          </div>
          <div className="page-controls">
            <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
              上一页
            </button>
            <span>
              {page + 1} / {Math.ceil(filtered.length / 12)}
            </span>
            <button
              disabled={(page + 1) * 12 >= filtered.length}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </div>
        </>
      )}
    </section>
  );
}
export function PinyinPage({
  preferences,
  onObservation,
  onBusy,
}: {
  preferences: Preferences;
  onObservation(o: Observation): void;
  onBusy(b: boolean): void;
}) {
  const [id, setId] = useState("ma1"),
    [busy, setBusy] = useState(false);
  const target = targets.find((t) => t.id === id)!;
  const player = useSpeechPlayer(preferences);
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  return (
    <section>
      <div className="page-title">
        <div>
          <h1>拼音学习</h1>
          <p>听四声，读一读。</p>
        </div>
        <span className="page-emblem">ā</span>
      </div>
      <div className="category-tabs">
        {targets
          .filter((t) => t.mode === "pinyin")
          .map((t) => (
            <button
              disabled={busy}
              key={t.id}
              className={t.id === id ? "active" : ""}
              onClick={() => {
                player.stop();
                setId(t.id);
              }}
            >
              {t.text}
            </button>
          ))}
      </div>
      <div className="sound-detail">
        <span className="lesson-category">{target.ipa}</span>
        <button
          className="big-sound"
          disabled={busy}
          onClick={() =>
            void player.play("", appAssetUrl(`references/${id}.ogg`))
          }
        >
          {target.text}
          <Volume2 size={24} />
        </button>
        <p>
          {id === "ma1"
            ? "示范读“妈妈”，请跟读第一个 mā。"
            : "先听示范，再自然地读一遍。"}
        </p>
      </div>
      <div className="pinyin-practice">
        <ReadingPractice
          key={id}
          text={target.text}
          target={target}
          word
          beforeRecord={async () => player.stop()}
          onBusy={setBusy}
          onObservation={onObservation}
        />
      </div>
      {player.error && <p className="error">{player.error}</p>}
    </section>
  );
}
