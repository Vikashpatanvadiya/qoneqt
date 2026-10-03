import type { StylePack } from "./types";

// Science-explainer look: near-black page, tiny mono figure labels, thin serif numerals in coral, cream diagrams, bar charts.
export const labNotes: StylePack = {
  id: "lab_notes",
  name: "Lab Notes",
  mood: "precise, curious, data-led",
  useFor: "explainers, research, numbers, how something works, science and tech facts",
  emotions: ["curiosity", "surprise"],
  fonts: { heading: "InstrumentSerif", body: "JetBrainsMono", caption: "Inter", weightHeading: 400, weightBody: 500, headingCase: "none" },
  palette: { bg: ["#0f0e0d", "#171513"], fg: ["#efe8dc"], accent: ["#ff6b4a", "#f2a65a", "#e85d75"], captionBg: "transparent", captionFg: "#ffffff", highlight: "#ff6b4a" },
  surface: "dark",
  captions: { style: "plain", position: "center", maxWordsOnScreen: 2, size: 58, strokeWidth: 0, shadow: true, animation: "fade" },
  motion: { camera: "steady", easing: "smooth", zoomRange: [1.03, 1.08], shotLengthRange: [2.2, 3.5], transitionSet: ["cut", "fade", "cut", "wipe"], motionBlur: false, punchIn: false },
  imageTreatment: { grade: "film", grain: 0.05, vignette: 0.35, overlay: "none", blurBgFill: true },
  layouts: { hookLayout: "text", pointLayout: ["pip", "full"], cardLayout: ["text", "quote"], statLayout: "stat_bars", ctaLayout: "text", motif: "labels", label: "fig" },
  sfxProfile: "clicky",
  musicMoods: ["calm", "dramatic"],
};
