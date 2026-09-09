import { useEffect, useState } from "react";
import {
  BookOpen,
  BookMarked,
  AudioLines,
  Shapes,
  Settings,
  Leaf,
} from "lucide-react";
import {
  DictionaryPage,
  SoundPage,
  PhonicsPage,
  PinyinPage,
} from "./LearningPages";
import { StoryReader } from "./StoryReader";
import { SettingsPage } from "./SettingsPage";
import { WordDialog } from "./WordDialog";
import {
  loadPreferences,
  savePreferences,
  type Preferences,
} from "./preferences";
import { loadObservations, saveObservations } from "./storage";
import type { Observation } from "./types";
import "./learn.css";

export default function App() {
  const [subject, setSubject] = useState<"english" | "pinyin">("english");
  const [page, setPage] = useState("dictionary"),
    [settings, setSettings] = useState(false);
  const [preferences, setPreferences] = useState(loadPreferences),
    [observations, setObservations] = useState(loadObservations);
  const [word, setWord] = useState<{ text: string; context?: string } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    try {
      saveObservations(observations);
    } catch {
      setError("练习记录未保存，请检查设备存储。");
    }
  }, [observations]);
  function changePreferences(p: Preferences) {
    try {
      savePreferences(p);
      setPreferences(p);
    } catch {
      setError("设置未能保存，请检查设备存储。");
    }
  }
  const openWord = (text: string, context?: string) =>
    setWord({ text, context });
  const observe = (o: Observation) =>
    setObservations((old) => [o, ...old].slice(0, 200));
  const tabs = [
    { id: "dictionary", label: "词典", icon: BookMarked },
    { id: "sounds", label: "音标", icon: AudioLines },
    { id: "phonics", label: "自然拼读", icon: Shapes },
    { id: "stories", label: "故事", icon: BookOpen },
  ];
  return (
    <div className="learn-app">
      <header className="learn-header">
        <a
          className="learn-brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (!busy) {
              setSettings(false);
              setPage("dictionary");
              setSubject("english");
            }
          }}
        >
          <span>
            <Leaf size={24} />
          </span>
          <div>
            听读乐园<small>LISTEN & LEARN</small>
          </div>
        </a>
        <button
          className={`settings-toggle ${settings ? "active" : ""}`}
          aria-label={settings ? "返回学习" : "打开设置"}
          disabled={busy}
          onClick={() => setSettings(!settings)}
        >
          <Settings size={22} />
          <span>{settings ? "返回" : "设置"}</span>
        </button>
      </header>
      {!settings && (
        <div className="subject-switch" aria-label="学习语言">
          <button
            disabled={busy}
            className={subject === "english" ? "active" : ""}
            onClick={() => setSubject("english")}
          >
            英语 <span>English</span>
          </button>
          <button
            disabled={busy}
            className={subject === "pinyin" ? "active" : ""}
            onClick={() => setSubject("pinyin")}
          >
            拼音 <span>Pinyin</span>
          </button>
        </div>
      )}
      <main
        className={`learn-main ${page === "stories" && !settings && subject === "english" ? "with-player" : ""}`}
      >
        {error && (
          <p className="error" role="alert">
            {error}
            <button onClick={() => setError("")}>关闭</button>
          </p>
        )}
        {settings ? (
          <SettingsPage
            preferences={preferences}
            onChange={changePreferences}
            observations={observations}
            onObservations={setObservations}
            onBusy={setBusy}
          />
        ) : subject === "pinyin" ? (
          <PinyinPage
            preferences={preferences}
            onObservation={observe}
            onBusy={setBusy}
          />
        ) : page === "dictionary" ? (
          <DictionaryPage onWord={openWord} />
        ) : page === "sounds" ? (
          <SoundPage preferences={preferences} onWord={openWord} />
        ) : page === "phonics" ? (
          <PhonicsPage preferences={preferences} onWord={openWord} />
        ) : (
          <StoryReader
            preferences={preferences}
            onWord={openWord}
            onObservation={observe}
            onBusy={setBusy}
          />
        )}
      </main>
      {!settings && subject === "english" && (
        <nav className="learn-nav" aria-label="英语学习">
          {tabs.map((t) => (
            <button
              key={t.id}
              disabled={busy}
              className={page === t.id ? "active" : ""}
              onClick={() => {
                setPage(t.id);
                window.scrollTo({ top: 0 });
              }}
            >
              <t.icon size={22} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      )}
      {word && (
        <WordDialog
          key={word.text}
          word={word.text}
          context={word.context}
          preferences={preferences}
          onClose={() => setWord(null)}
          onObservation={observe}
          onBusy={setBusy}
        />
      )}
    </div>
  );
}
