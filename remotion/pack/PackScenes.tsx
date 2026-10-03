// Scene renderer for Style Packs. Every font, colour, layout and motif comes from the pack.
import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FRAME, HIGH_CONTRAST_BACKING_ALPHA, fitText, textWidth } from "../../shared/layout";
import type { RenderScene } from "../../shared/types";
import { useAsset } from "../assets";
import { BACKING } from "../theme";
import type { ResolvedPack, SceneLook } from "./resolve";

const W = FRAME.width;
const H = FRAME.height;
const pct = (p: number) => (p / 100) * H;

// How the accent part of a heading is marked, per pack.
type AccentMode = "color" | "highlight" | "scribble" | "block";
const ACCENT_MODE: Record<string, AccentMode> = {
  highlighter_doc: "highlight",
  journal: "scribble",
  bold_poster: "block",
};
const accentMode = (rp: ResolvedPack): AccentMode => ACCENT_MODE[rp.spec.id] ?? "color";
// fitText measures Montserrat-like widths. Narrower or wider fonts scale the measured width.
const WIDTH: Record<string, number> = { Anton: 0.62, Caveat: 0.72, InstrumentSerif: 0.78, Newsreader: 0.88, InterTight: 0.92, Archivo: 0.95, CourierPrime: 1.05, Montserrat: 1.08, BricolageGrotesque: 0.98 };
const widthOf = (rp: ResolvedPack) => WIDTH[rp.spec.fonts.heading] ?? 1;
const leftAligned = (rp: ResolvedPack) => ["lab_notes", "bold_poster", "journal", "portrait_mono"].includes(rp.spec.id);

// Hand-drawn underline that draws itself in.
export const Scribble: React.FC<{ color: string; progress: number; width?: number }> = ({ color, progress, width = 100 }) => (
  <svg viewBox="0 0 100 12" preserveAspectRatio="none" style={{ position: "absolute", left: "-4%", bottom: "-0.18em", width: `${width + 8}%`, height: "0.32em", overflow: "visible" }}>
    <path d="M2 8 C 20 2, 35 11, 52 6 S 82 3, 98 7" fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - progress} />
  </svg>
);

// Heading text: words rise in one by one (instant on the hook), the last third of the words is the accent.
const Heading: React.FC<{ text: string; rp: ResolvedPack; box: { maxWidth: number; maxHeight: number; fontSize: number }; instant: boolean; ink: string; align: "left" | "center"; delay?: number }> = ({ text, rp, box, instant, ink, align, delay = 2 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const upper = rp.spec.fonts.headingCase === "upper";
  const words = text.split(/\s+/).filter(Boolean);
  const lineHeight = rp.spec.fonts.heading === "Caveat" ? 1.0 : rp.spec.fonts.heading === "Anton" ? 0.98 : 1.06;
  const fit = fitText(text, { ...box, maxWidth: box.maxWidth / widthOf(rp), minFontSize: Math.round(box.fontSize * 0.45), lineHeight, uppercase: upper });
  const accentFrom = words.length >= 3 ? words.length - Math.ceil(words.length / 3) : words.length;
  const mode = accentMode(rp);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: align === "left" ? "flex-start" : "center", gap: `0 ${fit.fontSize * 0.24}px`, fontFamily: rp.heading, fontWeight: rp.spec.fonts.weightHeading, fontSize: fit.fontSize, lineHeight, textTransform: upper ? "uppercase" : "none", textAlign: align, letterSpacing: rp.spec.fonts.heading === "InterTight" ? -1 : 0 }}>
      {words.map((word, i) => {
        const pop = instant ? 1 : spring({ frame: frame - delay - i * 3, fps, config: { damping: 15, stiffness: 170 } });
        const accent = i >= accentFrom;
        const mark = accent ? interpolate(frame - delay - accentFrom * 3, [4, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
        const style: React.CSSProperties = { display: "inline-block", position: "relative", color: ink, opacity: Math.min(1, pop * 1.4), transform: `translateY(${(1 - pop) * 40}px)` };
        if (accent && mode === "color") style.color = rp.accent;
        if (accent && mode === "highlight") style.background = `linear-gradient(90deg, ${rp.spec.palette.highlight} ${mark * 100}%, transparent ${mark * 100}%) 0 62% / 100% 46% no-repeat`;
        if (accent && mode === "block") Object.assign(style, { background: rp.accent, color: "#ffffff", padding: "0 0.12em" });
        return (
          <span key={i} style={style}>
            {word}
            {accent && mode === "scribble" ? <Scribble color={rp.accent} progress={mark} /> : null}
          </span>
        );
      })}
    </div>
  );
};

// Background decorations that make each pack recognisable.
const Motif: React.FC<{ rp: ResolvedPack; frames: number; scene: RenderScene; index: number }> = ({ rp, frames, scene, index }) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, frames], [0, 1]);
  const draw = interpolate(frame, [0, 24], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const m = rp.spec.layouts.motif;
  const colors = [...rp.spec.palette.accent, rp.fg];
  if (m === "arcs") {
    return (
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {colors.slice(0, 4).map((c, i) => {
          const r = 400 - i * 58;
          return <path key={i} d={`M ${540 - r} ${H + 40} A ${r} ${r} 0 0 1 ${540 + r} ${H + 40}`} fill="none" stroke={c} strokeWidth={44} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.min(1, draw * 1.2 - i * 0.08)} opacity={0.9} />;
        })}
      </svg>
    );
  }
  if (m === "grid") {
    const line = rp.light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)";
    return <AbsoluteFill style={{ backgroundImage: `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`, backgroundSize: "90px 90px", backgroundPosition: `${drift * 30}px 0` }} />;
  }
  if (m === "lines") {
    return (
      <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(180deg, transparent 0 86px, rgba(47,111,214,0.16) 86px 88px)", backgroundPosition: "0 40px" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 120, width: 3, background: "rgba(226,70,59,0.35)" }} />
      </AbsoluteFill>
    );
  }
  if (m === "blocks") {
    const slide = spring({ frame, fps: 30, config: { damping: 18, stiffness: 140 } });
    return (
      <>
        <div style={{ position: "absolute", right: -40 + (1 - slide) * 300, top: pct(80), width: 360, height: 180, background: rp.accent }} />
        <div style={{ position: "absolute", left: -60 - (1 - slide) * 300, top: pct(8.5), width: 260, height: 26, background: rp.fg }} />
      </>
    );
  }
  if (m === "glow") {
    return <AbsoluteFill style={{ background: `radial-gradient(900px 900px at ${20 + drift * 15}% ${18 + drift * 6}%, ${rp.accent}44, transparent 70%), radial-gradient(900px 900px at ${85 - drift * 15}% 85%, ${rp.spec.palette.accent[1] ?? rp.accent}33, transparent 70%)` }} />;
  }
  if (m === "blur_type") {
    const word = (scene.onScreenText.split(/\s+/)[0] ?? "").replace(/[^\p{L}\p{N}]/gu, "");
    return <div style={{ position: "absolute", left: -40 - drift * 80, top: pct(36), fontFamily: rp.heading, fontSize: 380, fontWeight: 700, color: rp.fg, opacity: 0.08, filter: "blur(6px)", whiteSpace: "nowrap" }}>{word}</div>;
  }
  if (m === "labels") return <FigLabel rp={rp} scene={scene} index={index} />;
  return null;
};

// Tiny mono annotation at the top: "FIG. 03 — POINT" or "STEP 03".
const FigLabel: React.FC<{ rp: ResolvedPack; scene: RenderScene; index: number }> = ({ rp, scene, index }) => {
  const frame = useCurrentFrame();
  const n = String(index + 1).padStart(2, "0");
  const text = rp.spec.layouts.label === "chapter" ? `STEP ${n}` : `FIG. ${n} — ${(scene.purpose ?? "point").toUpperCase()}`;
  const shown = text.slice(0, Math.ceil(interpolate(frame, [0, 14], [0, text.length], { extrapolateRight: "clamp" })));
  return (
    <div style={{ position: "absolute", top: pct(10.6), left: 80, right: 80, display: "flex", justifyContent: "space-between", fontFamily: rp.body, fontSize: 24, letterSpacing: 3, color: rp.light ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.55)" }}>
      <span style={rp.spec.layouts.label === "chapter" ? { border: `2px solid ${rp.accent}`, color: rp.accent, borderRadius: 999, padding: "4px 16px" } : {}}>{shown}</span>
      <span>PULSE STUDIO</span>
    </div>
  );
};

const Surface: React.FC<{ rp: ResolvedPack; color?: string; children?: React.ReactNode }> = ({ rp, color, children }) => <AbsoluteFill style={{ background: color ?? rp.bg }}>{children}</AbsoluteFill>;

// "73%" counts up from 0. Anything without a number is shown as is.
function useCount(value: string, from = 2, to = 26): string {
  const frame = useCurrentFrame();
  const match = value.match(/^(\D*)([\d.,]+)(.*)$/);
  if (!match) return value;
  const target = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(target)) return value;
  const decimals = (match[2].split(".")[1] ?? "").length;
  const count = interpolate(frame, [from, to], [0, target], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const shown = decimals ? count.toFixed(decimals) : Math.round(count).toLocaleString("en-IN");
  return `${match[1]}${shown}${match[3]}`;
}

const Bars: React.FC<{ rp: ResolvedPack }> = ({ rp }) => {
  const frame = useCurrentFrame();
  const heights = [0.08, 0.12, 0.1, 0.2, 0.32, 0.55, 1];
  return (
    <div style={{ position: "relative", width: 900, height: 420, borderLeft: `2px solid ${rp.fg}55`, borderBottom: `2px solid ${rp.fg}55`, display: "flex", alignItems: "flex-end", gap: 22, padding: "0 24px" }}>
      {heights.map((h, i) => {
        const grow = interpolate(frame, [4 + i * 3, 18 + i * 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
        return <div key={i} style={{ flex: 1, height: `${h * grow * 100}%`, background: i === heights.length - 1 ? rp.accent : `${rp.accent}88`, borderRadius: "4px 4px 0 0" }} />;
      })}
    </div>
  );
};

const QuoteCard: React.FC<{ rp: ResolvedPack; text: string; instant: boolean }> = ({ rp, text, instant }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = instant ? 1 : spring({ frame: frame - 2, fps, config: { damping: 16, stiffness: 150 } });
  const stamp = spring({ frame: frame - 16, fps, config: { damping: 10, stiffness: 220 } });
  const paper = rp.light ? "#ffffff" : "#f4efe4";
  return (
    <div style={{ width: 900, background: paper, color: "#1a1a1a", borderRadius: 18, padding: "44px 52px 56px", boxShadow: "0 30px 70px rgba(0,0,0,0.35)", transform: `rotate(-1.6deg) translateY(${(1 - pop) * 80}px)`, opacity: pop, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 26, fontFamily: rp.body, fontSize: 26, color: "#555" }}>
        <div style={{ width: 56, height: 56, borderRadius: 999, background: rp.accent }} />
        <div>
          <div style={{ fontWeight: 700, color: "#1a1a1a" }}>Community voice</div>
          <div>on Qoneqt</div>
        </div>
      </div>
      <Heading text={`“${text}”`} rp={rp} box={{ maxWidth: 790, maxHeight: 520, fontSize: 84 }} instant ink="#1a1a1a" align="left" />
      <div style={{ position: "absolute", right: 34, bottom: -34, transform: `rotate(-8deg) scale(${0.6 + 0.4 * stamp})`, opacity: stamp, border: `5px solid ${rp.accent}`, color: rp.accent, fontFamily: rp.body, fontWeight: 800, fontSize: 30, letterSpacing: 3, padding: "8px 20px", borderRadius: 8, background: paper }}>HEARD IT</div>
    </div>
  );
};

const Pills: React.FC<{ rp: ResolvedPack; scene: RenderScene; instant: boolean }> = ({ rp, scene, instant }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const extra = scene.emphasisWords.filter((w) => w && !scene.onScreenText.toLowerCase().includes(w.toLowerCase())).slice(0, 3);
  const items = [...extra.slice(0, 2), scene.onScreenText, ...extra.slice(2)];
  const active = items.indexOf(scene.onScreenText);
  const onBlue = rp.spec.id === "highlighter_doc";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
      {items.map((item, i) => {
        const pop = instant ? 1 : spring({ frame: frame - 2 - i * 4, fps, config: { damping: 14, stiffness: 190 } });
        const on = i === active;
        const fit = fitText(item, { maxWidth: 820, maxHeight: on ? 260 : 90, fontSize: on ? 86 : 54, minFontSize: 34, lineHeight: 1.05 });
        return (
          <div key={i} style={{ background: on ? (onBlue ? "#ffffff" : rp.accent) : onBlue ? "rgba(255,255,255,0.75)" : rp.light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)", color: on ? (onBlue ? "#161616" : "#ffffff") : onBlue ? "#3a3a3a" : rp.fg, fontFamily: rp.body, fontWeight: 700, fontSize: fit.fontSize, lineHeight: 1.05, padding: on ? "22px 48px" : "14px 38px", borderRadius: 999, textAlign: "center", opacity: Math.min(1, pop * 1.3) * (on ? 1 : 0.85), transform: `translateY(${(1 - pop) * 40}px) scale(${on ? 1 : 0.92})`, boxShadow: on ? "0 18px 40px rgba(0,0,0,0.25)" : "none", maxWidth: 940 }}>
            {item}
          </div>
        );
      })}
    </div>
  );
};

// Designed scene (no image): text, bleed, quote, pills, stat, stat_bars.
export const PackCard: React.FC<{ scene: RenderScene; rp: ResolvedPack; look: SceneLook; index: number; frames: number; instant?: boolean }> = ({ scene, rp, look, index, frames, instant }) => {
  const isHook = index === 0;
  const now = isHook || Boolean(instant);
  const align = leftAligned(rp) ? "left" : "center";
  const ink = rp.fg;
  const layout = look.layout;
  const top = pct(16);
  const bottom = pct(38);
  const box = { left: 80, right: 80, top, height: H - top - bottom };
  const bg = layout === "pills" && rp.spec.id === "highlighter_doc" ? rp.bg2 : rp.bg;

  let body: React.ReactNode;
  if (layout === "bleed") {
    // Full-bleed type: a few words per line, as large as the width allows.
    const words = scene.onScreenText.split(/\s+/).filter(Boolean);
    const per = words.length > 6 ? 3 : words.length > 3 ? 2 : 1;
    const lines: string[] = [];
    for (let i = 0; i < words.length; i += per) lines.push(words.slice(i, i + per).join(" "));
    const upper = rp.spec.fonts.headingCase === "upper";
    // Each line must fit on one line: width estimate x 1.1 for heavy display fonts, and the box height.
    const size = Math.floor(Math.min(260, box.height / lines.length / 0.95, ...lines.map((l) => (W - 160) / (textWidth(l, 1, upper) * widthOf(rp) * 1.05))));
    body = <BleedText lines={lines} rp={rp} size={size} instant={now} ink={ink} upper={upper} />;
  } else if (layout === "quote") {
    body = <QuoteCard rp={rp} text={scene.onScreenText} instant={now} />;
  } else if (layout === "pills") {
    body = <Pills rp={rp} scene={scene} instant={now} />;
  } else if (layout === "stat" || layout === "stat_bars") {
    body = <StatBlock rp={rp} scene={scene} bars={layout === "stat_bars"} ink={ink} align={align} />;
  } else {
    body = <Heading text={scene.onScreenText} rp={rp} box={{ maxWidth: W - 160, maxHeight: box.height, fontSize: isHook ? 130 : 108 }} instant={now} ink={ink} align={align} />;
  }

  return (
    <Surface rp={rp} color={bg}>
      {layout === "pills" && rp.spec.id === "highlighter_doc" ? null : <Motif rp={rp} frames={frames} scene={scene} index={index} />}
      {rp.spec.layouts.label && rp.spec.layouts.motif !== "labels" ? <FigLabel rp={rp} scene={scene} index={index} /> : null}
      <div style={{ position: "absolute", left: box.left, right: box.right, top: box.top, height: box.height, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: align === "left" && layout !== "pills" && layout !== "quote" ? "flex-start" : "center" }}>{body}</div>
    </Surface>
  );
};

const BleedText: React.FC<{ lines: string[]; rp: ResolvedPack; size: number; instant: boolean; ink: string; upper: boolean }> = ({ lines, rp, size, instant, ink, upper }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ fontFamily: rp.heading, fontWeight: rp.spec.fonts.weightHeading, fontSize: size, lineHeight: 0.95, textTransform: upper ? "uppercase" : "none", letterSpacing: -2 }}>
      {lines.map((line, i) => {
        const pop = instant ? 1 : spring({ frame: frame - i * 4, fps, config: { damping: 13, stiffness: 210 } });
        const last = i === lines.length - 1 && lines.length > 1;
        return (
          <div key={i} style={{ color: last ? (rp.spec.id === "bold_poster" ? "#ffffff" : rp.accent) : ink, background: last && rp.spec.id === "bold_poster" ? rp.accent : undefined, padding: last && rp.spec.id === "bold_poster" ? "0 16px" : undefined, display: "table", transform: `translateX(${(1 - pop) * -120}px)`, opacity: Math.min(1, pop * 1.5), whiteSpace: "nowrap" }}>
            {line}
          </div>
        );
      })}
    </div>
  );
};

const StatBlock: React.FC<{ rp: ResolvedPack; scene: RenderScene; bars: boolean; ink: string; align: "left" | "center" }> = ({ rp, scene, bars, ink, align }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const value = useCount(scene.statValue ?? "");
  const grow = spring({ frame: frame - 2, fps, config: { damping: 16, stiffness: 120 } });
  const serif = ["InstrumentSerif", "Newsreader", "CormorantGaramond", "Fraunces"].includes(rp.spec.fonts.heading);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align === "left" ? "flex-start" : "center", gap: 30 }}>
      <div style={{ fontFamily: rp.heading, fontWeight: rp.spec.fonts.weightHeading, fontSize: bars ? 220 : 300, lineHeight: 0.9, color: rp.accent, letterSpacing: serif ? -4 : -8, transform: `scale(${0.75 + 0.25 * grow})`, transformOrigin: align === "left" ? "left center" : "center", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ maxWidth: W - 160 }}>
        <Heading text={scene.onScreenText} rp={{ ...rp, accent: ink }} box={{ maxWidth: W - 160, maxHeight: 240, fontSize: 64 }} instant ink={ink} align={align} />
      </div>
      {bars ? <Bars rp={rp} /> : null}
    </div>
  );
};

const STACK_LABEL: Record<string, string> = { hook: "Watch this", context: "The setup", point: "The point", twist: "Plot twist", cta: "Your turn" };

// Image scene: full, framed, inset, pip, stacked, split, image_stat.
export const PackImage: React.FC<{ scene: RenderScene; rp: ResolvedPack; look: SceneLook; index: number; frames: number; transform: string; titleAlreadyIn?: boolean }> = ({ scene, rp, look, index, frames, transform, titleAlreadyIn }) => {
  const frame = useCurrentFrame();
  const asset = useAsset();
  const isHook = index === 0;
  const instant = isHook || Boolean(titleAlreadyIn);
  const t = rp.spec.imageTreatment;
  const filter = t.grayscale ? "grayscale(1) contrast(1.12) brightness(1.04)" : rp.spec.id === "explainer_ui" ? "saturate(0.92) contrast(1.05)" : "saturate(1.05) contrast(1.03)";
  const img = (radius = 0) => (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", borderRadius: radius }}>
      <Img src={asset(scene.imageFile!)} style={{ width: "100%", height: "100%", objectFit: "cover", transform, filter }} />
    </div>
  );
  const layout = look.layout;
  const enter = instant ? 1 : interpolate(frame, [3, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const align = leftAligned(rp) ? "left" : "center";

  if (layout === "full" || layout === "image_stat") {
    const box = { maxWidth: W - 140, maxHeight: pct(45) - pct(14), fontSize: isHook ? 112 : 80 };
    return (
      <AbsoluteFill style={{ background: "black" }}>
        {img()}
        <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.78) 100%)" }} />
        <div style={{ position: "absolute", top: pct(14), left: 70, right: 70, display: "flex", justifyContent: align === "left" ? "flex-start" : "center", opacity: enter, transform: `translateY(${(1 - enter) * 30}px)` }}>
          <div style={{ textShadow: "0 4px 18px rgba(0,0,0,0.85)", ...(scene.highContrast ? { backgroundColor: BACKING(HIGH_CONTRAST_BACKING_ALPHA), borderRadius: 24, padding: "16px 26px" } : {}) }}>
            <Heading text={scene.onScreenText} rp={{ ...rp, accent: rp.light ? rp.spec.palette.highlight : rp.accent }} box={box} instant={instant} ink="#ffffff" align={align} />
          </div>
        </div>
        {layout === "image_stat" && scene.statValue ? <ImageStat rp={rp} value={scene.statValue} /> : null}
      </AbsoluteFill>
    );
  }

  if (layout === "framed") {
    const tilt = index % 2 === 0 ? -2 : 1.6;
    return (
      <Surface rp={rp}>
        <Motif rp={rp} frames={frames} scene={scene} index={index} />
        <div style={{ position: "absolute", left: 100, right: 100, top: pct(12), height: pct(52), background: "#fffdf8", padding: "24px 24px 150px", boxShadow: "0 26px 50px rgba(40,30,20,0.28)", transform: `rotate(${tilt}deg) translateY(${(1 - enter) * 60}px)` }}>
          {img(4)}
          <div style={{ position: "absolute", left: 30, right: 30, bottom: 18, height: 120, display: "flex", alignItems: "center" }}>
            <Heading text={scene.onScreenText} rp={rp} box={{ maxWidth: 820, maxHeight: 120, fontSize: 76 }} instant={instant} ink={rp.fg} align="left" />
          </div>
          <div style={{ position: "absolute", top: -26, left: "50%", width: 200, height: 54, marginLeft: -100, background: "rgba(248,225,75,0.65)", transform: "rotate(-4deg)" }} />
        </div>
      </Surface>
    );
  }

  if (layout === "inset") {
    const imageTop = pct(30);
    return (
      <Surface rp={rp} color={rp.light ? `linear-gradient(170deg, ${rp.bg} 0%, ${rp.bg2} 100%)` : rp.bg}>
        <Motif rp={rp} frames={frames} scene={scene} index={index} />
        <div style={{ position: "absolute", top: pct(13), left: 80, right: 80, height: imageTop - pct(13) - 30, display: "flex", alignItems: "flex-end", justifyContent: align === "left" ? "flex-start" : "center" }}>
          <Heading text={scene.onScreenText} rp={rp} box={{ maxWidth: W - 160, maxHeight: imageTop - pct(13) - 30, fontSize: 84 }} instant={instant} ink={rp.fg} align={align} />
        </div>
        <div style={{ position: "absolute", left: 80, right: 80, top: imageTop, height: pct(31), borderRadius: 34, overflow: "hidden", boxShadow: rp.light ? "0 30px 60px rgba(0,0,0,0.18)" : "0 30px 60px rgba(0,0,0,0.5)", transform: `scale(${0.94 + 0.06 * enter})`, opacity: Math.min(1, enter * 1.5) }}>{img()}</div>
      </Surface>
    );
  }

  if (layout === "pip") {
    const headTop = pct(15);
    const imageTop = pct(36);
    return (
      <Surface rp={rp}>
        <Motif rp={rp} frames={frames} scene={scene} index={index} />
        {rp.spec.layouts.label && rp.spec.layouts.motif !== "labels" ? <FigLabel rp={rp} scene={scene} index={index} /> : null}
        <div style={{ position: "absolute", top: headTop, left: 80, right: 80, height: imageTop - headTop - 40, display: "flex", alignItems: "center", justifyContent: align === "left" ? "flex-start" : "center" }}>
          <Heading text={scene.onScreenText} rp={rp} box={{ maxWidth: W - 160, maxHeight: imageTop - headTop - 40, fontSize: 80 }} instant={instant} ink={rp.fg} align={align} />
        </div>
        <div style={{ position: "absolute", left: 140, right: 140, top: imageTop, height: pct(25), borderRadius: 22, overflow: "hidden", border: `2px solid ${rp.fg}22`, boxShadow: "0 24px 60px rgba(0,0,0,0.5)", transform: `translateY(${(1 - enter) * 50}px)`, opacity: enter }}>
          {img()}
          <div style={{ position: "absolute", left: 18, top: 16, fontFamily: rp.body, fontSize: 22, letterSpacing: 2, color: "#fff", background: "rgba(0,0,0,0.55)", borderRadius: 8, padding: "4px 12px" }}>● REC</div>
        </div>
      </Surface>
    );
  }

  if (layout === "stacked") {
    return (
      <Surface rp={rp}>
        <div style={{ position: "absolute", top: pct(11.5), left: 0, right: 0, textAlign: "center", fontFamily: rp.heading, fontWeight: 800, fontSize: 52, color: "#ffffff" }}>{STACK_LABEL[scene.purpose ?? "point"] ?? "The point"}</div>
        <div style={{ position: "absolute", left: 90, right: 90, top: pct(16), height: pct(29), borderRadius: 28, overflow: "hidden" }}>{img()}</div>
        <div style={{ position: "absolute", left: 90, right: 90, top: pct(47), height: pct(27), borderRadius: 28, overflow: "hidden", background: rp.bg2, transform: `translateY(${(1 - enter) * 80}px)`, opacity: enter }}>
          <Motif rp={{ ...rp, fg: "#141414" }} frames={frames} scene={scene} index={index} />
          <div style={{ position: "absolute", inset: "40px 40px 160px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Heading text={scene.onScreenText} rp={rp} box={{ maxWidth: 820, maxHeight: pct(27) - 200, fontSize: 84 }} instant={instant} ink="#141414" align="center" />
          </div>
        </div>
      </Surface>
    );
  }

  // split: picture on top, text block below
  const split = pct(52);
  return (
    <Surface rp={rp}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: split, overflow: "hidden" }}>{img()}</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: split - 2, height: 10, background: rp.accent, transform: `scaleX(${enter})`, transformOrigin: "left" }} />
      <div style={{ position: "absolute", left: 80, right: 80, top: split + 36, height: pct(61) - split - 36, display: "flex", alignItems: "flex-start", justifyContent: align === "left" ? "flex-start" : "center" }}>
        <Heading text={scene.onScreenText} rp={rp} box={{ maxWidth: W - 160, maxHeight: pct(61) - split - 40, fontSize: 84 }} instant={instant} ink={rp.fg} align={align} />
      </div>
    </Surface>
  );
};

const ImageStat: React.FC<{ rp: ResolvedPack; value: string }> = ({ rp, value }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shown = useCount(value, 4, 28);
  const pop = spring({ frame: frame - 4, fps, config: { damping: 11, stiffness: 200 } });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: pct(42), display: "flex", justifyContent: "center" }}>
      <div style={{ fontFamily: rp.heading, fontWeight: rp.spec.fonts.weightHeading, fontSize: 220, lineHeight: 1, color: rp.accent, WebkitTextStroke: "10px rgba(0,0,0,0.9)", paintOrder: "stroke fill", transform: `scale(${0.5 + 0.5 * pop}) rotate(${(1 - pop) * -8}deg)`, fontVariantNumeric: "tabular-nums" }}>{shown}</div>
    </div>
  );
};

// Pack outro: same fonts and colours as the video, with the Pulse Studio credit.
export const PackOutro: React.FC<{ rp: ResolvedPack; communityName: string; cta: string; logoFile: string | null }> = ({ rp, communityName, cta, logoFile }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const asset = useAsset();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 160 } });
  const rise = interpolate(frame, [4, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ctaFit = fitText(cta, { maxWidth: W - 160, maxHeight: 360, fontSize: 80, minFontSize: 44, lineHeight: 1.12 });
  return (
    <AbsoluteFill style={{ background: rp.bg, color: rp.fg }}>
      <div style={{ position: "absolute", top: "16%", bottom: "24%", left: 80, right: 80, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ transform: `scale(${0.8 + 0.2 * pop})`, opacity: Math.min(1, pop * 1.5) }}>
          {logoFile ? <Img src={asset(logoFile)} style={{ height: 140, filter: rp.light ? "invert(1)" : undefined }} /> : <div style={{ fontFamily: rp.heading, fontSize: 140, fontWeight: rp.spec.fonts.weightHeading }}>Qoneqt</div>}
        </div>
        <div style={{ marginTop: 22, fontFamily: rp.body, fontSize: 40, fontWeight: 600, color: rp.accent, opacity: rise, letterSpacing: 1 }}>{communityName}</div>
        <div style={{ marginTop: 90, fontFamily: rp.heading, fontWeight: rp.spec.fonts.weightHeading, fontSize: ctaFit.fontSize, lineHeight: 1.12, opacity: rise, transform: `translateY(${(1 - rise) * 30}px)` }}>{cta}</div>
        <div style={{ marginTop: 60, fontFamily: rp.body, fontSize: 38, fontWeight: 600, opacity: rise * 0.9, border: `3px solid ${rp.accent}`, borderRadius: 999, padding: "12px 36px" }}>Tell us in the comments</div>
        <div style={{ marginTop: 54, fontFamily: rp.body, fontSize: 26, fontWeight: 600, opacity: rise * 0.6, letterSpacing: 1 }}>Made with Pulse Studio · AI-generated</div>
      </div>
    </AbsoluteFill>
  );
};

// Pack overlay on top of everything: grain, vignette, grid, paper or scanlines.
export const PackFilm: React.FC<{ rp: ResolvedPack; grainFile: string | null }> = ({ rp, grainFile }) => {
  const frame = useCurrentFrame();
  const asset = useAsset();
  const t = rp.spec.imageTreatment;
  const step = Math.floor(frame / 2);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {grainFile && t.grain > 0 ? <AbsoluteFill style={{ backgroundImage: `url(${asset(grainFile)})`, backgroundPosition: `${(step * 73) % 256}px ${(step * 151) % 256}px`, opacity: t.grain, mixBlendMode: "overlay" }} /> : null}
      {t.overlay === "scanlines" ? <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(180deg, rgba(0,0,0,0.12) 0 2px, transparent 2px 5px)" }} /> : null}
      {t.overlay === "paper" ? <AbsoluteFill style={{ background: "radial-gradient(ellipse at 30% 20%, rgba(255,250,235,0.08), transparent 60%)", mixBlendMode: "multiply" }} /> : null}
      {t.vignette > 0 ? <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,${t.vignette}) 100%)` }} /> : null}
    </AbsoluteFill>
  );
};
