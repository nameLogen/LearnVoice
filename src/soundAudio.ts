import { appAssetUrl } from "./assets";
import { sounds } from "./learning";

export interface TeachingSound {
  path: string;
  kind: "isolated-human";
  accent: "en-GB";
  author: string;
  source: string;
  license: string;
  licenseUrl: string;
  sha256: string;
  review: { status: "accepted"; reviewer: string; date: string };
}
export interface LocalSound {
  id: string;
  blob: Blob;
  filename: string;
  speaker: string;
  duration: number;
}
export interface SoundLibrary {
  bundled: Record<string, TeachingSound>;
  local: Record<string, LocalSound>;
  errors: string[];
}

// Old word/syllable catalogs must never become isolated-phoneme playback.
export function readTeachingCatalog(
  value: unknown,
): Record<string, TeachingSound> {
  const data = value as {
    schemaVersion?: number;
    entries?: Record<string, TeachingSound>;
  };
  if (
    !data ||
    data.schemaVersion !== 2 ||
    !data.entries ||
    typeof data.entries !== "object"
  )
    throw new Error("音标素材清单版本不正确。");
  const accepted: Record<string, TeachingSound> = {};
  for (const [id, asset] of Object.entries(data.entries)) {
    if (
      !sounds.some((s) => s.id === id) ||
      !asset ||
      asset.kind !== "isolated-human" ||
      asset.accent !== "en-GB" ||
      !/^sounds\/approved\/[a-z0-9-]+\.(mp3|ogg|wav)$/.test(asset.path) ||
      !asset.author?.trim() ||
      !/^https:\/\//.test(asset.source) ||
      !asset.license?.trim() ||
      !/^https:\/\//.test(asset.licenseUrl) ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      asset.review?.status !== "accepted" ||
      !asset.review.reviewer?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(asset.review.date)
    )
      throw new Error(`音标素材 ${id} 尚未满足教学录音要求。`);
    accepted[id] = asset;
  }
  return accepted;
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("listen-learn-teaching-sounds", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("sounds", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("无法打开本机音标录音库。"));
  });
}
export async function localSounds(): Promise<Record<string, LocalSound>> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("sounds").objectStore("sounds").getAll();
      request.onsuccess = () =>
        resolve(
          Object.fromEntries(
            (request.result as LocalSound[])
              .filter(
                (s) =>
                  sounds.some((t) => t.id === s.id) && s.blob instanceof Blob,
              )
              .map((s) => [s.id, s]),
          ),
        );
      request.onerror = () => reject(new Error("无法读取本机音标录音。"));
    });
  } finally {
    db.close();
  }
}
export async function saveLocalSound(id: string, value: LocalSound | null) {
  if (!sounds.some((s) => s.id === id)) throw new Error("未知音标。");
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sounds", "readwrite");
      if (value) tx.objectStore("sounds").put({ ...value, id });
      else tx.objectStore("sounds").delete(id);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(new Error("保存失败，请检查设备存储空间。"));
    });
  } finally {
    db.close();
  }
}
export async function loadSoundLibrary(): Promise<SoundLibrary> {
  const [bundle, local] = await Promise.allSettled([
    fetch(appAssetUrl("sounds/catalog.v2.json"), { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error("音标素材清单加载失败。");
        return r.json();
      })
      .then(readTeachingCatalog),
    localSounds(),
  ]);
  return {
    bundled: bundle.status === "fulfilled" ? bundle.value : {},
    local: local.status === "fulfilled" ? local.value : {},
    errors: [bundle, local].flatMap((r) =>
      r.status === "rejected" ? [String(r.reason.message ?? r.reason)] : [],
    ),
  };
}
export async function inspectTeachingFile(file: File): Promise<number> {
  if (!file.size || file.size > 2 * 1024 * 1024)
    throw new Error("请选择不超过 2 MB 的音频文件。");
  if (!/\.(wav|mp3|ogg|m4a|webm)$/i.test(file.name))
    throw new Error("支持 WAV、MP3、OGG、M4A 和 WebM 音频。");
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await file.arrayBuffer());
    if (audio.duration < 0.08 || audio.duration > 8)
      throw new Error("单项示范应在 0.08～8 秒之间，请不要导入整段讲解。");
    let peak = 0;
    for (let c = 0; c < audio.numberOfChannels; c++)
      for (const sample of audio.getChannelData(c))
        peak = Math.max(peak, Math.abs(sample));
    if (peak < 0.001) throw new Error("这段音频几乎没有声音，请换一份录音。");
    return audio.duration;
  } catch (e) {
    if (e instanceof DOMException)
      throw new Error("设备无法解码此音频，请转换成 WAV 或 MP3。");
    throw e;
  } finally {
    await context.close();
  }
}
