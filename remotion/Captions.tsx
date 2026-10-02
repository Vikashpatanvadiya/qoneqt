import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { WordTiming } from "../shared/types";

const WORDS_PER_GROUP = 3;

// Basic word-by-word captions: a few words at a time, current word highlighted.
export const Captions: React.FC<{ words: WordTiming[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (words.length === 0) return null;

  // The current word is the last one that has started.
  let current = 0;
  for (let i = 0; i < words.length; i++) if (words[i].startSec <= t) current = i;
  const groupStart = Math.floor(current / WORDS_PER_GROUP) * WORDS_PER_GROUP;
  const group = words.slice(groupStart, groupStart + WORDS_PER_GROUP);

  return (
    // Sits above the bottom 20% safe zone
    <div
      style={{
        position: "absolute",
        bottom: "27%",
        left: 60,
        right: 60,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "0 22px",
        fontFamily: "Helvetica, Arial, sans-serif",
        fontWeight: 800,
        fontSize: 74,
        lineHeight: 1.15,
        textShadow: "0 4px 22px rgba(0,0,0,0.95)",
      }}
    >
      {group.map((w, i) => (
        <span key={groupStart + i} style={{ color: groupStart + i === current ? "#c4b5fd" : "white" }}>
          {w.word}
        </span>
      ))}
    </div>
  );
};
