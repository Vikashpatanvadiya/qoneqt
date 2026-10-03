import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button, Card, cx } from "../components/ui";

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/";
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "info" } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    const { data, error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}${next}` } });
    setBusy(false);
    if (error) return setMessage({ text: error.message, tone: "error" });
    if (mode === "up" && !data.session) return setMessage({ text: "Check your email and confirm your address, then log in.", tone: "info" });
    navigate(next);
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-4xl font-semibold">{mode === "in" ? "Log in" : "Create an account"}</h1>
      <p className="mt-3 text-muted">Log in to make more videos, use batch mode, and delete your own videos. You can try one video without an account.</p>
      <Card className="mt-8">
        <div className="mb-5 flex gap-2">
          {(["in", "up"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cx("rounded-xl px-4 py-2 text-sm font-semibold", mode === m ? "bg-ink text-bg" : "bg-white/[0.05] text-muted hover:text-ink")}>
              {m === "in" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-muted">Email</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-ink focus:border-amber/60 focus:outline-none" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-muted">Password</span>
            <input type="password" required minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-ink focus:border-amber/60 focus:outline-none" />
            {mode === "up" ? <span className="mt-1 block text-xs text-faint">At least 8 characters.</span> : null}
          </label>
          {message ? <p className={cx("rounded-xl px-3 py-2 text-sm", message.tone === "error" ? "bg-red/10 text-red" : "bg-green/10 text-green")}>{message.text}</p> : null}
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Please wait…" : mode === "in" ? "Log in" : "Create account"}</Button>
        </form>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        Just looking? <Link to="/" className="text-amber">Try one video without an account</Link>
      </p>
    </div>
  );
}
