import { appAssetUrl } from "./assets";
export interface WordEntry {
  word: string;
  ipa: string;
  translation: string;
  pos: string;
  exchange: string;
}
interface Index {
  count: number;
  shards: Record<string, number>;
  suggestions: Record<string, WordEntry[]>;
}
let index: Promise<Index> | undefined;
const shards = new Map<string, Promise<WordEntry[]>>();
export const normalizeWord = (word: string) =>
  word.trim().toLowerCase().replace(/’/g, "'");
// ECDICT mixes older ASCII-style transcription with Unicode IPA.
export const displayIpa = (ipa: string) =>
  ipa
    .replace(/^\/|\/$/g, "")
    .replace(/ә[:ː]/g, "ɜː")
    .replaceAll("ә", "ə")
    .replaceAll("'", "ˈ")
    .replace(/i(?![:ː])/g, "ɪ")
    .replace(/u(?![:ː])/g, "ʊ")
    .replaceAll(":", "ː");
export function lexiconIndex(): Promise<Index> {
  return (index ??= fetch(appAssetUrl("lexicon/index.json"))
    .then((r) => {
      if (!r.ok) throw new Error("词典未能加载，请检查离线资源。");
      return r.json() as Promise<Index>;
    })
    .catch((e) => {
      index = undefined;
      throw e;
    }));
}
async function shardFor(word: string): Promise<WordEntry[]> {
  const key = word
    .replace(/[^a-z]/g, "")
    .slice(0, 2)
    .padEnd(2, "_");
  if (!(await lexiconIndex()).shards[key]) return [];
  if (!shards.has(key)) {
    if (shards.size >= 8) shards.delete(shards.keys().next().value!);
    shards.set(
      key,
      fetch(appAssetUrl(`lexicon/${key}.json`))
        .then((r) => {
          if (!r.ok) throw new Error("该部分词典未能加载，请重试。");
          return r.json();
        })
        .catch((e) => {
          shards.delete(key);
          throw e;
        }),
    );
  }
  return shards.get(key)!;
}
export async function findEntry(input: string): Promise<WordEntry | null> {
  const word = normalizeWord(input);
  return (await shardFor(word)).find((e) => e.word === word) ?? null;
}
export async function searchWords(input: string): Promise<WordEntry[]> {
  const query = normalizeWord(input);
  if (!query) return [];
  if (query.length === 1) {
    const exact = await findEntry(query);
    return [
      ...(exact ? [exact] : []),
      ...((await lexiconIndex()).suggestions[query] ?? []).filter(
        (e) => e.word !== query,
      ),
    ].slice(0, 30);
  }
  const entries = await shardFor(query);
  const exact = entries.find((e) => e.word === query);
  return [
    ...(exact ? [exact] : []),
    ...entries.filter((e) => e.word.startsWith(query) && e.word !== query),
  ].slice(0, 40);
}
const labels: Record<string, string> = {
  n: "名词",
  v: "动词",
  vt: "及物动词",
  vi: "不及物动词",
  a: "形容词",
  adj: "形容词",
  ad: "副词",
  adv: "副词",
  pron: "代词",
  prep: "介词",
  conj: "连词",
  interj: "感叹词",
  int: "感叹词",
  num: "数词",
  art: "冠词",
  det: "限定词",
  aux: "助动词",
  modal: "情态动词",
};
export function meanings(
  entry: WordEntry | null,
): { pos: string; text: string }[] {
  if (!entry) return [];
  return entry.translation
    .split(/\n/)
    .filter(Boolean)
    .map((line) => {
      const match = /^([a-z]+(?:\.\s*&?\s*[a-z]+)*)\.\s*/i.exec(line);
      const codes = match
        ? match[1].split(/[. &]+/)
        : entry.pos
          ? entry.pos.split("/").map((s) => s.split(":")[0])
          : /过去式|过去分词|现在分词/.test(line)
            ? ["v"]
            : [];
      const pos = [
        ...new Set(codes.map((c) => labels[c]).filter(Boolean)),
      ].join(" / ");
      return {
        pos: pos || "词性暂缺",
        text: match ? line.slice(match[0].length) : line,
      };
    });
}
