"use client";

import { motion } from "framer-motion";
import { useState, type CSSProperties, type ReactNode } from "react";

const API_URL = "/api";

const EASE = [0.22, 1, 0.36, 1] as const;

function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
  style,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function StaggerGroup({
  children,
  className,
  style,
  stagger = 0.08,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  stagger?: number;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-8% 0px" }}
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: stagger,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

function MotionCard({
  children,
  style,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      variants={{
        hidden: { opacity: 0, y: 22 },
        show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}

function JoinedBadge() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="inline-flex items-center gap-2.5 px-5 py-3.5"
      style={{
        background: "rgba(95,141,107,0.08)",
        border: "1px solid rgba(95,141,107,0.15)",
        borderRadius: "var(--r-button)",
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--success)"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
      <span className="text-sm font-medium" style={{ color: "var(--success)" }}>
        You&apos;re on the list. We&apos;ll be in touch.
      </span>
    </motion.div>
  );
}

function WaitlistForm({
  em,
  setEm,
  onJoin,
  loading,
  error,
}: {
  em: string;
  setEm: (v: string) => void;
  onJoin: () => void;
  loading: boolean;
  error: string;
}) {
  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2.5 w-full" style={{ maxWidth: 440 }}>
        <input
          type="email"
          value={em}
          onChange={(e) => setEm(e.target.value)}
          placeholder="you@email.com"
          onKeyDown={(e) => e.key === "Enter" && onJoin()}
          className="flex-1 text-sm outline-none transition-all min-w-0"
          style={{
            padding: "14px 18px",
            background: "var(--elevated)",
            border: "1px solid var(--border-soft)",
            borderRadius: "var(--r-input)",
            color: "var(--text-primary)",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border-soft)")}
        />
        <button
          onClick={onJoin}
          disabled={loading}
          className="text-sm font-medium whitespace-nowrap transition-all w-full sm:w-auto"
          style={{
            padding: "14px 28px",
            background: "var(--text-primary)",
            color: "var(--text-inverse)",
            borderRadius: "var(--r-button)",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Joining..." : "Join waitlist"}
        </button>
      </div>
      <p
        className="text-xs mt-3.5"
        style={{ color: error ? "var(--critical)" : "var(--text-tertiary)" }}
      >
        {error || "Free early access · No credit card required"}
      </p>
    </div>
  );
}

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const [bottomEmail, setBottomEmail] = useState("");
  const [bottomJoined, setBottomJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [waitlistError, setWaitlistError] = useState("");

  const join = async (e: string, setDone: (v: boolean) => void) => {
    if (!e.includes("@")) {
      setWaitlistError("Enter a valid email address.");
      return;
    }

    setLoading(true);
    setWaitlistError("");

    try {
      const response = await fetch(`${API_URL}/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e }),
      });
      if (!response.ok) {
        throw new Error("Waitlist signup failed. Try again.");
      }
      setDone(true);
    } catch {
      setWaitlistError("Waitlist signup failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: "var(--canvas)" }} className="min-h-screen">
      {/* Nav */}
      <nav
        className="sticky top-0 z-50"
        style={{
          background: "rgba(247,244,238,0.88)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border-soft)",
        }}
      >
        <div
          className="max-w-[1200px] mx-auto px-5 sm:px-8 flex items-center justify-between"
          style={{ minHeight: 64, paddingTop: 10, paddingBottom: 10 }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: "var(--text-primary)" }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-inverse)"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="8" />
                <circle cx="12" cy="12" r="3" />
                <line x1="12" y1="2" x2="12" y2="5" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="2" y1="12" x2="5" y2="12" />
                <line x1="19" y1="12" x2="22" y2="12" />
              </svg>
            </div>
            <span className="text-base font-medium" style={{ letterSpacing: "-0.01em" }}>
              Sentinel
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#who" className="text-[13px] font-medium" style={{ color: "var(--text-tertiary)" }}>
              Use cases
            </a>
            <a href="#how" className="text-[13px] font-medium" style={{ color: "var(--text-tertiary)" }}>
              How it works
            </a>
            <a
              href="#team-mode"
              className="text-[13px] font-medium"
              style={{ color: "var(--text-tertiary)" }}
            >
              Teams
            </a>
            <a href="#trust" className="text-[13px] font-medium" style={{ color: "var(--text-tertiary)" }}>
              Trust
            </a>
            <a
              href="#roadmap"
              className="text-[13px] font-medium"
              style={{ color: "var(--text-tertiary)" }}
            >
              Roadmap
            </a>
          </div>
        </div>
      </nav>

      {/* ════════════ Hero ════════════ */}
      <section className="max-w-[1200px] mx-auto px-5 sm:px-8" style={{ paddingTop: 64, paddingBottom: 40 }}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <Reveal delay={0.02}>
              <div
                className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full mb-8"
                style={{
                  background: "rgba(95,141,107,0.08)",
                  border: "1px solid rgba(95,141,107,0.15)",
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "var(--success)" }} />
                <span className="text-xs font-medium" style={{ color: "var(--success)" }}>
                  Monitoring live
                </span>
              </div>
            </Reveal>

            <Reveal delay={0.08}>
              <h1
                className="font-semibold"
                style={{ fontSize: "clamp(2.35rem, 7vw, 3rem)", lineHeight: 1.08, letterSpacing: "-0.035em", marginBottom: 24 }}
              >
                When something important changes,
                <br />
                Sentinel calls you
                <br />
                with the facts and source links.
              </h1>
            </Reveal>

            <Reveal delay={0.14}>
              <p
                style={{
                  fontSize: 17,
                  lineHeight: 1.7,
                  color: "var(--text-secondary)",
                  maxWidth: 520,
                  marginBottom: 40,
                }}
              >
                Sentinel monitors competitors, regulations, outages, executive moves, pricing pages,
                and other high-stakes changes. When a threshold is crossed, it verifies the signal,
                saves the briefing, and shows the exact links behind the alert.
              </p>
            </Reveal>

            <Reveal delay={0.2}>
              {!joined ? (
                <WaitlistForm
                  em={email}
                  setEm={setEmail}
                  onJoin={() => join(email, setJoined)}
                  loading={loading}
                  error={waitlistError}
                />
              ) : (
                <JoinedBadge />
              )}
            </Reveal>
          </div>

          {/* Preview mock */}
          <Reveal
            delay={0.16}
            style={{
              borderRadius: "var(--r-panel)",
              border: "1px solid var(--border-soft)",
              overflow: "hidden",
              background: "var(--elevated)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div
              className="flex items-center gap-2 px-5 py-3.5"
              style={{
                borderBottom: "1px solid var(--border-soft)",
                background: "var(--surface)",
              }}
            >
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#E07A5F", opacity: 0.6 }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#C89B3C", opacity: 0.6 }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#5F8D6B", opacity: 0.6 }} />
              <span
                className="ml-3 text-[11px] font-[family-name:var(--font-mono)]"
                style={{ color: "var(--text-tertiary)" }}
              >
                sentinel — live briefings
              </span>
            </div>
            <div className="p-5 space-y-3">
              <div
                style={{
                  background: "rgba(184,92,75,0.04)",
                  border: "1px solid rgba(184,92,75,0.12)",
                  borderRadius: 20,
                  padding: 20,
                }}
              >
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-semibold font-[family-name:var(--font-mono)]"
                        style={{ background: "rgba(184,92,75,0.08)", color: "var(--critical)" }}
                      >
                        9
                      </div>
                      <div>
                        <span className="text-sm font-medium">OpenAI pricing page changed</span>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                          Triggered 4 minutes ago · score 9.1 / 10
                        </p>
                      </div>
                    </div>
                    <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      Batch API pricing dropped and enterprise terms changed. Sentinel escalated
                      because this watch is tagged as high financial impact and the page change persisted.
                    </p>
                  </div>
                  <span
                    className="text-[9px] font-semibold px-3 py-1.5 uppercase tracking-wider whitespace-nowrap"
                    style={{
                      background: "rgba(95,141,107,0.1)",
                      color: "var(--success)",
                      borderRadius: "var(--r-pill)",
                    }}
                  >
                    Calling now
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mb-3 pl-0 sm:pl-12">
                  <span
                    className="text-[10px] font-medium px-2.5 py-1.5"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border-soft)",
                      borderRadius: 999,
                      color: "var(--text-secondary)",
                    }}
                  >
                    2 sources verified
                  </span>
                  <span
                    className="text-[10px] font-medium px-2.5 py-1.5"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border-soft)",
                      borderRadius: 999,
                      color: "var(--text-secondary)",
                    }}
                  >
                    Last checked 09:14
                  </span>
                  <span
                    className="text-[10px] font-medium px-2.5 py-1.5"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border-soft)",
                      borderRadius: 999,
                      color: "var(--text-secondary)",
                    }}
                  >
                    CFO + CEO + Eng Lead
                  </span>
                </div>
                <div
                  className="rounded-2xl"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-soft)",
                    padding: 16,
                  }}
                >
                  <p
                    className="text-[11px] font-semibold mb-2"
                    style={{
                      color: "var(--text-tertiary)",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    Why this fired
                  </p>
                  <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    Pricing delta exceeded your threshold, change persisted across two crawls, and
                    Firecrawl Agent found corroboration from the public pricing docs and API
                    changelog.
                  </p>
                </div>
              </div>

              <div
                style={{
                  background: "rgba(200,155,60,0.03)",
                  border: "1px solid rgba(200,155,60,0.1)",
                  borderRadius: 20,
                  padding: 20,
                }}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-semibold font-[family-name:var(--font-mono)]"
                      style={{ background: "rgba(200,155,60,0.08)", color: "var(--warning)" }}
                    >
                      7
                    </div>
                    <span className="text-sm font-medium">Briefing ready for review</span>
                  </div>
                  <span
                    className="text-[9px] font-semibold px-3 py-1.5 uppercase tracking-wider"
                    style={{
                      background: "rgba(111,129,150,0.1)",
                      color: "var(--info)",
                      borderRadius: "var(--r-pill)",
                    }}
                  >
                    Transcript saved
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    Voice briefing saved, transcript ready, and exact source links attached to the update.
                </p>
              </div>

              <div
                style={{
                  background: "var(--elevated)",
                  border: "1px solid var(--border-soft)",
                  borderRadius: 20,
                  padding: 20,
                }}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-semibold font-[family-name:var(--font-mono)]"
                      style={{ background: "var(--muted)", color: "var(--border-strong)" }}
                    >
                      2
                    </div>
                    <span className="text-sm font-medium" style={{ color: "var(--text-tertiary)" }}>
                      Routine market chatter
                    </span>
                  </div>
                  <span
                    className="text-[9px] font-semibold px-3 py-1.5 uppercase tracking-wider"
                    style={{
                      background: "var(--muted)",
                      color: "var(--text-tertiary)",
                      borderRadius: "var(--r-pill)",
                    }}
                  >
                    Suppressed
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                  Mention volume increased, but no primary-source change and no persistence across
                  crawls. Sentinel stayed silent.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Powered by */}
      <section className="max-w-[1200px] mx-auto px-5 sm:px-8 py-12 sm:py-16">
        <Reveal>
          <p
            className="text-center text-xs font-medium uppercase tracking-widest mb-8"
            style={{ color: "var(--text-tertiary)" }}
          >
            Powered by
          </p>
        </Reveal>
        <StaggerGroup className="flex items-center justify-center gap-6 sm:gap-12 flex-wrap">
          {["Firecrawl", "Claude AI", "ElevenLabs", "Twilio"].map((n) => (
            <MotionCard key={n}>
              <span className="text-sm font-medium" style={{ color: "var(--border-strong)" }}>
                {n}
              </span>
            </MotionCard>
          ))}
        </StaggerGroup>
      </section>

      {/* ════════════ Use cases ════════════ */}
      <section id="who" style={{ borderTop: "1px solid var(--border-soft)" }}>
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <Reveal className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
              Use cases
            </p>
            <h2
              className="font-semibold mb-4"
              style={{ fontSize: "clamp(1.9rem, 5vw, 2.25rem)", letterSpacing: "-0.03em", lineHeight: 1.2 }}
            >
              Built for high-urgency monitoring.
            </h2>
            <p
              style={{
                fontSize: 16,
                color: "var(--text-secondary)",
                maxWidth: 620,
                margin: "0 auto",
                lineHeight: 1.65,
              }}
            >
              Sentinel is strongest when the cost of missing a change is high: competitor moves,
              pricing updates, regulatory shifts, incident response, and executive alerts that need
              a fast, clear response.
            </p>
          </Reveal>

          <StaggerGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18" />
                    <path d="M5 21V7l8-4v18" />
                    <path d="M19 21V11l-6-3" />
                    <path d="M9 9h.01" />
                    <path d="M9 13h.01" />
                    <path d="M9 17h.01" />
                    <path d="M13 13h.01" />
                    <path d="M13 17h.01" />
                    <path d="M17 15h.01" />
                    <path d="M17 19h.01" />
                  </svg>
                ),
                t: "Founders & leadership",
                d: "Track competitors, pricing, launches, partnerships, and executive moves. Get the strategic angle first, not a generic alert.",
              },
              {
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3v18h18" />
                    <path d="m7 15 4-4 3 3 5-7" />
                    <path d="M16 7h3v3" />
                  </svg>
                ),
                t: "Finance teams",
                d: "Monitor pricing pages, earnings signals, vendor changes, and revenue-impacting announcements. Route the call to the people who own the number.",
              },
              {
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l7 4v5c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V7l7-4Z" />
                    <path d="m9.5 12 1.5 1.5 3.5-3.5" />
                  </svg>
                ),
                t: "Security & incident response",
                d: "Watch advisories, CVEs, vendor notices, and outage pages. Escalate only when the signal is verified and urgent.",
              },
              {
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3h8" />
                    <path d="M12 3v18" />
                    <path d="M5 7h14" />
                    <path d="M7 21h10" />
                  </svg>
                ),
                t: "Legal & compliance",
                d: "Track regulators, court decisions, enforcement notices, and policy changes. Maintain a source-backed trail for why the alert fired.",
              },
              {
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.7 6.3a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4l-7.8 7.8-3.4.8.8-3.4 7.4-7.4Z" />
                    <path d="M12 8l4 4" />
                    <path d="M3 21h18" />
                  </svg>
                ),
                t: "Engineering & operations",
                d: "Monitor API changes, infrastructure incidents, changelogs, and dependency updates. Send technical briefings to the people who can act immediately.",
              },
              {
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19h16" />
                    <path d="M6 17V9l6-4 6 4v8" />
                    <path d="M10 13h4" />
                    <path d="M10 16h4" />
                  </svg>
                ),
                t: "Communications teams",
                d: "Catch brand mentions, press coverage, crisis signals, and public narrative shifts before they harden into a bigger problem.",
              },
            ].map((c) => (
              <MotionCard
                key={c.t}
                className="transition-all hover:translate-y-[-2px]"
                style={{
                  background: "var(--elevated)",
                  border: "1px solid var(--border-soft)",
                  borderRadius: "var(--r-card)",
                  padding: 28,
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div className="mb-3 inline-flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: "var(--surface)", color: "var(--accent)" }}>
                  {c.icon}
                </div>
                <h3 className="text-[15px] font-semibold mb-2">{c.t}</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {c.d}
                </p>
              </MotionCard>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* ════════════ Features — Individual vs Team ════════════ */}
      <section id="features" style={{ borderTop: "1px solid var(--border-soft)" }}>
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <Reveal className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
              Two modes
            </p>
            <h2
              className="font-semibold mb-4"
              style={{ fontSize: "clamp(1.9rem, 5vw, 2.25rem)", letterSpacing: "-0.03em", lineHeight: 1.2 }}
            >
              Works for you. Scales for your team.
            </h2>
          </Reveal>

          <StaggerGroup className="grid grid-cols-1 lg:grid-cols-2 gap-6" stagger={0.1}>
            {/* Personal */}
            <MotionCard
              style={{
                background: "var(--elevated)",
                border: "1px solid var(--border-soft)",
                borderRadius: "var(--r-panel)",
                padding: 28,
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(122,92,69,0.08)" }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Personal mode</h3>
                  <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                    For individuals watching what matters to them
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                {[
                  {
                    t: "Track anything on the web",
                    d: "Jobs, competitors, news, products, regulations — if it's online, Sentinel can watch it.",
                  },
                  {
                    t: "AI-scored changes",
                    d: "Every shift scored 0–10. Only genuinely important changes reach you. No noise.",
                  },
                  {
                    t: "Phone call briefings",
                    d: "An AI voice calls you and explains what changed, why it matters, and what to do next.",
                  },
                  {
                    t: "SMS + email fallback",
                    d: "Busy or in a meeting? Sentinel sends a text and email instead. Nothing gets lost.",
                  },
                  {
                    t: "Calendar-aware",
                    d: "Connect Google Calendar. Sentinel won't call during meetings — it waits or falls back to SMS.",
                  },
                  {
                    t: "Deep research",
                    d: "High-priority changes trigger autonomous deep research across multiple sources before calling.",
                  },
                ].map((f) => (
                  <div key={f.t} className="flex gap-3">
                    <div
                      className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                      style={{ background: "rgba(95,141,107,0.1)" }}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--success)"
                        strokeWidth="3"
                        strokeLinecap="round"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[14px] font-medium mb-0.5">{f.t}</p>
                      <p className="text-[13px]" style={{ color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                        {f.d}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </MotionCard>

            {/* Team */}
            <MotionCard
              style={{
                background: "var(--elevated)",
                border: "1px solid var(--border-soft)",
                borderRadius: "var(--r-panel)",
                padding: 28,
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(111,129,150,0.08)" }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--info)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Team mode</h3>
                  <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                    For teams that need coordinated awareness
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                {[
                  {
                    t: "Simultaneous team calls",
                    d: "Every team member's phone rings at once. No waiting, no forwarding, no delay.",
                  },
                  {
                    t: "Role-specific briefings",
                    d: "CEO hears strategy. Engineer hears tech details. CFO hears financials. Same event, different angles.",
                  },
                  {
                    t: "Team management",
                    d: "Add members, assign roles, manage permissions — all from the dashboard.",
                  },
                  {
                    t: "Full call transcripts",
                    d: "Every briefing is stored. Review what was said, when, to whom, and what they were told.",
                  },
                  {
                    t: "Shared watchlists",
                    d: "Team watches are shared. Everyone sees the same feed, but hears their own briefing.",
                  },
                  {
                    t: "Usage analytics",
                    d: "Track polls, alerts, calls, and scores. See how Sentinel is performing across your topics.",
                  },
                ].map((f) => (
                  <div key={f.t} className="flex gap-3">
                    <div
                      className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                      style={{ background: "rgba(95,141,107,0.1)" }}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--success)"
                        strokeWidth="3"
                        strokeLinecap="round"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[14px] font-medium mb-0.5">{f.t}</p>
                      <p className="text-[13px]" style={{ color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                        {f.d}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </MotionCard>
          </StaggerGroup>
        </div>
      </section>

      {/* ════════════ How it works ════════════ */}
      <section id="how" style={{ borderTop: "1px solid var(--border-soft)" }}>
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
              How it works
            </p>
            <h2
              className="font-semibold mb-4"
              style={{ fontSize: "clamp(1.9rem, 5vw, 2.25rem)", letterSpacing: "-0.03em", lineHeight: 1.2 }}
            >
              Detect, verify, brief, act.
            </h2>
            <p
              className="mb-16"
              style={{ fontSize: 16, color: "var(--text-secondary)", maxWidth: 620, lineHeight: 1.65 }}
            >
              Sentinel does more than detect a diff. It checks whether the change is persistent,
              verifies it against sources, routes the right briefing to each role, and leaves a clear
              audit trail behind.
            </p>
          </Reveal>

          <StaggerGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                n: "01",
                t: "Watch",
                d: "Define a source, topic, or company that matters. Add thresholds, urgency, and who should be called if the signal is real.",
                i: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="6" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                ),
              },
              {
                n: "02",
                t: "Verify",
                d: "Sentinel compares snapshots, checks whether the change persists, and corroborates it with additional sources before escalating.",
                i: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 3h6" />
                    <path d="M10 9h4" />
                    <path d="M9 21h6" />
                    <path d="M8 3h8l1 5-5 6-5-6 1-5Z" />
                  </svg>
                ),
              },
              {
                n: "03",
                t: "Route",
                d: "Once the threshold is crossed, Sentinel decides who needs to know now and tailors each spoken briefing to their role.",
                i: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12h7" />
                    <path d="M13 6l7 6-7 6" />
                  </svg>
                ),
              },
              {
                n: "04",
                t: "Act",
                d: "Every alert leaves behind sources, timestamps, transcripts, and a written summary so the next action is obvious.",
                i: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92V19a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 3.18 2 2 0 0 1 4.11 1h2.09a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.61a2 2 0 0 1-.45 2.11L7.47 8.53a16 16 0 0 0 8 8l1.09-1.09a2 2 0 0 1 2.11-.45c.84.3 1.71.51 2.61.63A2 2 0 0 1 22 16.92Z" />
                  </svg>
                ),
              },
            ].map((s) => (
              <MotionCard
                key={s.n}
                className="transition-all hover:translate-y-[-2px]"
                style={{
                  background: "var(--elevated)",
                  border: "1px solid var(--border-soft)",
                  borderRadius: "var(--r-card)",
                  padding: 28,
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div className="mb-4 inline-flex items-center justify-center w-11 h-11 rounded-xl" style={{ background: "var(--surface)", color: "var(--accent)" }}>
                  {s.i}
                </div>
                <p
                  className="text-[11px] font-semibold font-[family-name:var(--font-mono)] mb-3"
                  style={{ color: "var(--accent)" }}
                >
                  STEP {s.n}
                </p>
                <h3 className="font-semibold mb-2" style={{ fontSize: 16 }}>
                  {s.t}
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {s.d}
                </p>
              </MotionCard>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* ════════════ Team briefings ════════════ */}
      <section id="team-mode" style={{ borderTop: "1px solid var(--border-soft)" }}>
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
              Team intelligence
            </p>
            <h2
              className="font-semibold mb-4"
              style={{ fontSize: "clamp(1.9rem, 5vw, 2.25rem)", letterSpacing: "-0.03em", lineHeight: 1.2 }}
            >
              Same event. Different briefings.
            </h2>
            <p
              className="mb-16"
              style={{ fontSize: 16, color: "var(--text-secondary)", maxWidth: 520, lineHeight: 1.65 }}
            >
              When Sentinel detects a critical shift, every team member&apos;s phone rings
              simultaneously. Each person hears only what&apos;s relevant to their role — no
              information overload, just clarity.
            </p>
          </Reveal>

          <StaggerGroup className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                role: "CEO",
                sub: "Strategic briefing",
                color: "var(--warning)",
                q: "This positions them ahead in enterprise AI. I'd recommend accelerating partnership talks before competitors react. The window is narrow — maybe 2 weeks before the market adjusts.",
              },
              {
                role: "Engineer",
                sub: "Technical briefing",
                color: "var(--info)",
                q: "Their API is migrating from v1 to v2 with breaking schema changes. Our integration layer needs a patch — I'd estimate 2 days. Authentication flow is the highest-risk area.",
              },
              {
                role: "CFO",
                sub: "Financial briefing",
                color: "var(--success)",
                q: "Revenue impact estimated at 12–15% for affected product lines. Their pricing shift could save us $40K quarterly, but we need to lock in the new tier before end of month.",
              },
            ].map((r) => (
              <MotionCard
                key={r.role}
                style={{
                  background: "var(--elevated)",
                  border: "1px solid var(--border-soft)",
                  borderRadius: "var(--r-card)",
                  padding: 28,
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold"
                    style={{ background: "var(--muted)", color: "var(--text-secondary)" }}
                  >
                    {r.role[0]}
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold">{r.role}</div>
                    <div className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                      {r.sub}
                    </div>
                  </div>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: 20 }}>
                  <p className="text-[13px] leading-[1.7] italic" style={{ color: "var(--text-secondary)" }}>
                    &ldquo;{r.q}&rdquo;
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: r.color }} />
                  <span className="text-[11px] font-medium" style={{ color: r.color }}>
                    Incoming call from Sentinel
                  </span>
                </div>
              </MotionCard>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* ════════════ Trust layer ════════════ */}
      <section id="trust" style={{ borderTop: "1px solid var(--border-soft)" }}>
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
              Trust
            </p>
            <h2
              className="font-semibold mb-4"
              style={{ fontSize: "clamp(1.9rem, 5vw, 2.25rem)", letterSpacing: "-0.03em", lineHeight: 1.2 }}
            >
              Every call comes with evidence.
            </h2>
            <p
              className="mb-16"
              style={{ fontSize: 16, color: "var(--text-secondary)", maxWidth: 640, lineHeight: 1.65 }}
            >
              A phone call is a high-interruption alert. Sentinel only works if people can see why it
              fired, what changed, which sources confirmed it, and who received each version of the
              briefing.
            </p>
          </Reveal>

          <StaggerGroup className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              {
                t: "Why it triggered",
                d: "See the score, the threshold crossed, the persistence across crawls, and the specific condition that caused escalation.",
              },
              {
                t: "Source-backed verification",
                d: "Review primary sources, timestamps, and corroborating links so each alert is easy to trust and easy to audit.",
              },
              {
                t: "Role-aware routing",
                d: "Know exactly who was called, why they were included, and how each spoken briefing differed by responsibility.",
              },
              {
                t: "Transcripts and written summaries",
                d: "Every call leaves a transcript, a summary, and a clean handoff artifact for the rest of the team.",
              },
            ].map((item) => (
              <MotionCard
                key={item.t}
                style={{
                  background: "var(--elevated)",
                  border: "1px solid var(--border-soft)",
                  borderRadius: "var(--r-card)",
                  padding: 28,
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <h3 className="text-[16px] font-semibold mb-3">{item.t}</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {item.d}
                </p>
              </MotionCard>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* ════════════ What you can track ════════════ */}
      <section style={{ borderTop: "1px solid var(--border-soft)" }}>
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <Reveal className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
              Anything on the web
            </p>
            <h2
              className="font-semibold mb-4"
              style={{ fontSize: 36, letterSpacing: "-0.03em", lineHeight: 1.2 }}
            >
              Best for changes that need action.
            </h2>
          </Reveal>
          <StaggerGroup className="flex flex-wrap justify-center gap-3 max-w-[800px] mx-auto">
            {[
              "Competitor launches",
              "Pricing changes",
              "Regulatory updates",
              "Security advisories",
              "Incident pages",
              "API changelogs",
              "Executive moves",
              "Vendor notices",
              "Earnings signals",
              "Policy changes",
              "Press coverage",
              "Brand crises",
              "Court decisions",
              "Supply chain alerts",
              "Partnership announcements",
              "Product recalls",
              "Outage reports",
              "Procurement updates",
              "Enforcement actions",
              "Strategic hires",
            ].map((tag) => (
              <MotionCard
                key={tag}
                className="text-[13px] font-medium px-4 py-2.5 transition-all"
                style={{
                  background: "var(--elevated)",
                  border: "1px solid var(--border-soft)",
                  borderRadius: "var(--r-pill)",
                  color: "var(--text-secondary)",
                }}
              >
                {tag}
              </MotionCard>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* ════════════ Roadmap ════════════ */}
      <section id="roadmap" style={{ borderTop: "1px solid var(--border-soft)" }}>
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
              Roadmap
            </p>
            <h2
              className="font-semibold mb-4"
              style={{ fontSize: "clamp(1.9rem, 5vw, 2.25rem)", letterSpacing: "-0.03em", lineHeight: 1.2 }}
            >
              What we&apos;re building next.
            </h2>
            <p
              className="mb-16"
              style={{ fontSize: 16, color: "var(--text-secondary)", maxWidth: 500, lineHeight: 1.65 }}
            >
              Sentinel is just getting started. Here&apos;s the path ahead.
            </p>
          </Reveal>

          <StaggerGroup className="grid grid-cols-1 lg:grid-cols-3 gap-8" stagger={0.12}>
            <MotionCard>
              <div className="flex items-center gap-2 mb-5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--success)" }} />
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--success)" }}>
                  Live now
                </h3>
              </div>
              <div className="space-y-2.5">
                {[
                  "Web monitoring via Firecrawl",
                  "AI change scoring with Claude",
                  "Deep research with Firecrawl Agent",
                  "Phone call briefings via ElevenLabs",
                  "Role-specific team briefings",
                  "SMS + email fallback alerts",
                  "Dashboard with transcripts + analytics",
                ].map((f) => (
                  <div
                    key={f}
                    className="flex items-center gap-2.5"
                    style={{
                      padding: "12px 16px",
                      background: "var(--elevated)",
                      border: "1px solid var(--border-soft)",
                      borderRadius: 14,
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--success)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                      {f}
                    </span>
                  </div>
                ))}
              </div>
            </MotionCard>

            <MotionCard>
              <div className="flex items-center gap-2 mb-5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--warning)" }} />
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--warning)" }}>
                  Coming soon
                </h3>
              </div>
              <div className="space-y-2.5">
                {[
                  "Datadog integration",
                  "AWS CloudWatch monitoring",
                  "PagerDuty escalation chains",
                  "Stripe billing anomaly alerts",
                  "Slack + Teams notifications",
                  "Custom alert rules engine",
                  "Multi-topic correlation & patterns",
                ].map((f) => (
                  <div
                    key={f}
                    className="flex items-center gap-2.5"
                    style={{
                      padding: "12px 16px",
                      background: "var(--elevated)",
                      border: "1px solid var(--border-soft)",
                      borderRadius: 14,
                    }}
                  >
                    <div
                      className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0"
                      style={{ borderColor: "var(--warning)" }}
                    />
                    <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                      {f}
                    </span>
                  </div>
                ))}
              </div>
            </MotionCard>

            <MotionCard>
              <div className="flex items-center gap-2 mb-5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--info)" }} />
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--info)" }}>
                  On the horizon
                </h3>
              </div>
              <div className="space-y-2.5">
                {[
                  "WhatsApp + Telegram briefings",
                  "Scheduled daily digest calls",
                  "Custom LLM provider support",
                  "Self-hosted deployment option",
                  "Public API for integrations",
                  "Mobile app with push alerts",
                  "Enterprise SSO + audit logs",
                ].map((f) => (
                  <div
                    key={f}
                    className="flex items-center gap-2.5"
                    style={{
                      padding: "12px 16px",
                      background: "var(--elevated)",
                      border: "1px solid var(--border-soft)",
                      borderRadius: 14,
                    }}
                  >
                    <div
                      className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0"
                      style={{ borderColor: "var(--info)" }}
                    />
                    <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                      {f}
                    </span>
                  </div>
                ))}
              </div>
            </MotionCard>
          </StaggerGroup>
        </div>
      </section>

      {/* ════════════ Bottom CTA ════════════ */}
      <section style={{ borderTop: "1px solid var(--border-soft)" }}>
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 text-center py-16 sm:py-24">
          <Reveal>
            <h2 className="font-semibold mb-4" style={{ fontSize: "clamp(1.9rem, 5vw, 2.25rem)", letterSpacing: "-0.03em" }}>
              Get alerted only when the signal is real.
            </h2>
            <p
              className="mb-10 mx-auto"
              style={{ fontSize: 16, color: "var(--text-secondary)", maxWidth: 560, lineHeight: 1.65 }}
            >
              Join the waitlist for early access. Sentinel is built for teams that need trusted,
              source-backed alerts with role-specific briefings and a clear record of why the call
              happened.
            </p>
            {!bottomJoined ? (
              <div className="mx-auto" style={{ maxWidth: 440 }}>
                <WaitlistForm
                  em={bottomEmail}
                  setEm={setBottomEmail}
                  onJoin={() => join(bottomEmail, setBottomJoined)}
                  loading={loading}
                  error={waitlistError}
                />
              </div>
            ) : (
              <JoinedBadge />
            )}
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--border-soft)" }}>
        <div
          className="max-w-[1200px] mx-auto px-8"
          style={{ padding: "28px 32px" }}
        >
          <div className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr_0.8fr] gap-8 items-start">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: "var(--text-primary)" }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-inverse)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <circle cx="12" cy="12" r="8" />
                    <circle cx="12" cy="12" r="3" />
                    <line x1="12" y1="2" x2="12" y2="5" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                    <line x1="2" y1="12" x2="5" y2="12" />
                    <line x1="19" y1="12" x2="22" y2="12" />
                  </svg>
                </div>
                <span className="text-[15px] font-medium" style={{ letterSpacing: "-0.01em" }}>
                  Sentinel
                </span>
              </div>
              <p className="text-[13px] leading-relaxed mb-3" style={{ color: "var(--text-secondary)", maxWidth: 360 }}>
                Web monitoring that verifies the signal, saves the briefing, and calls when it actually matters.
              </p>
              <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                © 2026 Sentinel
              </p>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>
                Product
              </p>
              <div className="flex flex-col gap-2">
                <a href="#who" className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  Use cases
                </a>
                <a href="#how" className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  How it works
                </a>
                <a href="#trust" className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  Trust
                </a>
                <a href="#roadmap" className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  Roadmap
                </a>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>
                What you get
              </p>
              <div className="space-y-2">
                {[
                  "Verified signals",
                  "Exact source links",
                  "Voice briefings",
                  "Transcripts and history",
                ].map((item) => (
                  <div key={item} className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
