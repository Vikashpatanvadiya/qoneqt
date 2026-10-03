import type { StylePack } from "./types";

// Ad-agency look: charcoal page, stacked rounded panels, cream motion-graphic cards with concentric arcs, captions on a red pill.
export const studioAd: StylePack = {
  id: "studio_ad",
  name: "Studio Ad",
  mood: "confident, polished, product-launch",
  useFor: "launches, tools, before/after, marketing, creator economy, 'this changes everything' takes",
  emotions: ["surprise", "inspiration"],
  fonts: { heading: "BricolageGrotesque", body: "Inter", caption: "Inter", weightHeading: 800, weightBody: 700, headingCase: "none" },
  palette: { bg: ["#1c1c1e", "#f4f0e8"], fg: ["#ffffff", "#141414"], accent: ["#ff4b3a", "#ff8a00", "#14b8a6"], captionBg: "#ff4b3a", captionFg: "#ffffff", highlight: "#ff8a00" },
  surface: "dark",
  captions: { style: "pill", position: "bottom", maxWordsOnScreen: 2, size: 60, strokeWidth: 0, shadow: false, animation: "spring" },
  motion: { camera: "steady", easing: "snappy", zoomRange: [1.04, 1.12], shotLengthRange: [1.6, 2.6], transitionSet: ["slide", "cut", "wipe", "slide"], motionBlur: true, punchIn: true },
  imageTreatment: { grade: "vivid", grain: 0.03, vignette: 0.2, overlay: "none", blurBgFill: true },
  layouts: { hookLayout: "bleed", pointLayout: ["stacked", "inset"], cardLayout: ["text", "pills"], statLayout: "stat", ctaLayout: "text", motif: "arcs" },
  sfxProfile: "full",
  musicMoods: ["upbeat", "inspiring"],
};
