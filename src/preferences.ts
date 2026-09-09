export interface Preferences {
  voice: string;
  rate: number;
  fontSize: number;
  lineHeight: number;
  follow: boolean;
}
export const defaultPreferences: Preferences = {
  voice: "af_heart",
  rate: 0.9,
  fontSize: 22,
  lineHeight: 1.9,
  follow: true,
};
const key = "listen-learn-settings-v1";
export function loadPreferences(): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem(key) ?? "{}");
    return {
      voice:
        typeof p.voice === "string" &&
        (["af_heart", "am_michael", "bf_emma", "bm_george"].includes(p.voice) ||
          p.voice.startsWith("system:"))
          ? p.voice
          : defaultPreferences.voice,
      rate: [0.65, 0.8, 0.9, 1, 1.1].includes(p.rate)
        ? p.rate
        : defaultPreferences.rate,
      fontSize: [20, 22, 26, 30].includes(p.fontSize) ? p.fontSize : 22,
      lineHeight: [1.6, 1.9, 2.2].includes(p.lineHeight) ? p.lineHeight : 1.9,
      follow: typeof p.follow === "boolean" ? p.follow : true,
    };
  } catch {
    return { ...defaultPreferences };
  }
}
export function savePreferences(p: Preferences) {
  localStorage.setItem(key, JSON.stringify(p));
}
export const builtInVoices = [
  {
    id: "af_heart",
    name: "Heart",
    label: "美式女声",
    lang: "en-US",
    gender: "female",
  },
  {
    id: "am_michael",
    name: "Michael",
    label: "美式男声",
    lang: "en-US",
    gender: "male",
  },
  {
    id: "bf_emma",
    name: "Emma",
    label: "英式女声",
    lang: "en-GB",
    gender: "female",
  },
  {
    id: "bm_george",
    name: "George",
    label: "英式男声",
    lang: "en-GB",
    gender: "male",
  },
];
