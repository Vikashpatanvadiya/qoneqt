import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, MinusCircle, Wrench } from "lucide-react";
import type { StageStatus } from "../lib/types";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// Section heading with the hairline rule from the brand sheet.
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-5">
      <h2 className="shrink-0 text-2xl font-semibold text-ink/70 sm:text-3xl">{children}</h2>
      <div className="h-px flex-1 bg-line" />
      {right}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-[28px] border border-white/[0.04] bg-card p-5 sm:p-7", className)}>{children}</div>;
}

export function Button({ children, onClick, disabled, type = "button", variant = "brand", className }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; variant?: "brand" | "ghost"; className?: string }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-[15px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "brand" ? "bg-brand text-[#141414] hover:brightness-105" : "border border-line bg-raised text-ink hover:bg-white/[0.06]",
        className,
      )}
    >
      {children}
    </button>
  );
}

const STATUS: Record<StageStatus | "queued", { label: string; className: string; icon: ReactNode }> = {
  pending: { label: "Waiting", className: "text-faint bg-white/[0.03]", icon: <CircleDashed size={14} /> },
  queued: { label: "Queued", className: "text-faint bg-white/[0.03]", icon: <CircleDashed size={14} /> },
  running: { label: "Working", className: "text-peach bg-peach/10", icon: <Loader2 size={14} className="animate-spin" /> },
  done: { label: "Done", className: "text-green bg-green/10", icon: <CheckCircle2 size={14} /> },
  fixed: { label: "Fixed", className: "text-amber bg-amber/10", icon: <Wrench size={14} /> },
  skipped: { label: "Skipped", className: "text-muted bg-white/[0.05]", icon: <MinusCircle size={14} /> },
  failed: { label: "Failed", className: "text-red bg-red/10", icon: <AlertTriangle size={14} /> },
};

export function StatusPill({ status }: { status: StageStatus | "queued" }) {
  const s = STATUS[status] ?? STATUS.pending;
  return <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", s.className)}>{s.icon}{s.label}</span>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/[0.04] bg-card p-5">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-2 font-display text-3xl font-semibold tabular-nums sm:text-4xl">{value}</div>
      {hint ? <div className="mt-1 text-xs text-faint">{hint}</div> : null}
    </div>
  );
}

export function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "accent" | "good" | "bad" }) {
  const tones = { plain: "bg-white/[0.05] text-muted", accent: "bg-amber/12 text-amber", good: "bg-green/10 text-green", bad: "bg-red/10 text-red" };
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-line p-8 text-center text-sm text-muted">{children}</div>;
}
