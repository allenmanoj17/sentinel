"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const API_URL = "/api";

interface Watch {
  id: number;
  topic: string;
  mode: string;
  threshold: number;
  frequency_minutes: number;
  created_at: string;
}

interface Log {
  id: number;
  watch_id: number;
  topic: string;
  score: number;
  summary: string;
  action_taken: string;
  crawl_time: string;
  sources?: string | SourceEvidence[] | string[];
}

interface Alert {
  id: number;
  watch_id: number;
  topic: string;
  mode: string;
  score: number;
  action_taken: string;
  briefing: string;
  timestamp: string;
}

interface BriefingPreview {
  watch_id: number;
  topic: string;
  has_briefing: boolean;
  summary: string;
  briefing: string;
  score: number;
  action_taken: string;
  sources: SourceEvidence[];
}

interface ConversationTurn {
  role: string;
  message: string;
  time_in_call_secs?: number | null;
}

interface ConversationState {
  conversation_id: string;
  call_sid?: string;
  status: string;
  briefing: string;
  transcript: ConversationTurn[];
  analysis?: {
    transcript_summary?: string;
    call_successful?: string;
  };
  metadata?: {
    call_duration_secs?: number;
    termination_reason?: string;
  };
  updated_at?: string;
}

interface SourceEvidence {
  name: string;
  url?: string;
}

interface CreateWatchPayload {
  topic: string;
  watch_name?: string;
  source_urls?: string[];
  mode: "personal" | "team";
  threshold: number;
  frequency_minutes: number;
  watch_type: string;
  change_types: string[];
  impact_types: string[];
  briefing_focus: string[];
  require_sources: boolean;
  require_persistence: boolean;
  official_sources_only: boolean;
  urgency: string;
  extra_information?: string;
  phone?: string;
  email?: string | null;
  team_members?: Array<{
    name: string;
    role: string;
    phone: string;
    email: string | null;
  }>;
}

function scoreColor(s: number) {
  return s >= 8 ? "var(--critical)" : s >= 5 ? "var(--warning)" : "var(--border-strong)";
}

function cardBg(s: number) {
  return s >= 8 ? "rgba(184,92,75,0.04)" : s >= 5 ? "rgba(200,155,60,0.03)" : "var(--elevated)";
}

function cardBorder(s: number) {
  return s >= 8 ? "rgba(184,92,75,0.12)" : s >= 5 ? "rgba(200,155,60,0.1)" : "var(--border-soft)";
}

function actionBadge(action: string) {
  const m: Record<string, { bg: string; color: string; label: string }> = {
    silent: { bg: "var(--muted)", color: "var(--text-tertiary)", label: "Silent" },
    pending: { bg: "var(--muted)", color: "var(--text-tertiary)", label: "Pending" },
    sms: { bg: "rgba(111,129,150,0.1)", color: "var(--info)", label: "SMS sent" },
    "sms+email": { bg: "rgba(111,129,150,0.1)", color: "var(--info)", label: "SMS + Email" },
    call: { bg: "rgba(95,141,107,0.1)", color: "var(--success)", label: "Call placed" },
    batch_call: { bg: "rgba(95,141,107,0.1)", color: "var(--success)", label: "Team called" },
    simulated: { bg: "rgba(122,92,69,0.08)", color: "var(--accent)", label: "Simulated" },
  };
  return m[action] || m.silent;
}

function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function timeFull(d: string) {
  return new Date(d).toLocaleString("en-AU", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TOPICS = ["OpenAI", "Google DeepMind", "EU AI Act", "Tesla", "Apple", "Cybersecurity"];
const WATCH_TYPES = [
  "Competitor",
  "Pricing page",
  "Regulator",
  "Status page",
  "Security advisory",
  "Executive watch",
];

const CHANGE_TYPES = [
  "Pricing changes",
  "Product launches",
  "Outages / incidents",
  "Regulatory updates",
  "Security advisories",
  "Executive moves",
  "Press / narrative shifts",
  "Any major update",
];

const IMPACT_TYPES = [
  "Strategic",
  "Financial",
  "Technical",
  "Compliance",
  "Reputational",
];

const BRIEFING_FOCUS = [
  "What changed",
  "Why it matters",
  "What to do next",
];
const URGENCIES = [
  { value: "realtime", label: "Real-time", desc: "Call immediately", threshold: 5, freq: 15 },
  { value: "hourly", label: "Hourly", desc: "Call for critical shifts", threshold: 7, freq: 60 },
  { value: "relaxed", label: "Daily", desc: "Only breaking news", threshold: 9, freq: 60 },
];

function parseSources(input?: string | SourceEvidence[] | string[]): SourceEvidence[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (typeof item === "string") return { name: item };
        if (item && typeof item === "object" && typeof item.name === "string") {
          return { name: item.name, url: item.url || "" };
        }
        return null;
      })
      .filter((item): item is SourceEvidence => Boolean(item?.name));
  }

  try {
    // New rows store structured source evidence as JSON; older rows may still be plain text.
    const parsed = JSON.parse(input);
    return parseSources(parsed);
  } catch {
    return input
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
  }
}

function SourceChip({ source }: { source: SourceEvidence }) {
  const cardStyle: React.CSSProperties = {
    background: "var(--canvas)",
    border: "1px solid var(--border-soft)",
    borderRadius: 14,
    color: "var(--text-secondary)",
  };

  if (source.url) {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className="block px-3 py-3"
        style={cardStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[12px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>
          {source.name || "Source"}
        </p>
        <p className="text-[11px] break-all" style={{ color: "var(--accent)" }}>
          {source.url}
        </p>
      </a>
    );
  }

  return (
    <div className="px-3 py-3" style={cardStyle}>
      <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
        {source.name}
      </p>
    </div>
  );
}

function explainTrigger(log: Log, watch?: Watch | null, sourceCount = 0) {
  const bits: string[] = [];
  if (watch) bits.push(`threshold ≥${watch.threshold}`);
  bits.push(`score ${log.score}/10`);
  if (sourceCount > 0) bits.push(`${sourceCount} source${sourceCount === 1 ? "" : "s"}`);
  if (log.score >= 8) bits.push("high urgency");
  else if (log.score >= 5) bits.push("review-worthy");
  else bits.push("below escalation threshold");
  return bits.join(" · ");
}

function outcomeText(action: string, mode?: string) {
  if (action === "batch_call") return mode === "team" ? "Role-specific calls sent to the team." : "Multiple calls placed.";
  if (action === "call") return "Phone briefing placed successfully.";
  if (action === "sms") return "SMS fallback sent.";
  if (action === "sms+email") return "SMS and email fallback sent.";
  if (action === "pending") return "Signal detected and queued for escalation.";
  if (action === "simulated") return "Demo pathway fired with the full notification flow.";
  return "Signal logged without an escalation.";
}

function watchExplanation(watch: Watch) {
  if (watch.mode === "team") {
    return `Sentinel checks this every ${watch.frequency_minutes} minutes and starts the team call flow once the score reaches ${watch.threshold}/10.`;
  }
  return `Sentinel checks this every ${watch.frequency_minutes} minutes and flags it when the score reaches ${watch.threshold}/10.`;
}

function NewWatchModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [watchName, setWatchName] = useState("");
  const [topic, setTopic] = useState("");
  const [sourceUrlsText, setSourceUrlsText] = useState("");
  const [extraInformation, setExtraInformation] = useState("");
  const [watchType, setWatchType] = useState("Competitor");
  const [changeTypes, setChangeTypes] = useState<string[]>(["Any major update"]);
  const [impactTypes, setImpactTypes] = useState<string[]>(["Strategic"]);
  const [briefingFocus, setBriefingFocus] = useState<string[]>(["Why it matters"]);
  const [requireSources, setRequireSources] = useState(true);
  const [requirePersistence, setRequirePersistence] = useState(true);
  const [officialSourcesOnly, setOfficialSourcesOnly] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [urgency, setUrgency] = useState("hourly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sel = URGENCIES.find((u) => u.value === urgency)!;

  const toggleValue = (
    value: string,
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    if (list.includes(value)) {
      if (list.length === 1) return;
      setList(list.filter((item) => item !== value));
    } else {
      setList([...list, value]);
    }
  };

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 12px",
    borderRadius: 999,
    border: active ? "1px solid var(--text-primary)" : "1px solid var(--border-soft)",
    background: active ? "var(--elevated)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-tertiary)",
    fontSize: 12,
    fontWeight: 500,
    transition: "all .15s",
  });

  const submit = async () => {
    if (!topic.trim()) {
      setError("Enter what you want Sentinel to monitor");
      return;
    }

    if (!phone.trim()) {
      setError("Enter who Sentinel should call");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const topicLabel = topic.trim();
      const sourceUrls = sourceUrlsText
        .split("\n")
        .map((url) => url.trim())
        .filter(Boolean);

      const body: CreateWatchPayload = {
        topic: topicLabel,
        watch_name: watchName.trim() || undefined,
        source_urls: sourceUrls.length > 0 ? sourceUrls : undefined,
        mode: "personal",
        threshold: sel.threshold,
        frequency_minutes: sel.freq,
        watch_type: watchType,
        change_types: changeTypes,
        impact_types: impactTypes,
        briefing_focus: briefingFocus,
        require_sources: requireSources,
        require_persistence: requirePersistence,
        official_sources_only: officialSourcesOnly,
        urgency,
        extra_information: extraInformation.trim() || undefined,
        phone,
        email: email || null,
      };

      const res = await fetch(`${API_URL}/watch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error((await res.json()).detail || "Failed");

      onCreated();
      onClose();

      setWatchName("");
      setTopic("");
      setSourceUrlsText("");
      setExtraInformation("");
      setWatchType("Competitor");
      setChangeTypes(["Any major update"]);
      setImpactTypes(["Strategic"]);
      setBriefingFocus(["Why it matters"]);
      setRequireSources(true);
      setRequirePersistence(true);
      setOfficialSourcesOnly(false);
      setPhone("");
      setEmail("");
      setUrgency("hourly");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const inp: React.CSSProperties = {
    padding: "11px 14px",
    background: "var(--elevated)",
    border: "1px solid var(--border-soft)",
    borderRadius: 12,
    fontSize: 13,
    color: "var(--text-primary)",
    outline: "none",
    width: "100%",
    transition: "border-color .15s",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{
        background: "rgba(31,27,23,0.3)",
        backdropFilter: "blur(4px)",
        paddingTop: 56,
        paddingBottom: 32,
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto no-scrollbar fade-up"
        style={{
          background: "var(--canvas)",
          borderRadius: "var(--r-panel)",
          border: "1px solid var(--border-soft)",
          boxShadow: "0 24px 48px rgba(31,27,23,0.12)",
          padding: 32,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold" style={{ letterSpacing: "-0.02em" }}>
              New watch
            </h2>
            <p className="text-[13px] mt-1" style={{ color: "var(--text-tertiary)" }}>
              Tell Sentinel what to watch, who should hear about it, and how urgent it is.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "var(--muted)" }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-tertiary)"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-5">
          <label
            className="block text-[12px] font-medium mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            What do u wanna call this watch?
          </label>
          <input
            type="text"
            value={watchName}
            onChange={(e) => setWatchName(e.target.value)}
            placeholder="Short name for the dashboard"
            style={inp}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border-soft)")}
          />
        </div>

        <div className="mb-5">
          <label
            className="block text-[12px] font-medium mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            What are you monitoring?
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Company, regulator, pricing page, topic, or source"
            style={inp}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border-soft)")}
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => setTopic(t)}
                className="text-[11px] px-2.5 py-1"
                style={{
                  border: "1px solid var(--border-soft)",
                  borderRadius: "var(--r-pill)",
                  color: "var(--text-tertiary)",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <label
            className="block text-[12px] font-medium mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Add any URL
          </label>
          <textarea
            value={sourceUrlsText}
            onChange={(e) => setSourceUrlsText(e.target.value)}
            placeholder="One URL per line"
            style={{ ...inp, minHeight: 86, resize: "vertical" }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border-soft)")}
          />
          <p className="text-[11px] mt-2" style={{ color: "var(--text-tertiary)" }}>
            These URLs are passed through to Haiku so Firecrawl can track exact pages, not just the site homepage.
          </p>
        </div>

        <div className="mb-5">
          <label
            className="block text-[12px] font-medium mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Any extra information?
          </label>
          <textarea
            value={extraInformation}
            onChange={(e) => setExtraInformation(e.target.value)}
            placeholder="Context, specific pages, competitors, must-watch phrases, or anything else Haiku should use."
            style={{ ...inp, minHeight: 92, resize: "vertical" }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border-soft)")}
          />
        </div>

        <div className="mb-5">
          <label
            className="block text-[12px] font-medium mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Watch type
          </label>
          <div className="flex flex-wrap gap-2">
            {WATCH_TYPES.map((item) => (
              <button key={item} onClick={() => setWatchType(item)} style={chipStyle(watchType === item)}>
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <label
            className="block text-[12px] font-medium mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            What kind of change matters?
          </label>
          <div className="flex flex-wrap gap-2">
            {CHANGE_TYPES.map((item) => (
              <button
                key={item}
                onClick={() => toggleValue(item, changeTypes, setChangeTypes)}
                style={chipStyle(changeTypes.includes(item))}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <label
            className="block text-[12px] font-medium mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            What impact matters most?
          </label>
          <div className="flex flex-wrap gap-2">
            {IMPACT_TYPES.map((item) => (
              <button
                key={item}
                onClick={() => toggleValue(item, impactTypes, setImpactTypes)}
                style={chipStyle(impactTypes.includes(item))}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <label
            className="block text-[12px] font-medium mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            When should Sentinel interrupt?
          </label>
          <div className="space-y-1.5">
            {URGENCIES.map((u) => (
              <button
                key={u.value}
                onClick={() => setUrgency(u.value)}
                className="w-full text-left"
                style={{
                  padding: "12px 16px",
                  borderRadius: 14,
                  border:
                    urgency === u.value
                      ? "1.5px solid var(--text-primary)"
                      : "1px solid var(--border-soft)",
                  background: urgency === u.value ? "var(--elevated)" : "transparent",
                }}
              >
                <span
                  className="text-[13px] font-medium"
                  style={{
                    color:
                      urgency === u.value ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  {u.label}
                </span>
                <span className="text-[12px] ml-2" style={{ color: "var(--text-tertiary)" }}>
                  {u.desc}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <label
            className="block text-[12px] font-medium mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Only escalate when
          </label>
          <div className="space-y-2">
            {[
              {
                checked: requireSources,
                setChecked: setRequireSources,
                label: "2+ sources confirm it",
              },
              {
                checked: requirePersistence,
                setChecked: setRequirePersistence,
                label: "the change persists across checks",
              },
              {
                checked: officialSourcesOnly,
                setChecked: setOfficialSourcesOnly,
                label: "it comes from official sources",
              },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => item.setChecked(!item.checked)}
                className="w-full flex items-center gap-3 text-left"
                style={{
                  padding: "12px 14px",
                  background: "var(--elevated)",
                  border: "1px solid var(--border-soft)",
                  borderRadius: 14,
                }}
              >
                <div
                  className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                  style={{
                    background: item.checked ? "var(--text-primary)" : "transparent",
                    border: item.checked
                      ? "1px solid var(--text-primary)"
                      : "1px solid var(--border-soft)",
                  }}
                >
                  {item.checked && (
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--text-inverse)"
                      strokeWidth="3"
                      strokeLinecap="round"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </div>
                <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <label
            className="block text-[12px] font-medium mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Focus the briefing on
          </label>
          <div className="flex flex-wrap gap-2">
            {BRIEFING_FOCUS.map((item) => (
              <button
                key={item}
                onClick={() => toggleValue(item, briefingFocus, setBriefingFocus)}
                style={chipStyle(briefingFocus.includes(item))}
              >
                {item}
              </button>
            ))}
          </div>
          <p
            className="text-[11px] mt-2"
            style={{ color: "var(--text-tertiary)", lineHeight: 1.5 }}
          >
            These options shape the watch brief that gets consolidated before Firecrawl runs.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <div>
            <label
              className="block text-[12px] font-medium mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Who should Sentinel call?
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+61 400 000 000"
              style={inp}
            />
          </div>
          <div>
            <label
              className="block text-[12px] font-medium mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Fallback email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="optional"
              style={inp}
            />
          </div>
        </div>

        <div
          className="mb-5"
          style={{
            background: "var(--elevated)",
            border: "1px solid var(--border-soft)",
            borderRadius: 16,
            padding: 16,
          }}
        >
          <p
            className="text-[10px] font-semibold uppercase tracking-wider mb-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            Watch summary
          </p>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Monitor{" "}
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
              {topic || "this topic"}
            </span>{" "}
            as a{" "}
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
              {watchType.toLowerCase()}
            </span>
            . Prioritize {changeTypes.join(", ").toLowerCase()} with a{" "}
            {impactTypes.join(", ").toLowerCase()} lens. Sentinel will{" "}
            {sel.desc.toLowerCase()} and focus the briefing on{" "}
            {briefingFocus.join(", ").toLowerCase()}.
          </p>
        </div>

        {error && (
          <p className="text-[12px] mb-3" style={{ color: "var(--critical)" }}>
            {error}
          </p>
        )}

        <button
          onClick={submit}
          disabled={loading || !topic.trim()}
          className="w-full py-3 text-[13px] font-medium"
          style={{
            background: loading || !topic.trim() ? "var(--muted)" : "var(--text-primary)",
            color:
              loading || !topic.trim() ? "var(--text-tertiary)" : "var(--text-inverse)",
            borderRadius: "var(--r-button)",
          }}
        >
          {loading ? "Creating..." : "Create watch"}
        </button>
      </div>
    </div>
  );
}

function PersonalOverviewCard({
  latestBriefing,
  onCreateWatch,
  onOpenBriefing,
  onCallNow,
  previewingWatchId,
  callingWatchId,
  conversation,
  onViewTranscript,
  loadingTranscriptWatchId,
}: {
  latestBriefing: BriefingPreview | null;
  onCreateWatch: () => void;
  onOpenBriefing: (watchId: number) => void;
  onCallNow: (watchId: number) => void;
  previewingWatchId: number | null;
  callingWatchId: number | null;
  conversation: ConversationState | null;
  onViewTranscript: (watchId: number) => void;
  loadingTranscriptWatchId: number | null;
}) {
  return (
    <div style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: "var(--r-card)", padding: 24, boxShadow: "var(--shadow-sm)" }}>
      <div className="mb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>
            Voice briefing
          </p>
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Re-open the latest briefing, place another call, or fetch the transcript from the most recent conversation.
          </p>
        </div>
      </div>

      <div style={{ background: "var(--canvas)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
        {latestBriefing?.has_briefing ? (
          <>
            <p className="text-[14px] font-medium mb-2">{latestBriefing.topic}</p>
            <p className="text-[13px] leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>
              {latestBriefing.briefing}
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {latestBriefing.sources.slice(0, 3).map((source) => (
                <SourceChip key={`${source.name}-${source.url || "no-url"}`} source={source} />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onOpenBriefing(latestBriefing.watch_id)}
                className="px-3 py-2 text-[12px] font-medium"
                style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: 12, color: "var(--text-secondary)" }}
              >
                {previewingWatchId === latestBriefing.watch_id ? "Loading..." : "Preview briefing"}
              </button>
              <button
                onClick={() => onCallNow(latestBriefing.watch_id)}
                className="px-3 py-2 text-[12px] font-medium"
                style={{ background: "var(--text-primary)", borderRadius: 12, color: "var(--text-inverse)" }}
              >
                {callingWatchId === latestBriefing.watch_id ? "Calling..." : "Call me now"}
              </button>
              <button
                onClick={() => onViewTranscript(latestBriefing.watch_id)}
                className="px-3 py-2 text-[12px] font-medium"
                style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: 12, color: "var(--text-secondary)" }}
              >
                {loadingTranscriptWatchId === latestBriefing.watch_id ? "Loading..." : "View transcript"}
              </button>
            </div>
            {conversation?.transcript?.length ? (
              <p className="text-[11px] mt-3" style={{ color: "var(--text-tertiary)" }}>
                Transcript ready. Open it from the transcript button or the alert detail panel.
              </p>
            ) : null}
          </>
        ) : (
          <div>
            <p className="text-[15px] font-medium mb-1">No voice briefing yet</p>
            <p className="text-[13px] leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>
              Once an important change is detected, Sentinel will save the latest briefing here.
            </p>
            <button onClick={onCreateWatch} className="text-[12px] font-medium" style={{ color: "var(--accent)" }}>
              Create a watch →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamInsightsCard({ watches, previousWatches }: { watches: Watch[]; previousWatches: Watch[] }) {
  const teamWatches = watches.filter((watch) => watch.mode === "team");
  const stoppedTeamWatches = previousWatches.filter((watch) => watch.mode === "team");

  return (
    <div style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: "var(--r-card)", padding: 24, boxShadow: "var(--shadow-sm)" }}>
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>
          Team snapshot
        </p>
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Most of this dashboard is personal, but these shared watches are live too.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div style={{ background: "var(--canvas)", border: "1px solid var(--border-soft)", borderRadius: 14, padding: 14 }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
            Live team watches
          </p>
          <p className="text-[20px] font-semibold">{teamWatches.length}</p>
        </div>
        <div style={{ background: "var(--canvas)", border: "1px solid var(--border-soft)", borderRadius: 14, padding: 14 }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
            Stopped team watches
          </p>
          <p className="text-[20px] font-semibold">{stoppedTeamWatches.length}</p>
        </div>
      </div>

      {teamWatches.length > 0 ? (
        <div className="space-y-2 mb-4">
          {teamWatches.slice(0, 2).map((watch) => (
            <div key={watch.id} style={{ background: "var(--canvas)", border: "1px solid var(--border-soft)", borderRadius: 14, padding: 14 }}>
              <p className="text-[13px] font-medium mb-1">{watch.topic}</p>
              <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                Watch #{watch.id} · Every {watch.frequency_minutes}m · threshold ≥{watch.threshold}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[13px] mb-4" style={{ color: "var(--text-tertiary)" }}>
          No team watches are active right now.
        </p>
      )}

      <Link href="/app/team" className="text-[12px] font-medium" style={{ color: "var(--accent)" }}>
        Open teams →
      </Link>
    </div>
  );
}

function DashboardSummaryStrip({
  watches,
  previousWatches,
  logs,
}: {
  watches: Watch[];
  previousWatches: Watch[];
  logs: Log[];
}) {
  const personalWatches = watches.filter((watch) => watch.mode !== "team");
  const teamWatches = watches.filter((watch) => watch.mode === "team");
  const urgentLogs = logs.filter((log) => log.score >= 8);

  const boxes = [
    {
      label: "Personal watches",
      value: String(personalWatches.length),
      note: "Live monitors watching for your updates.",
    },
    {
      label: "Urgent signals",
      value: String(urgentLogs.length),
      note: "High-priority events waiting in the feed.",
    },
    {
      label: "Team watches",
      value: String(teamWatches.length),
      note: "Shared watches that can trigger role-specific calls.",
    },
    {
      label: "Stopped watches",
      value: String(previousWatches.length),
      note: "Older watches kept for reference.",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {boxes.map((box) => (
        <div
          key={box.label}
          style={{
            background: "var(--elevated)",
            border: "1px solid var(--border-soft)",
            borderRadius: "var(--r-card)",
            padding: 20,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
            {box.label}
          </p>
          <p className="text-[24px] font-semibold mb-2">{box.value}</p>
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {box.note}
          </p>
        </div>
      ))}
    </div>
  );
}

function AlertDetailPanel({
  open,
  onClose,
  log,
  alert,
  watch,
  conversation,
  onRefreshConversation,
  loadingConversation,
}: {
  open: boolean;
  onClose: () => void;
  log: Log | null;
  alert?: Alert;
  watch?: Watch | null;
  conversation: ConversationState | null;
  onRefreshConversation: (watchId: number) => void;
  loadingConversation: boolean;
}) {
  if (!open || !log) return null;

  const badge = actionBadge(log.action_taken);
  const sources = parseSources(log.sources);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: "rgba(31,27,23,0.18)" }} onClick={onClose}>
      <div
        className="h-full w-full max-w-[520px] overflow-y-auto no-scrollbar fade-up"
        style={{
          background: "var(--canvas)",
          borderLeft: "1px solid var(--border-soft)",
          boxShadow: "-24px 0 48px rgba(31,27,23,0.08)",
          padding: 28,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
              Alert detail
            </p>
            <h3 className="text-[24px] font-semibold" style={{ letterSpacing: "-0.03em" }}>
              {log.topic}
            </h3>
            <p className="text-[13px] mt-1" style={{ color: "var(--text-tertiary)" }}>
              {timeFull(log.crawl_time)} · Watch #{log.watch_id}
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--muted)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5">
          <div style={{ background: cardBg(log.score), border: `1px solid ${cardBorder(log.score)}`, borderRadius: 20, padding: 20 }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center font-semibold font-[family-name:var(--font-mono)]"
                  style={{
                    background: log.score >= 8 ? "rgba(184,92,75,0.08)" : log.score >= 5 ? "rgba(200,155,60,0.08)" : "var(--muted)",
                    color: scoreColor(log.score),
                  }}
                >
                  {log.score}
                </div>
                <div>
                  <p className="text-[15px] font-medium">Current signal</p>
                  <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                    {explainTrigger(log, watch, sources.length)}
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-semibold px-3 py-1.5 uppercase tracking-wider" style={{ background: badge.bg, color: badge.color, borderRadius: "var(--r-pill)" }}>
                {badge.label}
              </span>
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {log.summary || "No summary available."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 16 }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
                Why it fired
              </p>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {watch
                  ? `This watch checks every ${watch.frequency_minutes} minutes and escalates once the score reaches ${watch.threshold}. This event scored ${log.score}.`
                  : `This event scored ${log.score} and matched the backend action path for ${badge.label.toLowerCase()}.`}
              </p>
            </div>
            <div style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 16 }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
                Outcome
              </p>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {outcomeText(log.action_taken, watch?.mode)}
              </p>
            </div>
          </div>

          <div style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 18 }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>
              Source evidence
            </p>
            {sources.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {sources.map((source) => (
                  <SourceChip key={`${source.name}-${source.url || "no-url"}`} source={source} />
                ))}
              </div>
            ) : (
              <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                This log does not include source labels yet.
              </p>
            )}
          </div>

          <div style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 18 }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>
              Briefing / transcript
            </p>
            <div style={{ background: "var(--canvas)", border: "1px solid var(--border-soft)", borderRadius: 14, padding: 16 }}>
              <p className="text-[13px] leading-[1.7] italic" style={{ color: "var(--text-secondary)" }}>
                &ldquo;{alert?.briefing || log.summary || "No transcript available yet."}&rdquo;
              </p>
            </div>
            <div className="mt-3">
              <button
                onClick={() => onRefreshConversation(log.watch_id)}
                className="text-[12px] font-medium"
                style={{ color: "var(--accent)" }}
              >
                {loadingConversation ? "Refreshing transcript..." : "Refresh full call transcript"}
              </button>
            </div>
            {conversation && conversation.transcript.length > 0 && (
              <div className="mt-4 space-y-2">
                {conversation.transcript.map((turn, index) => (
                  <div key={`${turn.role}-${index}`} style={{ background: "var(--canvas)", border: "1px solid var(--border-soft)", borderRadius: 12, padding: 12 }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>
                      {turn.role === "agent" ? "Sentinel" : "You"}
                    </p>
                    <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      {turn.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 18 }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>
              Notification
            </p>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {outcomeText(log.action_taken, watch?.mode)} Open the source links above to verify the change and decide whether this watch should stay active, be tightened, or be stopped.
            </p>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>
              Next actions
            </p>
            <div className="grid grid-cols-3 gap-3">
              {["Review sources", "Adjust this watch", "Stop if noisy"].map((label) => (
                <button key={label} className="text-[12px] font-medium px-4 py-3 text-left" style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: 14, color: "var(--text-secondary)" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const [watches, setWatches] = useState<Watch[]>([]);
  const [previousWatches, setPreviousWatches] = useState<Watch[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<"all" | "review" | "urgent">("all");
  const [showModal, setShowModal] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [stoppingWatchId, setStoppingWatchId] = useState<number | null>(null);
  const [showAllPreviousWatches, setShowAllPreviousWatches] = useState(false);
  const [latestBriefing, setLatestBriefing] = useState<BriefingPreview | null>(null);
  const [previewingWatchId, setPreviewingWatchId] = useState<number | null>(null);
  const [callingWatchId, setCallingWatchId] = useState<number | null>(null);
  const [conversationByWatch, setConversationByWatch] = useState<Record<number, ConversationState>>({});
  const [loadingTranscriptWatchId, setLoadingTranscriptWatchId] = useState<number | null>(null);

  const api = useCallback(async (url: string) => (await fetch(url)).json(), []);

  // Keep the three core dashboard datasets in sync after create/stop/call actions.
  const refreshAll = useCallback(() => {
    api(`${API_URL}/watches`).then((d) => {
      setWatches(d.watches || []);
      setPreviousWatches(d.previous_watches || []);
    }).catch(() => {});
    api(`${API_URL}/logs?limit=100`).then((d) => setLogs(d.logs || [])).catch(() => {});
    api(`${API_URL}/alerts?limit=50`).then((d) => setAlerts(d.alerts || [])).catch(() => {});
  }, [api]);

  useEffect(() => {
    // Logs move fastest, so they refresh more often than watches and alerts.
    refreshAll();
    const a = setInterval(() => api(`${API_URL}/logs?limit=100`).then((d) => setLogs(d.logs || [])).catch(() => {}), 5000);
    const c = setInterval(() => api(`${API_URL}/watches`).then((d) => {
      setWatches(d.watches || []);
      setPreviousWatches(d.previous_watches || []);
    }).catch(() => {}), 15000);
    const e = setInterval(() => api(`${API_URL}/alerts?limit=50`).then((d) => setAlerts(d.alerts || [])).catch(() => {}), 10000);

    return () => {
      clearInterval(a);
      clearInterval(c);
      clearInterval(e);
    };
  }, [api, refreshAll]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("newWatch") !== "personal") return;
    params.delete("newWatch");
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl);
    setTimeout(() => setShowModal(true), 0);
  }, [pathname, router]);

  useEffect(() => {
    // The briefing card mirrors the freshest watch that produced either an alert or a log.
    const latestWatchId = alerts[0]?.watch_id || logs[0]?.watch_id || null;
    if (!latestWatchId) return;
    api(`${API_URL}/watch/${latestWatchId}/briefing-preview`)
      .then((data) => setLatestBriefing({ ...data, sources: parseSources(data.sources) }))
      .catch(() => {});
  }, [api, alerts, logs]);

  const stopWatch = async (id: number) => {
    setStoppingWatchId(id);
    try {
      await fetch(`${API_URL}/watch/${id}/stop`, { method: "POST" });
      const stoppedWatch = watches.find((watch) => watch.id === id) || null;
      setWatches((current) => current.filter((watch) => watch.id !== id));
      if (stoppedWatch) {
        setPreviousWatches((current) => [stoppedWatch, ...current]);
      }
      refreshAll();
      setSelectedLogId((current) => {
        const currentLog = logs.find((log) => log.id === current);
        return currentLog?.watch_id === id ? null : current;
      });
    } catch {}
    setStoppingWatchId(null);
  };

  const openBriefingPreview = async (watchId: number) => {
    setPreviewingWatchId(watchId);
    try {
      const data = await api(`${API_URL}/watch/${watchId}/briefing-preview`);
      setLatestBriefing({ ...data, sources: parseSources(data.sources) });
    } catch {}
    setPreviewingWatchId(null);
  };

  const loadConversation = async (watchId: number) => {
    setLoadingTranscriptWatchId(watchId);
    try {
      const response = await api(`${API_URL}/watch/${watchId}/conversation`);
      if (response?.conversation) {
        setConversationByWatch((current) => ({ ...current, [watchId]: response.conversation }));
      }
    } catch {}
    setLoadingTranscriptWatchId(null);
  };

  const callNow = async (watchId: number) => {
    setCallingWatchId(watchId);
    try {
      await fetch(`${API_URL}/watch/${watchId}/call-now`, { method: "POST" });
      refreshAll();
      await openBriefingPreview(watchId);
      setTimeout(() => loadConversation(watchId), 3000);
    } catch {}
    setCallingWatchId(null);
  };

  const findBriefing = (log: Log): Alert | undefined =>
    alerts.find(
      (a) =>
        a.watch_id === log.watch_id &&
        Math.abs(new Date(a.timestamp).getTime() - new Date(log.crawl_time).getTime()) < 120000,
    );

  const filtered = logs.filter((l) =>
    filter === "review"
      ? l.score >= 5
      : filter === "urgent"
        ? l.score >= 8
        : true,
  );

  const featuredLog =
    [...logs].sort((a, b) => b.score - a.score || new Date(b.crawl_time).getTime() - new Date(a.crawl_time).getTime())[0] || null;

  const featuredWatch = featuredLog ? watches.find((w) => w.id === featuredLog.watch_id) || null : null;

  const selectedLog = selectedLogId ? logs.find((l) => l.id === selectedLogId) || null : null;
  const selectedWatch = selectedLog ? watches.find((w) => w.id === selectedLog.watch_id) || null : null;
  const selectedAlert = selectedLog ? findBriefing(selectedLog) : undefined;
  const visiblePreviousWatches = showAllPreviousWatches ? previousWatches : previousWatches.slice(0, 4);

  return (
    <div className="min-h-screen" style={{ background: "var(--canvas)" }}>
      <NewWatchModal open={showModal} onClose={() => setShowModal(false)} onCreated={refreshAll} />

      <AlertDetailPanel
        open={!!selectedLog}
        onClose={() => setSelectedLogId(null)}
        log={selectedLog}
        alert={selectedAlert}
        watch={selectedWatch}
        conversation={selectedLog ? conversationByWatch[selectedLog.watch_id] || null : null}
        onRefreshConversation={loadConversation}
        loadingConversation={selectedLog ? loadingTranscriptWatchId === selectedLog.watch_id : false}
      />

      <div style={{ background: "var(--elevated)", borderBottom: "1px solid var(--border-soft)" }}>
        <div className="px-10" style={{ paddingTop: 28, paddingBottom: 28 }}>
          <div className="flex items-center justify-between mb-7">
            <div>
              <h1 className="font-semibold mb-1" style={{ fontSize: 22, letterSpacing: "-0.02em" }}>
                Your watches
              </h1>
              <p className="text-[14px]" style={{ color: "var(--text-tertiary)" }}>
                See the most important update first, open the exact source links, and decide whether each watch should stay live, be tightened, or be stopped.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium" style={{ background: "var(--text-primary)", color: "var(--text-inverse)", borderRadius: "var(--r-button)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New watch
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-10 py-8 space-y-8">
        <DashboardSummaryStrip watches={watches} previousWatches={previousWatches} logs={logs} />

        <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-5">
          <div
            style={{
              background: featuredLog ? cardBg(featuredLog.score) : "var(--elevated)",
              border: `1px solid ${featuredLog ? cardBorder(featuredLog.score) : "var(--border-soft)"}`,
              borderRadius: "var(--r-card)",
              padding: 24,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  Most important update
                </p>
                <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
                  Start here if you only want to read one thing.
                </p>
              </div>
              {featuredLog && (
                <span
                  className="text-[10px] font-semibold px-3 py-1.5 uppercase tracking-wider"
                  style={{
                    background: actionBadge(featuredLog.action_taken).bg,
                    color: actionBadge(featuredLog.action_taken).color,
                    borderRadius: "var(--r-pill)",
                  }}
                >
                  {actionBadge(featuredLog.action_taken).label}
                </span>
              )}
            </div>

            {featuredLog ? (
              <>
                <div className="flex items-start gap-4 mb-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center font-semibold text-lg font-[family-name:var(--font-mono)]"
                    style={{
                      background: featuredLog.score >= 8 ? "rgba(184,92,75,0.08)" : featuredLog.score >= 5 ? "rgba(200,155,60,0.08)" : "var(--muted)",
                      color: scoreColor(featuredLog.score),
                    }}
                  >
                    {featuredLog.score}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-[22px] font-semibold mb-1" style={{ letterSpacing: "-0.03em" }}>
                      {featuredLog.topic}
                    </h2>
                    <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                      {timeFull(featuredLog.crawl_time)} · Watch #{featuredLog.watch_id}
                    </p>
                  </div>
                </div>

                <p className="text-[14px] leading-relaxed mb-5" style={{ color: "var(--text-secondary)" }}>
                  {featuredLog.summary}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                  <div style={{ background: "var(--canvas)", border: "1px solid var(--border-soft)", borderRadius: 14, padding: 14 }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
                      What happened
                    </p>
                    <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      {featuredLog.summary}
                    </p>
                  </div>
                  <div style={{ background: "var(--canvas)", border: "1px solid var(--border-soft)", borderRadius: 14, padding: 14 }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
                      Why Sentinel flagged it
                    </p>
                    <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      {explainTrigger(featuredLog, featuredWatch, parseSources(featuredLog.sources).length)}
                    </p>
                  </div>
                  <div style={{ background: "var(--canvas)", border: "1px solid var(--border-soft)", borderRadius: 14, padding: 14 }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
                      What happened next
                    </p>
                    <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      {outcomeText(featuredLog.action_taken, featuredWatch?.mode)}
                    </p>
                  </div>
                </div>

                {parseSources(featuredLog.sources).length > 0 && (
                  <div className="mb-5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
                      Exact source links
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {parseSources(featuredLog.sources).map((source) => (
                        <SourceChip key={`${source.name}-${source.url || "no-url"}`} source={source} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3">
                  <button onClick={() => setSelectedLogId(featuredLog.id)} className="px-4 py-3 text-[13px] font-medium text-left" style={{ background: "var(--text-primary)", color: "var(--text-inverse)", borderRadius: 14 }}>
                    Open full alert
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center" style={{ padding: "36px 20px" }}>
                <p className="text-[15px] mb-1" style={{ color: "var(--text-secondary)" }}>
                  No alert yet
                </p>
                <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                  Once Sentinel detects a meaningful shift, the strongest event appears here first.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <PersonalOverviewCard
              latestBriefing={latestBriefing}
              onCreateWatch={() => setShowModal(true)}
              onOpenBriefing={openBriefingPreview}
              onCallNow={callNow}
              previewingWatchId={previewingWatchId}
              callingWatchId={callingWatchId}
              conversation={latestBriefing ? conversationByWatch[latestBriefing.watch_id] || null : null}
              onViewTranscript={loadConversation}
              loadingTranscriptWatchId={loadingTranscriptWatchId}
            />
            <TeamInsightsCard watches={watches} previousWatches={previousWatches} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                Your active watches
              </h2>
              <span className="text-[11px] font-[family-name:var(--font-mono)]" style={{ color: "var(--border-strong)" }}>
                {watches.length} live
              </span>
            </div>
          </div>

          {watches.length === 0 ? (
            <div className="text-center" style={{ background: "var(--elevated)", border: "1px dashed var(--border-soft)", borderRadius: "var(--r-card)", padding: 48 }}>
              <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
                No watches yet
              </p>
              <button onClick={() => setShowModal(true)} className="text-[13px] font-medium" style={{ color: "var(--accent)" }}>
                Create your first watch →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {watches.map((w) => (
                <div key={w.id} style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: "var(--r-card)", padding: 22, boxShadow: "var(--shadow-sm)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: "var(--success)" }} />
                      <span className="text-[14px] font-medium">{w.topic}</span>
                    </div>
                    <span className="text-[9px] font-semibold px-2.5 py-1 uppercase tracking-wider" style={{ background: w.mode === "team" ? "rgba(111,129,150,0.1)" : "var(--muted)", color: w.mode === "team" ? "var(--info)" : "var(--text-tertiary)", borderRadius: "var(--r-pill)" }}>
                      {w.mode === "team" ? "team" : "active"}
                    </span>
                  </div>
                  <p className="text-[11px] font-[family-name:var(--font-mono)] mb-4" style={{ color: "var(--text-tertiary)" }}>
                    Watch #{w.id} · Every {w.frequency_minutes}m · threshold ≥{w.threshold}
                  </p>
                  <p className="text-[12px] leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
                    {watchExplanation(w)}
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => openBriefingPreview(w.id)}
                      disabled={previewingWatchId === w.id}
                      className="py-2.5 text-[12px] font-medium transition-all"
                      style={{
                        borderRadius: 12,
                        border: "1px solid var(--border-soft)",
                        background: "var(--canvas)",
                        color: previewingWatchId === w.id ? "var(--text-tertiary)" : "var(--text-secondary)",
                      }}
                    >
                      {previewingWatchId === w.id ? "Loading..." : "Open latest briefing"}
                    </button>
                    <button
                      onClick={() => callNow(w.id)}
                      disabled={callingWatchId === w.id}
                      className="py-2.5 text-[12px] font-medium transition-all"
                      style={{
                        borderRadius: 12,
                        border: "1px solid var(--text-primary)",
                        background: "var(--text-primary)",
                        color: "var(--text-inverse)",
                      }}
                    >
                      {callingWatchId === w.id ? "Calling..." : "Call me now"}
                    </button>
                    {w.mode === "team" ? (
                      <Link
                        href="/app/team"
                        className="py-2.5 text-[12px] font-medium text-center transition-all"
                        style={{
                          borderRadius: 12,
                          border: "1px solid var(--border-soft)",
                          background: "var(--canvas)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        Open team setup
                      </Link>
                    ) : null}
                    <button
                      onClick={() => stopWatch(w.id)}
                      disabled={stoppingWatchId === w.id}
                      className="py-2.5 text-[12px] font-medium transition-all"
                      style={{
                        borderRadius: 12,
                        border: "1px solid var(--border-soft)",
                        background: "var(--canvas)",
                        color: stoppingWatchId === w.id ? "var(--text-tertiary)" : "var(--critical)",
                      }}
                    >
                      {stoppingWatchId === w.id ? "Stopping..." : "Stop"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {previousWatches.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  Stopped watches
                </h2>
                <span className="text-[11px] font-[family-name:var(--font-mono)]" style={{ color: "var(--border-strong)" }}>
                  {previousWatches.length} stopped
                </span>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {visiblePreviousWatches.map((watch) => (
                <div
                  key={watch.id}
                  style={{
                    background: "var(--elevated)",
                    border: "1px solid var(--border-soft)",
                    borderRadius: "var(--r-card)",
                    padding: 20,
                    opacity: 0.86,
                  }}
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-2 h-2 rounded-full" style={{ background: "var(--border-strong)" }} />
                    <span className="text-[14px] font-medium">{watch.topic}</span>
                  </div>
                  <p className="text-[11px] font-[family-name:var(--font-mono)]" style={{ color: "var(--text-tertiary)" }}>
                    Watch #{watch.id} · Every {watch.frequency_minutes}m · threshold ≥{watch.threshold}
                  </p>
                  <p className="text-[12px] leading-relaxed mt-3" style={{ color: "var(--text-secondary)" }}>
                    This watch is stopped. It stays here so you can remember what it tracked and restart a similar watch later.
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  Recent updates
                </h2>
              <span className="text-[11px] font-[family-name:var(--font-mono)]" style={{ color: "var(--border-strong)" }}>
                {filtered.length} events
              </span>
            </div>

            <div className="flex gap-0.5 p-0.5" style={{ background: "var(--muted)", borderRadius: 10 }}>
              {(["all", "review", "urgent"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="px-3.5 py-1.5 text-[11px] font-medium capitalize transition-all"
                  style={{
                    borderRadius: 8,
                    background: filter === f ? "var(--elevated)" : "transparent",
                    color: filter === f ? "var(--text-primary)" : "var(--text-tertiary)",
                    boxShadow: filter === f ? "var(--shadow-sm)" : "none",
                  }}
                >
                  {f === "review" ? "needs review" : f}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center" style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: "var(--r-card)", padding: 64 }}>
              <p className="text-[15px] mb-1" style={{ color: "var(--text-secondary)" }}>
                Waiting for events
              </p>
              <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                Updates appear here as Sentinel monitors your watches.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((log) => {
                const badge = actionBadge(log.action_taken);
                const briefing = findBriefing(log);
                const watch = watches.find((w) => w.id === log.watch_id);
                const sources = parseSources(log.sources);

                return (
                  <button
                    key={log.id}
                    onClick={() => setSelectedLogId(log.id)}
                    className="w-full text-left transition-all"
                    style={{
                      background: cardBg(log.score),
                      border: `1px solid ${cardBorder(log.score)}`,
                      borderRadius: "var(--r-card)",
                      boxShadow: "var(--shadow-sm)",
                      padding: "20px 24px",
                    }}
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-start gap-3.5">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center font-semibold text-base font-[family-name:var(--font-mono)]"
                          style={{
                            background: log.score >= 8 ? "rgba(184,92,75,0.08)" : log.score >= 5 ? "rgba(200,155,60,0.08)" : "var(--muted)",
                            color: scoreColor(log.score),
                          }}
                        >
                          {log.score}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[15px] font-medium">{log.topic}</span>
                            <span className="text-[12px] font-[family-name:var(--font-mono)]" style={{ color: "var(--text-tertiary)" }}>
                              {timeAgo(log.crawl_time)}
                            </span>
                            <span className="text-[11px] font-[family-name:var(--font-mono)]" style={{ color: "var(--border-strong)" }}>
                              Watch #{log.watch_id}
                            </span>
                          </div>
                          <p className="text-[13px] leading-relaxed mt-2" style={{ color: "var(--text-secondary)" }}>
                            {log.summary}
                          </p>
                          <p className="text-[12px] mt-2" style={{ color: "var(--text-tertiary)" }}>
                            {watch ? watchExplanation(watch) : "Open this update to see the full alert and source links."}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <span className="text-[10px] font-semibold px-3 py-1.5 uppercase tracking-wider" style={{ background: badge.bg, color: badge.color, borderRadius: "var(--r-pill)" }}>
                          {badge.label}
                        </span>
                        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                          {sources.length > 0 ? `${sources.length} exact links` : "open detail"}
                        </span>
                      </div>
                    </div>

                    <div className="pl-[54px] flex flex-wrap gap-2">
                      <span className="text-[11px] font-medium px-3 py-1.5" style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 999, color: "var(--text-secondary)" }}>
                        {explainTrigger(log, watch || null, sources.length)}
                      </span>
                      {briefing?.briefing && (
                        <span className="text-[11px] font-medium px-3 py-1.5" style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 999, color: "var(--text-secondary)" }}>
                          transcript available
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
