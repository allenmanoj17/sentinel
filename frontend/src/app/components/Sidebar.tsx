"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

const NAV = [
  { href: "/app", label: "Dashboard", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg> },
  { href: "/app/watches", label: "Watchlists", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
  { href: "/app/team", label: "Teams", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [showChooser, setShowChooser] = useState(false);
  return (
    <aside className="fixed left-0 top-0 bottom-0 flex flex-col z-40" style={{ width: "var(--sidebar-w)", background: "var(--surface)", borderRight: "1px solid var(--border-soft)" }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-6" style={{ height: 72, borderBottom: "1px solid var(--border-soft)" }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--text-primary)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-inverse)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>
        </div>
        <span className="text-[15px] font-medium" style={{ letterSpacing: "-0.01em" }}>Sentinel</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-5">
        <div className="space-y-1">
          {NAV.map((item) => {
            const active = item.href === "/app" 
              ? pathname === "/app"
              : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 transition-all"
                style={{
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: active ? 500 : 400,
                  color: active ? "var(--text-primary)" : "var(--text-tertiary)",
                  background: active ? "var(--elevated)" : "transparent",
                  boxShadow: active ? "var(--shadow-sm)" : "none",
                  border: active ? "1px solid var(--border-soft)" : "1px solid transparent",
                }}>
                <span style={{ color: active ? "var(--text-primary)" : "var(--text-tertiary)" }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* New watch - this is a visual hint, actual modal is on dashboard */}
        <div className="mt-8 px-1">
          <button
            onClick={() => setShowChooser(true)}
            className="flex items-center justify-center gap-2 w-full py-3 text-[13px] font-medium transition-all"
            style={{ background: "var(--text-primary)", color: "var(--text-inverse)", borderRadius: "var(--r-button)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            New watch
          </button>
        </div>
      </nav>

      {/* Bottom */}
      <div className="px-5 py-4" style={{ borderTop: "1px solid var(--border-soft)" }}>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "var(--success)" }} />
          <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>Monitoring active</span>
        </div>
      </div>

      {showChooser ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(31,27,23,0.28)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowChooser(false)}
        >
          <div
            className="w-full max-w-md"
            style={{
              background: "var(--canvas)",
              border: "1px solid var(--border-soft)",
              borderRadius: "var(--r-panel)",
              boxShadow: "0 24px 48px rgba(31,27,23,0.12)",
              padding: 28,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
                New watch
              </p>
              <h3 className="text-[22px] font-semibold mb-1" style={{ letterSpacing: "-0.02em" }}>
                Who is this watch for?
              </h3>
              <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                Choose a personal watch for yourself or a team watch for a shared call flow.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => {
                  setShowChooser(false);
                  router.push("/app?newWatch=personal");
                }}
                className="w-full text-left"
                style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 18 }}
              >
                <p className="text-[15px] font-medium mb-1">Personal</p>
                <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  One person gets the briefing, transcript, and follow-up call.
                </p>
              </button>

              <button
                onClick={() => {
                  setShowChooser(false);
                  router.push("/app/team?newWatch=team");
                }}
                className="w-full text-left"
                style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 18 }}
              >
                <p className="text-[15px] font-medium mb-1">Team</p>
                <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  Multiple people get role-specific calls from the same signal.
                </p>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
