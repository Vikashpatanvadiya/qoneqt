import { Palette, Sparkles } from "lucide-react";
import { PACKS, PACK_IDS, type PackId } from "../styles/packs";
import { cx } from "./ui";

// Style Pack grid: Auto lets the Director pick (never the same pack twice in a row); classic keeps the older themes.
export function StylePicker({ value, onChange, allowClassic = true, autoNote = "Auto: the Director picks a pack for the topic and never repeats your last one" }: { value: string; onChange: (v: string) => void; allowClassic?: boolean; autoNote?: string }) {
  const tile = (id: string, active: boolean) => cx("group relative overflow-hidden rounded-2xl border text-left transition", active ? "border-amber/70 ring-2 ring-amber/40" : "border-line hover:border-white/25");
  return (
    <div className="border-t border-line pt-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-muted"><Palette size={16} /> Style</span>
        <span className="text-xs text-faint">{value === "auto" ? autoNote : value === "classic" ? "Classic: the original themes" : `${PACKS[value as PackId]?.name}: ${PACKS[value as PackId]?.mood}`}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        <button onClick={() => onChange("auto")} aria-pressed={value === "auto"} className={cx(tile("auto", value === "auto"), "flex aspect-[9/16] flex-col items-center justify-center gap-2 bg-surface p-2 text-center")}>
          <Sparkles size={20} className="text-amber" />
          <span className="text-sm font-semibold">Auto</span>
          <span className="text-[11px] leading-tight text-muted">{allowClassic ? "Director picks" : "a new look each time"}</span>
        </button>
        {PACK_IDS.map((id) => (
          <button key={id} onClick={() => onChange(id)} aria-pressed={value === id} title={`${PACKS[id].name}: ${PACKS[id].useFor}`} className={tile(id, value === id)}>
            <img src={`/packs/${id}.jpg`} alt="" loading="lazy" className="aspect-[9/16] w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-6 text-[12px] font-semibold leading-tight text-white">{PACKS[id].name}</span>
          </button>
        ))}
      </div>
      {allowClassic ? <button onClick={() => onChange(value === "classic" ? "auto" : "classic")} className="mt-2 text-xs text-faint underline-offset-2 hover:text-ink hover:underline">
        {value === "classic" ? "Use Style Packs again" : "Advanced: use the classic themes instead"}
      </button> : null}
    </div>
  );
}

