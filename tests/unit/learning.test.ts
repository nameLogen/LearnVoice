import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { sounds, phonics } from "../../src/learning";
import { meanings, type WordEntry } from "../../src/lexicon";
describe("offline learning content", () => {
  it("contains the 48-entry traditional chart and distinct phonics categories", () => {
    expect(sounds).toHaveLength(48);
    expect(new Set(sounds.map((s) => s.id)).size).toBe(48);
    expect(sounds.filter((s) => s.kind === "vowel")).toHaveLength(20);
    expect(sounds.filter((s) => s.kind === "consonant")).toHaveLength(24);
    expect(sounds.filter((s) => s.kind === "cluster")).toHaveLength(4);
    expect(phonics.length).toBeGreaterThanOrEqual(120);
    expect(new Set(phonics.map((p) => p.id)).size).toBe(phonics.length);
    for (const pattern of [
      "sh",
      "ch",
      "th",
      "ai",
      "oa",
      "igh",
      "a_e",
      "ar",
      "-tion",
      "-ed",
      "str",
    ])
      expect(phonics.some((p) => p.pattern === pattern)).toBe(true);
  });
  it("every teaching example has a Chinese meaning and part of speech", () => {
    const words = [...new Set([...sounds, ...phonics].flatMap((s) => s.words))];
    for (const word of words) {
      const key = word
        .replace(/[^a-z]/g, "")
        .slice(0, 2)
        .padEnd(2, "_");
      const entries: WordEntry[] = JSON.parse(
        readFileSync(`public/lexicon/${key}.json`, "utf8"),
      );
      const entry = entries.find((e) => e.word === word);
      expect(entry, word).toBeDefined();
      const defs = meanings(entry!);
      expect(defs.length, word).toBeGreaterThan(0);
      expect(defs[0].pos, word).not.toBe("词性暂缺");
      expect(
        defs.some((d) => /[\u4e00-\u9fff]/.test(d.text)),
        word,
      ).toBe(true);
    }
  });
  it("all 48 audio sources are present, attributed and checksum verified", () => {
    const catalog = JSON.parse(
      readFileSync("public/sounds/catalog.json", "utf8"),
    );
    for (const sound of sounds) {
      const asset = catalog[sound.id];
      expect(asset, sound.id).toBeDefined();
      expect(asset.author).toBeTruthy();
      expect(asset.source).toMatch(/^https:/);
      expect(asset.license).toBeTruthy();
      const data = readFileSync("public/" + asset.path);
      expect(createHash("sha256").update(data).digest("hex")).toBe(
        asset.sha256,
      );
    }
  });
  it("recognizes inflected verb definitions and combined POS", () => {
    expect(
      meanings({
        word: "heard",
        ipa: "",
        translation: "hear的过去式和过去分词",
        pos: "",
        exchange: "",
      })[0].pos,
    ).toBe("动词");
    expect(
      meanings({
        word: "x",
        ipa: "",
        translation: "n. 名词释义\nvt. 动词释义",
        pos: "",
        exchange: "",
      }).map((d) => d.pos),
    ).toEqual(["名词", "及物动词"]);
  });
});
