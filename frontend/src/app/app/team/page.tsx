"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface CreateTeamWatchPayload {
  topic: string;
  watch_name?: string;
  source_urls?: string[];
  mode: "team";
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
  team_members: Array<{
    name: string;
    role: string;
    phone: string;
    email: string | null;
  }>;
}

interface TeamWatch {
  id: number;
  topic: string;
  mode: string;
  threshold: number;
  frequency_minutes: number;
  active: boolean;
  created_at?: string | null;
  latest_alert_at?: string | null;
}

interface TeamMember {
  id: number;
  name: string;
  role: string;
  phone: string;
  email: string | null;
}

interface TeamWorkspace {
  team_id: number;
  team_name: string;
  watch_count: number;
  active_watch_count: number;
  member_count: number;
  latest_alert_at?: string | null;
  watches: TeamWatch[];
  members: TeamMember[];
}

const ROLES = ["CEO", "Engineer", "CFO", "Marketing", "Other"];
const WATCH_TYPES = ["Competitor", "Pricing page", "Regulator", "Status page", "Executive watch"];
const CHANGE_TYPES = ["Pricing changes", "Product launches", "Regulatory updates", "Executive moves", "Any major update"];
const IMPACT_TYPES = ["Strategic", "Financial", "Technical", "Compliance", "Reputational"];
const BRIEFING_FOCUS = ["What changed", "Why it matters", "What to do next"];
const URGENCIES = [
  { value: "realtime", label: "Real-time", desc: "Call the team immediately", threshold: 5, freq: 15 },
  { value: "hourly", label: "Hourly", desc: "Call for critical shifts", threshold: 7, freq: 60 },
  { value: "daily", label: "Daily", desc: "Only major updates", threshold: 9, freq: 60 },
];

const roleBadge: Record<string, { bg: string; color: string }> = {
  ceo: { bg: "rgba(200,155,60,0.1)", color: "var(--warning)" },
  engineer: { bg: "rgba(111,129,150,0.1)", color: "var(--info)" },
  cfo: { bg: "rgba(95,141,107,0.1)", color: "var(--success)" },
  marketing: { bg: "rgba(224,122,95,0.1)", color: "var(--coral)" },
  other: { bg: "var(--muted)", color: "var(--text-tertiary)" },
};

function timeAgo(value?: string | null) {
  if (!value) return "No alerts yet";
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

interface MemberDraft {
  name: string;
  role: string;
  phone: string;
  email: string;
}

function TeamWatchModal({
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
  const [urgency, setUrgency] = useState("hourly");
  const [members, setMembers] = useState<MemberDraft[]>([{ name: "", role: "CEO", phone: "", email: "" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedUrgency = URGENCIES.find((item) => item.value === urgency) || URGENCIES[1];

  const inputStyle: CSSProperties = {
    padding: "11px 14px",
    background: "var(--elevated)",
    border: "1px solid var(--border-soft)",
    borderRadius: 12,
    fontSize: 13,
    color: "var(--text-primary)",
    outline: "none",
    width: "100%",
  };

  const chipStyle = (active: boolean): CSSProperties => ({
    padding: "8px 12px",
    borderRadius: 999,
    border: active ? "1px solid var(--text-primary)" : "1px solid var(--border-soft)",
    background: active ? "var(--elevated)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-tertiary)",
    fontSize: 12,
    fontWeight: 500,
  });

  const toggleValue = (
    value: string,
    list: string[],
    setList: Dispatch<SetStateAction<string[]>>,
  ) => {
    if (list.includes(value)) {
      if (list.length === 1) return;
      setList(list.filter((item) => item !== value));
      return;
    }
    setList([...list, value]);
  };

  const updateMember = (index: number, field: keyof MemberDraft, value: string) => {
    setMembers((current) => current.map((member, currentIndex) => (
      currentIndex === index ? { ...member, [field]: value } : member
    )));
  };

  const addMember = () => setMembers((current) => [...current, { name: "", role: "Engineer", phone: "", email: "" }]);
  const removeMember = (index: number) => {
    setMembers((current) => current.length === 1 ? current : current.filter((_, currentIndex) => currentIndex !== index));
  };

  const submit = async () => {
    if (!topic.trim()) {
      setError("Enter what the team should monitor");
      return;
    }
    if (members.some((member) => !member.name.trim() || !member.phone.trim())) {
      setError("Each team member needs a name and phone number");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const payload: CreateTeamWatchPayload = {
        topic: topic.trim(),
        watch_name: watchName.trim() || undefined,
        source_urls: sourceUrlsText.split("\n").map((url) => url.trim()).filter(Boolean),
        mode: "team",
        threshold: selectedUrgency.threshold,
        frequency_minutes: selectedUrgency.freq,
        watch_type: watchType,
        change_types: changeTypes,
        impact_types: impactTypes,
        briefing_focus: briefingFocus,
        require_sources: requireSources,
        require_persistence: requirePersistence,
        official_sources_only: officialSourcesOnly,
        urgency,
        extra_information: extraInformation.trim() || undefined,
        team_members: members.map((member) => ({
          name: member.name.trim(),
          role: member.role.toLowerCase(),
          phone: member.phone.trim(),
          email: member.email.trim() || null,
        })),
      };

      const response = await fetch(`${API_URL}/watch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to create team watch");
      }
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
      setUrgency("hourly");
      setMembers([{ name: "", role: "CEO", phone: "", email: "" }]);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Failed to create team watch");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center" style={{ background: "rgba(31,27,23,0.3)", backdropFilter: "blur(4px)", paddingTop: 56, paddingBottom: 32 }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto no-scrollbar" style={{ background: "var(--canvas)", borderRadius: "var(--r-panel)", border: "1px solid var(--border-soft)", boxShadow: "0 24px 48px rgba(31,27,23,0.12)", padding: 32 }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold" style={{ letterSpacing: "-0.02em" }}>New team watch</h2>
            <p className="text-[13px] mt-1" style={{ color: "var(--text-tertiary)" }}>
              Create one shared watch, then let Sentinel call each teammate with the right angle.
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--muted)" }}>×</button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-[12px] font-medium mb-2" style={{ color: "var(--text-secondary)" }}>What do u wanna call this watch?</label>
            <input value={watchName} onChange={(event) => setWatchName(event.target.value)} placeholder="Short team watch name" style={inputStyle} />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-2" style={{ color: "var(--text-secondary)" }}>What is the team monitoring?</label>
            <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Company, product area, pricing page, regulator, or exec move" style={inputStyle} />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Add any URL</label>
            <textarea value={sourceUrlsText} onChange={(event) => setSourceUrlsText(event.target.value)} placeholder="One URL per line" style={{ ...inputStyle, minHeight: 86, resize: "vertical" }} />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Any extra information?</label>
            <textarea value={extraInformation} onChange={(event) => setExtraInformation(event.target.value)} placeholder="Context for the team, must-watch phrases, owners, or what should trigger a call." style={{ ...inputStyle, minHeight: 92, resize: "vertical" }} />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Watch type</label>
            <div className="flex flex-wrap gap-2">
              {WATCH_TYPES.map((item) => <button key={item} onClick={() => setWatchType(item)} style={chipStyle(watchType === item)}>{item}</button>)}
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-2" style={{ color: "var(--text-secondary)" }}>What kind of change matters?</label>
            <div className="flex flex-wrap gap-2">
              {CHANGE_TYPES.map((item) => <button key={item} onClick={() => toggleValue(item, changeTypes, setChangeTypes)} style={chipStyle(changeTypes.includes(item))}>{item}</button>)}
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-2" style={{ color: "var(--text-secondary)" }}>What impact matters most?</label>
            <div className="flex flex-wrap gap-2">
              {IMPACT_TYPES.map((item) => <button key={item} onClick={() => toggleValue(item, impactTypes, setImpactTypes)} style={chipStyle(impactTypes.includes(item))}>{item}</button>)}
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-2" style={{ color: "var(--text-secondary)" }}>When should Sentinel interrupt the team?</label>
            <div className="space-y-2">
              {URGENCIES.map((item) => (
                <button key={item.value} onClick={() => setUrgency(item.value)} className="w-full text-left" style={{ padding: "12px 16px", borderRadius: 14, border: urgency === item.value ? "1.5px solid var(--text-primary)" : "1px solid var(--border-soft)", background: urgency === item.value ? "var(--elevated)" : "transparent" }}>
                  <span className="text-[13px] font-medium">{item.label}</span>
                  <span className="text-[12px] ml-2" style={{ color: "var(--text-tertiary)" }}>{item.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Only escalate when</label>
            <div className="space-y-2">
              {[
                { checked: requireSources, setChecked: setRequireSources, label: "2+ sources confirm it" },
                { checked: requirePersistence, setChecked: setRequirePersistence, label: "the change persists across checks" },
                { checked: officialSourcesOnly, setChecked: setOfficialSourcesOnly, label: "it comes from official sources" },
              ].map((item) => (
                <button key={item.label} onClick={() => item.setChecked(!item.checked)} className="w-full flex items-center gap-3 text-left" style={{ padding: "12px 14px", background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: 14 }}>
                  <div className="w-4 h-4 rounded" style={{ background: item.checked ? "var(--text-primary)" : "transparent", border: item.checked ? "1px solid var(--text-primary)" : "1px solid var(--border-soft)" }} />
                  <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Focus the briefing on</label>
            <div className="flex flex-wrap gap-2">
              {BRIEFING_FOCUS.map((item) => <button key={item} onClick={() => toggleValue(item, briefingFocus, setBriefingFocus)} style={chipStyle(briefingFocus.includes(item))}>{item}</button>)}
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Who should be called?</label>
            <div className="space-y-3">
              {members.map((member, index) => (
                <div key={`${member.role}-${index}`} style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 14 }}>
                  <div className="flex justify-between mb-2">
                    <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{member.name || `Member ${index + 1}`}</span>
                    {members.length > 1 ? <button onClick={() => removeMember(index)} className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Remove</button> : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={member.name} onChange={(event) => updateMember(index, "name", event.target.value)} placeholder="Name" style={{ ...inputStyle, padding: "9px 12px", fontSize: 12 }} />
                    <select value={member.role} onChange={(event) => updateMember(index, "role", event.target.value)} style={{ ...inputStyle, padding: "9px 12px", fontSize: 12 }}>
                      {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                    <input value={member.phone} onChange={(event) => updateMember(index, "phone", event.target.value)} placeholder="Phone" style={{ ...inputStyle, padding: "9px 12px", fontSize: 12 }} />
                    <input value={member.email} onChange={(event) => updateMember(index, "email", event.target.value)} placeholder="Email" style={{ ...inputStyle, padding: "9px 12px", fontSize: 12 }} />
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addMember} className="text-[12px] font-medium mt-3" style={{ color: "var(--accent)" }}>+ Add member</button>
          </div>

          {error ? <p className="text-[12px]" style={{ color: "var(--critical)" }}>{error}</p> : null}

          <button onClick={submit} disabled={loading || !topic.trim()} className="w-full py-3 text-[13px] font-medium" style={{ background: loading || !topic.trim() ? "var(--muted)" : "var(--text-primary)", color: loading || !topic.trim() ? "var(--text-tertiary)" : "var(--text-inverse)", borderRadius: "var(--r-button)" }}>
            {loading ? "Creating..." : "Create team watch"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [teams, setTeams] = useState<TeamWorkspace[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("Engineer");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const loadWorkspace = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/teams/workspace`);
      const payload = await response.json();
      const nextTeams = payload.teams || [];
      setTeams(nextTeams);
      setSelectedTeamId((current) => current ?? nextTeams[0]?.team_id ?? null);
    } catch {
      setError("Could not load teams");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("newWatch") !== "team") return;
    params.delete("newWatch");
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl);
    setTimeout(() => setShowCreateModal(true), 0);
  }, [pathname, router]);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.team_id === selectedTeamId) || null,
    [selectedTeamId, teams],
  );

  const addMember = async () => {
    if (!selectedTeam) return;
    if (!newName.trim() || !newPhone.trim()) {
      setError("Name and phone are required");
      return;
    }

    setAdding(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/teams/${selectedTeam.team_id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          role: newRole.toLowerCase(),
          phone: newPhone.trim(),
          email: newEmail.trim() || null,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Failed to add member");
      }
      setNewName("");
      setNewRole("Engineer");
      setNewPhone("");
      setNewEmail("");
      await loadWorkspace();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Failed to add member");
    } finally {
      setAdding(false);
    }
  };

  const inputStyle: CSSProperties = {
    padding: "10px 14px",
    background: "var(--elevated)",
    border: "1px solid var(--border-soft)",
    borderRadius: 12,
    fontSize: 13,
    color: "var(--text-primary)",
    outline: "none",
    width: "100%",
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--canvas)" }}>
      <TeamWatchModal open={showCreateModal} onClose={() => setShowCreateModal(false)} onCreated={loadWorkspace} />
      <div style={{ background: "var(--elevated)", borderBottom: "1px solid var(--border-soft)", padding: "32px 0" }}>
        <div className="px-10 flex items-center justify-between gap-6">
          <div>
            <h1 className="font-semibold mb-1" style={{ fontSize: 22, letterSpacing: "-0.02em" }}>Teams</h1>
            <p className="text-[14px]" style={{ color: "var(--text-tertiary)" }}>
              One signal can alert multiple people with role-specific calls and shared context.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-[13px] font-medium"
              style={{ background: "var(--text-primary)", color: "var(--text-inverse)", borderRadius: "var(--r-button)" }}
            >
              Create team watch
            </button>
          </div>
        </div>
      </div>

      <div className="px-10 py-8">
        {error ? (
          <p className="text-[13px] mb-5" style={{ color: "var(--critical)" }}>{error}</p>
        ) : null}

        {loading ? (
          <p className="text-center py-16" style={{ color: "var(--text-tertiary)" }}>Loading teams...</p>
        ) : teams.length === 0 ? (
          <div className="text-center" style={{ background: "var(--elevated)", border: "1px solid var(--border-soft)", borderRadius: "var(--r-panel)", padding: 80 }}>
            <p className="text-base mb-2" style={{ color: "var(--text-secondary)" }}>No teams yet</p>
            <p className="text-sm mb-6" style={{ color: "var(--text-tertiary)" }}>
              Create a team watch to start managing shared call flows.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-[13px] font-medium"
              style={{ background: "var(--text-primary)", color: "var(--text-inverse)", borderRadius: "var(--r-button)" }}
            >
              Create team watch
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.45fr] gap-6">
            <div className="space-y-3">
                {teams.map((team) => {
                  const active = selectedTeamId === team.team_id;
                  return (
                    <button
                      key={team.team_id}
                      onClick={() => setSelectedTeamId(team.team_id)}
                      className="w-full text-left transition-all"
                      style={{
                        padding: 20,
                        borderRadius: "var(--r-card)",
                        border: active ? "1.5px solid var(--text-primary)" : "1px solid var(--border-soft)",
                        background: active ? "var(--elevated)" : "transparent",
                        boxShadow: active ? "var(--shadow-sm)" : "none",
                      }}
                    >
                      <div className="flex items-center justify-between gap-4 mb-2">
                        <span className="text-[15px] font-medium">{team.team_name}</span>
                        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                          {timeAgo(team.latest_alert_at)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-[11px] font-medium px-3 py-1.5" style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 999, color: "var(--text-secondary)" }}>
                          {team.active_watch_count} active watches
                        </span>
                        <span className="text-[11px] font-medium px-3 py-1.5" style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 999, color: "var(--text-secondary)" }}>
                          {team.member_count} members
                        </span>
                      </div>
                    </button>
                  );
                })}
            </div>

            {selectedTeam ? (
              <div className="space-y-6">
                <div
                  style={{
                    background: "var(--elevated)",
                    border: "1px solid var(--border-soft)",
                    borderRadius: "var(--r-card)",
                    padding: 24,
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
                        Selected team
                      </p>
                      <h2 className="text-[22px] font-semibold" style={{ letterSpacing: "-0.02em" }}>
                        {selectedTeam.team_name}
                      </h2>
                      <p className="text-[13px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                        Latest team activity: {timeAgo(selectedTeam.latest_alert_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-[11px] font-medium px-3 py-1.5" style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 999, color: "var(--text-secondary)" }}>
                        {selectedTeam.watch_count} total watches
                      </span>
                      <span className="text-[11px] font-medium px-3 py-1.5" style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 999, color: "var(--text-secondary)" }}>
                        {selectedTeam.member_count} members
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>
                        Team watches
                      </p>
                      <div className="space-y-3">
                        {selectedTeam.watches.length > 0 ? selectedTeam.watches.map((watch) => (
                          <div
                            key={watch.id}
                            style={{
                              background: "var(--canvas)",
                              border: "1px solid var(--border-soft)",
                              borderRadius: 16,
                              padding: 16,
                            }}
                          >
                            <div className="flex items-center justify-between gap-4 mb-2">
                              <p className="text-[14px] font-medium">{watch.topic}</p>
                              <span
                                className="text-[10px] font-semibold px-3 py-1.5 uppercase tracking-wider"
                                style={{
                                  background: watch.active ? "rgba(95,141,107,0.1)" : "var(--muted)",
                                  color: watch.active ? "var(--success)" : "var(--text-tertiary)",
                                  borderRadius: "var(--r-pill)",
                                }}
                              >
                                {watch.active ? "active" : "stopped"}
                              </span>
                            </div>
                            <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                              Watch #{watch.id} · Every {watch.frequency_minutes}m · threshold ≥{watch.threshold}
                            </p>
                            <p className="text-[12px] mt-2" style={{ color: "var(--text-secondary)" }}>
                              Last alert: {timeAgo(watch.latest_alert_at)}
                            </p>
                          </div>
                        )) : (
                          <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                            No watches linked to this team yet.
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>
                        Team members
                      </p>
                      <div className="space-y-3 mb-5">
                        {selectedTeam.members.length > 0 ? selectedTeam.members.map((member) => {
                          const badge = roleBadge[member.role] || roleBadge.other;
                          return (
                            <div
                              key={member.id}
                              className="flex items-center justify-between gap-4"
                              style={{
                                background: "var(--canvas)",
                                border: "1px solid var(--border-soft)",
                                borderRadius: 16,
                                padding: 16,
                              }}
                            >
                              <div>
                                <p className="text-[14px] font-medium">{member.name}</p>
                                <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                                  {member.phone}{member.email ? ` · ${member.email}` : ""}
                                </p>
                              </div>
                              <span
                                className="text-[10px] font-semibold px-3 py-1.5 uppercase tracking-wider"
                                style={{ background: badge.bg, color: badge.color, borderRadius: "var(--r-pill)" }}
                              >
                                {member.role}
                              </span>
                            </div>
                          );
                        }) : (
                          <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                            No team members yet.
                          </p>
                        )}
                      </div>

                      <div
                        style={{
                          background: "var(--canvas)",
                          border: "1px dashed var(--border-soft)",
                          borderRadius: 16,
                          padding: 18,
                        }}
                      >
                        <p className="text-[13px] font-medium mb-4">Add team member</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                          <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Name" style={inputStyle} />
                          <select value={newRole} onChange={(event) => setNewRole(event.target.value)} style={inputStyle}>
                            {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                          </select>
                          <input value={newPhone} onChange={(event) => setNewPhone(event.target.value)} placeholder="Phone" style={inputStyle} />
                          <input value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="Email (optional)" style={inputStyle} />
                        </div>
                        <button
                          onClick={addMember}
                          disabled={adding}
                          className="px-5 py-2.5 text-[13px] font-medium"
                          style={{ background: "var(--text-primary)", color: "var(--text-inverse)", borderRadius: "var(--r-button)" }}
                        >
                          {adding ? "Adding..." : "Add member"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
