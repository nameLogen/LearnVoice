import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Plus,
} from "lucide-react";
import {
  articleParts,
  loadArticles,
  saveArticles,
  validateArticle,
  wordPieces,
  type ReadingArticle,
  type ReadingSentence,
} from "./articles";
import { ReadingPractice } from "./ReadingPractice";
import { Dialog } from "./Dialog";
import { useSpeechPlayer } from "./useSpeechPlayer";
import type { Preferences } from "./preferences";
import type { Observation } from "./types";

export function StoryReader({
  preferences,
  onWord,
  onObservation,
  onBusy,
}: {
  preferences: Preferences;
  onWord(word: string, context?: string): void;
  onObservation(o: Observation): void;
  onBusy(busy: boolean): void;
}) {
  const [initial] = useState(() => {
    try {
      return { items: loadArticles(), error: "" };
    } catch {
      return {
        items: [] as ReadingArticle[],
        error: "文章读取失败。请先在设置中备份数据。",
      };
    }
  });
  const [items, setItems] = useState(initial.items),
    [error, setError] = useState(initial.error);
  const [selected, setSelected] = useState(() => {
    try {
      return (
        localStorage.getItem("voice-lab-selected-article") ??
        initial.items[0]?.id
      );
    } catch {
      return initial.items[0]?.id;
    }
  });
  const article = items.find((a) => a.id === selected) ?? items[0];
  const paragraphs = article ? articleParts(article.text) : [],
    sentences = paragraphs.flatMap((p) => p.sentences);
  const [adding, setAdding] = useState(false),
    [title, setTitle] = useState(""),
    [text, setText] = useState("");
  const [practice, setPractice] = useState<{
      ids: string[];
      index: number;
    } | null>(null),
    [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(""),
    [reading, setReading] = useState(false);
  const session = useRef(0),
    sequence = useRef<ReadingSentence[]>([]),
    index = useRef(0),
    file = useRef<HTMLInputElement>(null);
  const player = useSpeechPlayer(preferences);
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  useEffect(
    () => () => {
      session.current++;
    },
    [],
  );
  useEffect(() => {
    if (current && preferences.follow)
      document
        .getElementById(`sentence-${current}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current, preferences.follow]);
  function persist(next: ReadingArticle[]) {
    try {
      saveArticles(next);
      setItems(next);
      return true;
    } catch {
      setError("存储空间不足，修改未保存。请在设置中导出备份。");
      return false;
    }
  }
  function stop() {
    session.current++;
    player.stop();
    setReading(false);
  }
  function change(id: string) {
    stop();
    sequence.current = [];
    index.current = 0;
    setSelected(id);
    setCurrent("");
    setPractice(null);
    try {
      localStorage.setItem("voice-lab-selected-article", id);
    } catch {
      setError("文章选择未能保存。");
    }
  }
  async function playFrom(list: ReadingSentence[], at = 0) {
    stop();
    sequence.current = list;
    index.current = at;
    const ticket = session.current;
    setReading(true);
    for (let atIndex = at; atIndex < list.length; atIndex++) {
      if (ticket !== session.current) break;
      index.current = atIndex;
      const sentence = list[atIndex];
      setCurrent(sentence.id);
      if (!(await player.play(sentence.text))) break;
    }
    if (ticket === session.current) setReading(false);
  }
  function toggle() {
    if (player.state === "playing" || player.state === "loading") {
      player.pause();
      return;
    }
    if (player.state === "paused" && !player.system) {
      void player.resume();
      return;
    }
    const list = sequence.current.length ? sequence.current : sentences;
    void playFrom(list, Math.min(index.current, Math.max(0, list.length - 1)));
  }
  function wordClick(word: string, context: string) {
    player.pause();
    onWord(word, context);
  }
  function complete() {
    if (!article || !practice) return;
    const id = practice.ids[practice.index];
    if (
      !persist(
        items.map((a) =>
          a.id === article.id
            ? { ...a, completed: [...new Set([...a.completed, id])] }
            : a,
        ),
      )
    )
      return;
    if (practice.index + 1 < practice.ids.length)
      setPractice({ ...practice, index: practice.index + 1 });
    else setPractice(null);
  }
  async function importText(input?: File) {
    if (!input) return;
    try {
      if (input.size > 150000) throw new Error("文件太大，请分成几篇。");
      setTitle(input.name.replace(/\.txt$/i, "").slice(0, 100));
      setText((await input.text()).replace(/^\uFEFF/, ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败。");
    } finally {
      if (file.current) file.current.value = "";
    }
  }
  function add() {
    try {
      validateArticle(title, text);
      if (items.length >= 20)
        throw new Error("最多保存 20 篇，可在设置中管理文章。");
      const a = {
        id: crypto.randomUUID(),
        title: title.trim(),
        text: text.trim(),
        completed: [],
      };
      if (persist([...items, a])) {
        change(a.id);
        setAdding(false);
        setTitle("");
        setText("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败。");
    }
  }
  const practiceSentence = practice
    ? sentences.find((s) => s.id === practice.ids[practice.index])
    : undefined;
  return (
    <section className="story-page">
      <div className="page-title">
        <div>
          <h1>故事阅读</h1>
          <p>读一小段，发现新单词。</p>
        </div>
        <button
          className="round-action"
          aria-label="添加文章"
          disabled={busy}
          onClick={() => {
            stop();
            setAdding(true);
          }}
        >
          <Plus />
        </button>
      </div>
      <label className="book-select">
        我的书架
        <select
          aria-label="选择文章"
          disabled={busy}
          value={article?.id ?? ""}
          onChange={(e) => change(e.target.value)}
        >
          {items.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </label>
      {(error || player.error) && (
        <p className="error" role="alert">
          {error || player.error}
        </p>
      )}
      {article ? (
        <article
          className="reading-paper"
          style={{
            fontSize: preferences.fontSize,
            lineHeight: preferences.lineHeight,
          }}
        >
          <h2 lang="en">{article.title}</h2>
          <p className="small-caption">
            已练 {article.completed.length} / {sentences.length} 小句
          </p>
          {paragraphs.map((p, i) => (
            <section key={p.id} className="reading-paragraph">
              <div className="paragraph-controls">
                <span>{String(i + 1).padStart(2, "0")}</span>
                <button
                  disabled={busy}
                  onClick={() => void playFrom(p.sentences)}
                >
                  听第 {i + 1} 段
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    stop();
                    setPractice({
                      ids: p.sentences.map((s) => s.id),
                      index: 0,
                    });
                  }}
                >
                  跟读第 {i + 1} 段
                </button>
              </div>
              <p lang="en">
                {p.sentences.map((s) => (
                  <span
                    id={`sentence-${s.id}`}
                    key={s.id}
                    className={current === s.id ? "reading-highlight" : ""}
                  >
                    {wordPieces(s.text).map((part, j) =>
                      part.word ? (
                        <button
                          className="inline-word"
                          key={j}
                          aria-label={`查看单词 ${part.text}`}
                          onClick={() => wordClick(part.text, s.text)}
                        >
                          {part.text}
                        </button>
                      ) : (
                        <span key={j}>{part.text}</span>
                      ),
                    )}{" "}
                  </span>
                ))}
              </p>
            </section>
          ))}
        </article>
      ) : (
        <div className="empty-page">
          <BookOpen size={48} />
          <p>添加一篇故事，开始阅读。</p>
        </div>
      )}
      {article && (
        <div className="story-player" aria-label="故事播放器">
          <button
            aria-label="上一句"
            disabled={busy}
            onClick={() =>
              void playFrom(
                sequence.current.length ? sequence.current : sentences,
                Math.max(0, index.current - 1),
              )
            }
          >
            <ChevronLeft />
          </button>
          <button
            className="player-main"
            disabled={busy}
            aria-label={
              player.state === "playing" || player.state === "loading"
                ? "暂停朗读"
                : "播放朗读"
            }
            onClick={toggle}
          >
            {player.state === "playing" || player.state === "loading" ? (
              <Pause />
            ) : (
              <Play />
            )}
          </button>
          <button
            aria-label="下一句"
            disabled={busy}
            onClick={() => {
              const list = sequence.current.length
                ? sequence.current
                : sentences;
              void playFrom(list, Math.min(list.length - 1, index.current + 1));
            }}
          >
            <ChevronRight />
          </button>
          <div>
            <b>
              {player.state === "loading"
                ? "正在准备声音…"
                : player.state === "paused"
                  ? player.system
                    ? "已暂停 · 继续将重听本句"
                    : "已暂停"
                  : reading
                    ? "正在朗读"
                    : "听故事"}
            </b>
            <small>
              {current
                ? `第 ${sentences.findIndex((s) => s.id === current) + 1} / ${sentences.length} 句`
                : "点击单词，查看释义和练习"}
            </small>
          </div>
        </div>
      )}
      {adding && (
        <Dialog title="添加文章" onClose={() => setAdding(false)}>
          <form
            className="article-form"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <label>
              文章标题
              <input
                autoFocus
                value={title}
                maxLength={100}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </label>
            <label>
              英语文章
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                required
                placeholder="粘贴英文，换行分段。"
              />
            </label>
            <p className="small-caption">{text.length} / 30,000 字符</p>
            <div className="action-row">
              <button
                type="button"
                className="secondary"
                onClick={() => file.current?.click()}
              >
                导入 TXT
              </button>
              <button className="primary" type="submit">
                保存文章
              </button>
            </div>
            <input
              hidden
              ref={file}
              type="file"
              accept=".txt,text/plain"
              onChange={(e) => void importText(e.target.files?.[0])}
            />
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </form>
        </Dialog>
      )}
      {practice && practiceSentence && (
        <Dialog
          title={`逐句跟读 · ${practice.index + 1}/${practice.ids.length}`}
          busy={busy}
          onClose={() => setPractice(null)}
        >
          <div className="sentence-practice">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void player.play(practiceSentence.text)}
            >
              听这一句
            </button>
            <ReadingPractice
              key={practiceSentence.id}
              text={practiceSentence.text}
              target={null}
              word={false}
              beforeRecord={async () => player.stop()}
              onBusy={setBusy}
              onObservation={onObservation}
              onComplete={complete}
            />
          </div>
        </Dialog>
      )}
    </section>
  );
}
