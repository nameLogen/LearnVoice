import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const source = await readFile("artifacts/sources/ecdict.csv");
const overrides = JSON.parse(
  await readFile("content/word-overrides.json", "utf8"),
);
// RFC 4180 fields, including embedded commas, quotes and newlines.
function* rows(text) {
  let row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if (c === "\n" && !quoted) {
      row.push(field.replace(/\r$/, ""));
      yield row;
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    yield row;
  }
}
const groups = new Map(),
  suggestions = {},
  words = new Set();
let columns;
for (const row of rows(source.toString("utf8"))) {
  if (!columns) {
    columns = row;
    continue;
  }
  const original = Object.fromEntries(columns.map((c, i) => [c, row[i] ?? ""]));
  const word = original.word.trim().toLowerCase();
  if (!/^[a-z]/.test(word) || word.length > 80 || words.has(word)) continue;
  words.add(word);
  const key = word
    .replace(/[^a-z]/g, "")
    .slice(0, 2)
    .padEnd(2, "_");
  const item = {
    word,
    ipa: original.phonetic,
    translation: original.translation.replace(/\\n/g, "\n"),
    pos: original.pos,
    exchange: original.exchange,
    ...overrides[word],
  };
  const shard = groups.get(key) ?? [];
  shard.push(item);
  groups.set(key, shard);
  const rank = Number(original.frq) || Number(original.bnc) || 999999;
  const first = word[0];
  (suggestions[first] ??= []).push({
    ...item,
    translation: item.translation.slice(0, 90),
    rank,
  });
}
await mkdir("public/lexicon", { recursive: true });
const counts = {};
for (const [key, items] of groups) {
  items.sort((a, b) => (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
  counts[key] = items.length;
  await writeFile(`public/lexicon/${key}.json`, JSON.stringify(items));
}
for (const letter of Object.keys(suggestions))
  suggestions[letter] = suggestions[letter]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 50);
await writeFile(
  "public/lexicon/index.json",
  JSON.stringify({ count: words.size, shards: counts, suggestions }),
);
await copyFile("artifacts/sources/ECDICT-LICENSE", "public/lexicon/LICENSE");
await writeFile(
  "public/lexicon/SOURCE.json",
  JSON.stringify(
    {
      repository: "https://github.com/skywind3000/ECDICT",
      revision: "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b",
      file: "ecdict.csv",
      sha256: createHash("sha256").update(source).digest("hex"),
      license: "MIT (upstream declaration)",
      changes:
        "Normalized keys, selected fields and split by first two letters. Learning overrides from content/word-overrides.json correct selected inflections. See upstream README for aggregated source history.",
    },
    null,
    2,
  ),
);
console.log(`Prepared ${words.size} entries in ${groups.size} shards.`);
