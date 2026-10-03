import type { StylePack } from "./types";

// Documentary-portrait look: grayscale photos on a soft light gradient, typewriter name tags, huge blurred type behind.
export const portraitMono: StylePack = {
  id: "portrait_mono",
  name: "Portrait Mono",
  mood: "human, reflective, story",
  useFor: "personal stories, journeys, community members, before and after, milestones",
  emotions: ["inspiration", "relatability"],
  fonts: { heading: "CourierPrime", body: "Inter", caption: "Inter", weightHeading: 700, weightBody: 600, headingCase: "none" },
  palette: { bg: ["#f2f2f0", "#d9d9d6"], fg: ["#1a1a1a"], accent: ["#1a1a1a", "#c8102e"], captionBg: "transparent", captionFg: "#ffffff", highlight: "#c8102e" },
  surface: "light",
  captions: { style: "plain", position: "center", maxWordsOnScreen: 4, size: 52, strokeWidth: 0.06, shadow: true, animation: "fade" },
  motion: { camera: "float", easing: "smooth", zoomRange: [1.02, 1.1], shotLengthRange: [2.6, 4], transitionSet: ["fade", "fade", "cut", "slide"], motionBlur: true, punchIn: false },
  imageTreatment: { grade: "mono", grain: 0.05, vignette: 0.25, overlay: "none", blurBgFill: true, grayscale: true },
  layouts: { hookLayout: "bleed", pointLayout: ["inset", "full"], cardLayout: ["text", "quote"], statLayout: "stat", ctaLayout: "text", motif: "blur_type" },
  sfxProfile: "minimal",
  musicMoods: ["inspiring", "calm"],
};
