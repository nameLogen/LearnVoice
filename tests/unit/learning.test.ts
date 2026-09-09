import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { sounds, phonics } from "../../src/learning";
import { meanings, type WordEntry } from "../../src/lexicon";
import { readTeachingCatalog } from "../../src/soundAudio";
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
  it("only reviewed isolated recordings can enter the teaching catalog", () => {
    const catalog = readTeachingCatalog(
      JSON.parse(readFileSync("public/sounds/catalog.v2.json", "utf8")),
    );
    for (const asset of Object.values(catalog)) {
      const data = readFileSync("public/" + asset.path);
      expect(createHash("sha256").update(data).digest("hex")).toBe(
        asset.sha256,
      );
    }
  });
  it("rejects the old catalog, word substitutes and unreviewed sounds", () => {
    expect(() =>
      readTeachingCatalog({ ae: { path: "sounds/ae.ogg", kind: "sound" } }),
    ).toThrow();
    const fixture = {
      path: "sounds/approved/ae.wav",
      kind: "isolated-human",
      accent: "en-GB",
      author: "Test fixture",
      source: "https://example.com/recording",
      license: "CC0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      sha256: "0".repeat(64),
      review: { status: "accepted", reviewer: "Fixture", date: "2026-09-09" },
    };
    const catalog = (asset: unknown) => ({
      schemaVersion: 2,
      entries: { ae: asset },
    });
    expect(readTeachingCatalog(catalog(fixture)).ae).toEqual(fixture);
    for (const invalid of [
      { kind: "word" },
      { kind: "sound" },
      { kind: "synthetic-word" },
      { accent: "en-US" },
      { review: { status: "pending" } },
      { path: "sounds/../ae.wav" },
      { path: "https://example.com/ae.wav" },
      { author: "" },
      { license: "" },
    ])
      expect(() =>
        readTeachingCatalog(catalog({ ...fixture, ...invalid })),
      ).toThrow();
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
