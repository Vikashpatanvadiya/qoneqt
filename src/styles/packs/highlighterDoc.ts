import type { StylePack } from "./types";

// Reading-list look: soft grey page, serif headline, yellow highlighter on key words, stacked white pills on blue.
export const highlighterDoc: StylePack = {
  id: "highlighter_doc",
  name: "Highlighter Doc",
  mood: "thoughtful, useful, calm",
  useFor: "tips, lists, career, study, productivity, 'here is what to do' posts",
  emotions: ["relatability", "inspiration"],
  fonts: { heading: "Newsreader", body: "Inter", caption: "Inter", weightHeading: 600, weightBody: 600, headingCase: "none" },
  palette: { bg: ["#e9e7e2", "#3d7fc4"], fg: ["#161616", "#ffffff"], accent: ["#f8e14b", "#3d7fc4"], captionBg: "transparent", captionFg: "#ffffff", highlight: "#f8e14b" },
  surface: "light",
  captions: { style: "plain", position: "center", maxWordsOnScreen: 3, size: 58, strokeWidth: 0.08, shadow: true, animation: "slide" },
  motion: { camera: "float", easing: "smooth", zoomRange: [1.02, 1.07], shotLengthRange: [2.4, 3.6], transitionSet: ["fade", "slide", "fade", "cut"], motionBlur: true, punchIn: false },
  imageTreatment: { grade: "soft", grain: 0.02, vignette: 0.1, overlay: "none", blurBgFill: true },
  layouts: { hookLayout: "text", pointLayout: ["inset", "split"], cardLayout: ["pills", "text", "quote"], statLayout: "stat", ctaLayout: "pills", motif: "none" },
  sfxProfile: "soft",
  musicMoods: ["calm", "inspiring"],
};
