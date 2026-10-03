import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { cx } from "./ui";

const NAV = [
  { to: "/", label: "Create" },
  { to: "/library", label: "Library" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/how-it-works", label: "How it works" },
];

export function Layout() {
  const { session } = useAuth();
  const location = useLocation();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/[0.05] bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3.5 sm:px-6">
          <NavLink to="/" className="flex shrink-0 items-center gap-3" aria-label="Pulse Studio home">
            <img src="/logo-white.png" alt="NovaAI" className="h-[26px] w-auto" />
            <span className="hidden h-5 w-px bg-line sm:block" />
            <span className="hidden font-display text-lg font-semibold sm:block">Pulse Studio</span>
          </NavLink>
          <nav className="ml-auto flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => cx("whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition", isActive ? "bg-white/[0.08] text-ink" : "text-muted hover:text-ink")}
              >
                {item.label}
              </NavLink>
            ))}
            {session ? (
              <>
                <NavLink to="/library?mine=1" className="whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium text-muted hover:text-ink">My videos</NavLink>
                <button onClick={() => supabase.auth.signOut()} className="whitespace-nowrap rounded-xl border border-line px-3 py-1.5 text-sm font-medium text-muted hover:text-ink" title={session.user.email ?? ""}>
                  Log out
                </button>
              </>
            ) : (
              <Link to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} className="whitespace-nowrap rounded-xl bg-brand px-3.5 py-1.5 text-sm font-semibold text-[#141414]">
                Log in
              </Link>
            )}
          </nav>
        </div>
      </header>
      {!supabaseConfigured ? (
        <div className="mx-auto mt-4 max-w-6xl px-4 sm:px-6">
          <div className="rounded-2xl border border-red/30 bg-red/10 px-4 py-3 text-sm text-red">Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY and rebuild.</div>
        </div>
      ) : null}
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        <Outlet />
      </main>
      <footer className="border-t border-white/[0.05]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs text-faint sm:px-6">
          <span>Pulse Studio by NovaAI · Videos for the Qoneqt Global Feed</span>
          <span>Runs entirely on free tiers</span>
        </div>
      </footer>
    </div>
  );
}
