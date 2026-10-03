import type { StylePack } from "./types";

// Handwritten journal look: ruled paper, marker handwriting, taped polaroids, scribbled underlines on key words, soft fades.
export const journal: StylePack = {
  id: "journal",
  name: "Handwritten Journal",
  mood: "warm, personal, honest",
  useFor: "student life, money diaries, self-improvement, feelings, small wins, lessons learned",
  emotions: ["relatability", "inspiration", "humor"],
  fonts: { heading: "Caveat", body: "PatrickHand", caption: "PatrickHand", weightHeading: 700, weightBody: 400, headingCase: "none" },
  palette: { bg: ["#f6f1e5", "#efe6d2"], fg: ["#1e2a44"], accent: ["#e2463b", "#2f6fd6", "#2e9e6a"], captionBg: "#fffdf6", captionFg: "#1e2a44", highlight: "#e2463b" },
  surface: "light",
  captions: { style: "handwritten", position: "bottom", maxWordsOnScreen: 4, size: 66, strokeWidth: 0, shadow: false, animation: "fade" },
  motion: { camera: "float", easing: "smooth", zoomRange: [1.02, 1.06], shotLengthRange: [2.4, 3.8], transitionSet: ["fade", "fade", "slide"], motionBlur: false, punchIn: false },
  imageTreatment: { grade: "warm", grain: 0.04, vignette: 0.1, overlay: "paper", blurBgFill: true },
  layouts: { hookLayout: "text", pointLayout: ["framed", "framed", "inset"], cardLayout: ["text", "quote"], statLayout: "stat", ctaLayout: "text", motif: "lines" },
  sfxProfile: "soft",
  musicMoods: ["calm", "inspiring"],
};
