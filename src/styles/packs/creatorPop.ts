import type { StylePack } from "./types";

// Fast creator look: heavy outlined captions, yellow keywords, emoji pops on hits, handheld camera and punch-ins.
export const creatorPop: StylePack = {
  id: "creator_pop",
  name: "Creator Pop",
  mood: "energetic, funny, fast",
  useFor: "humor, trends, relatable everyday moments, money hacks, lists of quick tips",
  emotions: ["humor", "relatability", "surprise"],
  fonts: { heading: "Montserrat", body: "Montserrat", caption: "Montserrat", weightHeading: 900, weightBody: 800, headingCase: "upper" },
  palette: { bg: ["#140b2e", "#2a0f5c"], fg: ["#ffffff"], accent: ["#ffe14d", "#3df5ff", "#ff4d8d"], captionBg: "transparent", captionFg: "#ffffff", highlight: "#ffe14d" },
  surface: "dark",
  captions: { style: "kinetic", position: "bottom", maxWordsOnScreen: 3, size: 80, strokeWidth: 0.12, shadow: true, animation: "spring", emojiOnHits: true },
  motion: { camera: "handheld", easing: "snappy", zoomRange: [1.05, 1.14], shotLengthRange: [1.4, 2.4], transitionSet: ["slide", "wipe", "flip", "slide", "cut"], motionBlur: true, punchIn: true },
  imageTreatment: { grade: "vivid", grain: 0.04, vignette: 0.3, overlay: "none", blurBgFill: true },
  layouts: { hookLayout: "bleed", pointLayout: ["full", "full", "split"], cardLayout: ["text", "bleed"], statLayout: "image_stat", ctaLayout: "text", motif: "glow" },
  sfxProfile: "full",
  musicMoods: ["upbeat"],
};
