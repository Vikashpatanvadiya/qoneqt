// A Style Pack is the whole look of one video: fonts, colours, captions, motion, image treatment and layouts.
// Packs are plain data. The renderer (remotion/pack/*), the pipeline (Director, image grade, music) and the UI all read them.
// Every pack is distilled from editing techniques seen in short-form references (docs/style-library.md). No content is copied.

export type FontKey =
  | "Montserrat" | "Inter" | "InterTight" | "Archivo" | "ArchivoBlack" | "BricolageGrotesque" | "CormorantGaramond"
  | "InstrumentSerif" | "Newsreader" | "Fraunces" | "JetBrainsMono" | "SpaceMono" | "CourierPrime" | "Caveat" | "PatrickHand" | "Anton";

export type TransitionKind = "slide" | "wipe" | "flip" | "fade" | "cut";
export type CaptionStyle = "pop" | "karaoke" | "bar" | "handwritten" | "boxed" | "kinetic" | "pill" | "plain";
// Designed (no image) layouts and image layouts the pack renderer knows
export type CardLayout = "text" | "bleed" | "quote" | "pills";
export type ImageLayout = "full" | "framed" | "inset" | "pip" | "stacked" | "split";
export type StatLayout = "stat" | "stat_bars" | "image_stat";
export type CardMotif = "none" | "arcs" | "grid" | "lines" | "blocks" | "labels" | "glow" | "blur_type";

export type StylePack = {
  id: string;
  name: string;
  mood: string;
  // Shown to the Director: when this pack fits
  useFor: string;
  emotions: Array<"curiosity" | "surprise" | "inspiration" | "humor" | "debate" | "relatability">;
  fonts: { heading: FontKey; body: FontKey; caption: FontKey; weightHeading: number; weightBody: number; headingCase: "upper" | "none"; headingItalic?: boolean };
  // bg: card backgrounds, fg: text on them, accent: one is picked per video
  palette: { bg: string[]; fg: string[]; accent: string[]; captionBg: string; captionFg: string; highlight: string };
  surface: "dark" | "light";
  captions: {
    style: CaptionStyle;
    position: "bottom" | "center" | "top" | "split";
    maxWordsOnScreen: number;
    size: number;
    strokeWidth: number; // as a share of font size, 0 for none
    shadow: boolean;
    animation: "spring" | "fade" | "slide" | "none";
    emojiOnHits?: boolean;
  };
  motion: {
    camera: "handheld" | "steady" | "float";
    easing: "snappy" | "smooth";
    zoomRange: [number, number]; // image scale at the start and end of a beat
    shotLengthRange: [number, number]; // seconds per beat
    transitionSet: TransitionKind[];
    motionBlur: boolean;
    punchIn: boolean;
  };
  imageTreatment: { grade: string; grain: number; vignette: number; overlay: "none" | "grid" | "paper" | "scanlines"; blurBgFill: boolean; grayscale?: boolean };
  layouts: { hookLayout: CardLayout; pointLayout: ImageLayout[]; cardLayout: CardLayout[]; statLayout: StatLayout; ctaLayout: CardLayout; motif: CardMotif; label?: "fig" | "chapter" | "none" };
  sfxProfile: "full" | "soft" | "minimal" | "clicky";
  musicMoods: Array<"upbeat" | "calm" | "dramatic" | "inspiring">;
};
