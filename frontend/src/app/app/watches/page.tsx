"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Watch { id: number; topic: string; mode: string; threshold: number; frequency_minutes: number; created_at: string; }

export default function WatchesPage() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [previousWatches, setPreviousWatches] = useState<Watch[]>([]);
  const [stoppingWatchId, setStoppingWatchId] = useState<number | null>(null);
  const [showAllPreviousWatches, setShowAllPreviousWatches] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/watches`).then((r) => r.json()).then((d) => {
      setWatches(d.watches || []);
      setPreviousWatches(d.previous_watches || []);
    }).catch(() => {});
  }, []);

  const stopWatch = async (watchId: number) => {
    setStoppingWatchId(watchId);
    try {
      await fetch(`${API_URL}/watch/${watchId}/stop`, { method: "POST" });
      const stoppedWatch = watches.find((watch) => watch.id === watchId) || null;
      setWatches((current) => current.filter((watch) => watch.id !== watchId));
      if (stoppedWatch) {
        setPreviousWatches((current) => [stoppedWatch, ...current]);
      }
    } catch {}
    setStoppingWatchId(null);
  };

  const visiblePreviousWatches = showAllPreviousWatches ? previousWatches : previousWatches.slice(0, 4);

  return (
    <div className="min-h-screen" style={{ background: "var(--canvas)" }}>
      <div style={{ background: "var(--elevated)", borderBottom: "1px solid var(--border-soft)", padding: "32px 0" }}>
        <div className="px-10 flex items-center justify-between">
          <div>
            <h1 className="font-semibold mb-1" style={{ fontSize: 22, letterSpacing: "-0.02em" }}>Watchlists</h1>
            <p className="text-[14px]" style={{ color: "var(--text-tertiary)" }}>All your active topic monitors</p>
          </div>
          <Link href="/app" className="flex items-center gap-2 px-5 py-2.5 text-[13px] font-medium transition-all"
            style={{ background: "var(--text-primary)", color: "var(--text-inverse)", borderRadius: "var(--r-button)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            New watch
          </Link>
        </div>
      </div>

      <div className="px-10 py-8">
        {watches.length === 0 ? (
          <div className="text-center" style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: "var(--r-panel)", padding: 80 }}>
            <p className="text-base mb-2" style={{ color: "var(--text-secondary)" }}>No watchlists yet</p>
            <p className="text-sm mb-6" style={{ color: "var(--text-tertiary)" }}>Create your first watch to start monitoring a topic.</p>
            <Link href="/app" className="inline-flex items-center gap-2 px-5 py-2.5 text-[13px] font-medium"
              style={{ background: "var(--text-primary)", color: "var(--text-inverse)", borderRadius: "var(--r-button)" }}>
              Start watching →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {watches.map((w, i) => (
              <div key={w.id} className={`fade-up d${Math.min(i + 1, 6)} transition-all`}
                style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: "var(--r-card)", padding: 24, boxShadow: "var(--shadow-sm)" }}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full pulse-dot" style={{ background: "var(--success)" }} />
                    <h3 className="text-[15px] font-medium">{w.topic}</h3>
                  </div>
                  <span className="text-[10px] font-semibold px-3 py-1 uppercase tracking-wider"
                    style={{ background: w.mode === "team" ? "rgba(111,129,150,0.1)" : "var(--muted)", color: w.mode === "team" ? "var(--info)" : "var(--text-tertiary)", borderRadius: "var(--r-pill)" }}>{w.mode}</span>
                </div>

                <div className="flex items-center gap-4 text-[12px] font-[family-name:var(--font-mono)] mb-5" style={{ color: "var(--text-tertiary)" }}>
                  <span>Watch #{w.id}</span>
                  <span>·</span>
                  <span>Every {w.frequency_minutes}m</span>
                  <span>·</span>
                  <span>Threshold ≥{w.threshold}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-[family-name:var(--font-mono)]" style={{ color: "var(--border-strong)" }}>Watch #{w.id}</span>
                  <div className="flex items-center gap-3">
                    {w.mode === "team" && (
                      <Link href="/app/team" className="text-[12px] font-medium" style={{ color: "var(--accent)" }}>Manage team →</Link>
                    )}
                    <button
                      onClick={() => stopWatch(w.id)}
                      disabled={stoppingWatchId === w.id}
                      className="text-[12px] font-medium"
                      style={{ color: stoppingWatchId === w.id ? "var(--text-tertiary)" : "var(--critical)" }}
                    >
                      {stoppingWatchId === w.id ? "Stopping..." : "Stop"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {previousWatches.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Previous watches</h2>
                <p className="text-[14px] mt-1" style={{ color: "var(--text-tertiary)" }}>Stopped watches stay here for reference.</p>
              </div>
              {previousWatches.length > 4 && (
                <button
                  onClick={() => setShowAllPreviousWatches((current) => !current)}
                  className="text-[12px] font-medium"
                  style={{ color: "var(--accent)" }}
                >
                  {showAllPreviousWatches ? "Show less" : "Show more"}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {visiblePreviousWatches.map((w) => (
                <div key={w.id}
                  style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: "var(--r-card)", padding: 24, opacity: 0.86 }}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--border-strong)" }} />
                      <h3 className="text-[15px] font-medium">{w.topic}</h3>
                    </div>
                    <span className="text-[10px] font-semibold px-3 py-1 uppercase tracking-wider"
                      style={{ background: "var(--muted)", color: "var(--text-tertiary)", borderRadius: "var(--r-pill)" }}>stopped</span>
                  </div>

                  <div className="flex items-center gap-4 text-[12px] font-[family-name:var(--font-mono)]" style={{ color: "var(--text-tertiary)" }}>
                    <span>Watch #{w.id}</span>
                    <span>·</span>
                    <span>Every {w.frequency_minutes}m</span>
                    <span>·</span>
                    <span>Threshold ≥{w.threshold}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
