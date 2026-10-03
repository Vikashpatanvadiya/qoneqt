import type { StylePack } from "./types";

// Builder-explainer look: navy UI cards, white uppercase heading with a coral second line, picture-in-picture, captions in a cyan box.
export const explainerUi: StylePack = {
  id: "explainer_ui",
  name: "Explainer UI",
  mood: "smart, fast, builder",
  useFor: "AI, apps, startups, step-by-step breakdowns, problems and fixes, comparisons",
  emotions: ["curiosity", "debate"],
  fonts: { heading: "InterTight", body: "JetBrainsMono", caption: "Inter", weightHeading: 800, weightBody: 500, headingCase: "upper" },
  palette: { bg: ["#0b1118", "#121b26"], fg: ["#ffffff"], accent: ["#ff5a4e", "#38bdf8", "#a3e635"], captionBg: "#2aa7d8", captionFg: "#ffffff", highlight: "#38bdf8" },
  surface: "dark",
  captions: { style: "boxed", position: "center", maxWordsOnScreen: 3, size: 52, strokeWidth: 0, shadow: false, animation: "none" },
  motion: { camera: "steady", easing: "snappy", zoomRange: [1.02, 1.06], shotLengthRange: [1.8, 3], transitionSet: ["cut", "cut", "slide", "fade"], motionBlur: false, punchIn: false },
  imageTreatment: { grade: "cool", grain: 0.02, vignette: 0.15, overlay: "grid", blurBgFill: true },
  layouts: { hookLayout: "text", pointLayout: ["pip", "split"], cardLayout: ["pills", "text"], statLayout: "stat_bars", ctaLayout: "text", motif: "grid", label: "chapter" },
  sfxProfile: "clicky",
  musicMoods: ["upbeat", "dramatic"],
};
