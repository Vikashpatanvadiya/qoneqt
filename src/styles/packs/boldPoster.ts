import type { StylePack } from "./types";

// Brutalist poster look: white page, heavy black condensed caps, electric blue blocks, hard cuts.
export const boldPoster: StylePack = {
  id: "bold_poster",
  name: "Bold Poster",
  mood: "loud, opinionated, graphic",
  useFor: "hot takes, debates, myths, strong opinions, short punchy lists",
  emotions: ["debate", "surprise"],
  fonts: { heading: "Anton", body: "Archivo", caption: "Archivo", weightHeading: 400, weightBody: 800, headingCase: "upper" },
  palette: { bg: ["#f7f7f4", "#1f3bff"], fg: ["#0a0a0a", "#ffffff"], accent: ["#1f3bff", "#ff3b1f"], captionBg: "#0a0a0a", captionFg: "#ffffff", highlight: "#1f3bff" },
  surface: "light",
  captions: { style: "bar", position: "bottom", maxWordsOnScreen: 3, size: 64, strokeWidth: 0, shadow: false, animation: "none" },
  motion: { camera: "steady", easing: "snappy", zoomRange: [1.06, 1.16], shotLengthRange: [1.2, 2], transitionSet: ["cut", "cut", "wipe", "cut"], motionBlur: false, punchIn: true },
  imageTreatment: { grade: "contrast", grain: 0.03, vignette: 0, overlay: "none", blurBgFill: false },
  layouts: { hookLayout: "bleed", pointLayout: ["split", "full"], cardLayout: ["bleed", "text"], statLayout: "stat", ctaLayout: "bleed", motif: "blocks" },
  sfxProfile: "full",
  musicMoods: ["dramatic", "upbeat"],
};
