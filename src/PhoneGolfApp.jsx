import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Flag, Trophy, Plus, Minus, Users, Calendar, ChevronRight,
  ChevronLeft, Trash2, X, Edit3, Settings, Share2, RotateCcw,
  Home, ClipboardList, Download, Circle, Target, Sparkles,
  Lock, Unlock, Check, AlertCircle, Maximize2,
} from "lucide-react";
import * as htmlToImage from "html-to-image";

/* ---------------------------------------------------------------------------
 *  PHONE GOLF — a golf-themed phone-habits prototype (v1.1)
 *  Single-file React artifact. Persistent storage via window.storage.
 *
 *  Changelog vs v1.0
 *   • Real PNG export via dynamically-loaded html-to-image
 *   • Par can be LOCKED to a group baseline (day-1 scores) or ROLLING per day
 *   • Leaderboard has an intro title-card phase → dramatic drops → winner glow
 *   • Contrast pass across all faint-text elements for readability
 *   • Member rename + a handful of QA fixes
 * ------------------------------------------------------------------------- */

// ─── Fonts + keyframes ────────────────────────────────────────────────────
const StyleTag = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700;9..144,900&family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

    .font-display { font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; }
    .font-body    { font-family: 'Instrument Sans', system-ui, sans-serif; }
    .font-mono    { font-family: 'JetBrains Mono', ui-monospace, monospace; }

    @keyframes dropIn {
      0%   { opacity: 0; transform: translateY(-60px) scale(0.94); }
      55%  { opacity: 1; transform: translateY(10px) scale(1.01); }
      75%  { transform: translateY(-3px) scale(1); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes fadeUp {
      0%   { opacity: 0; transform: translateY(10px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes shimmer {
      0%, 100% { opacity: 0.55; }
      50%      { opacity: 1; }
    }
    @keyframes winnerGlow {
      0%, 100% { box-shadow: 0 0 0 2px rgba(212,162,76,0.6), 0 0 40px 4px rgba(212,162,76,0.35); }
      50%      { box-shadow: 0 0 0 3px rgba(212,162,76,0.95), 0 0 60px 10px rgba(212,162,76,0.55); }
    }
    @keyframes introIn {
      0%   { opacity: 0; letter-spacing: 0.5em; }
      100% { opacity: 1; letter-spacing: 0; }
    }

    .drop-in        { animation: dropIn 0.85s cubic-bezier(0.2, 0.85, 0.3, 1.25) both; }
    .fade-up        { animation: fadeUp 0.5s ease-out both; }
    .shimmer        { animation: shimmer 2s ease-in-out infinite; }
    .winner-glow    { animation: winnerGlow 2.5s ease-in-out infinite; }
    .intro-in       { animation: introIn 0.9s cubic-bezier(0.2, 0.9, 0.3, 1) both; }

    /* cream paper texture via layered gradients */
    .paper {
      background:
        radial-gradient(ellipse at top left, rgba(212,162,76,0.07), transparent 55%),
        radial-gradient(ellipse at bottom right, rgba(26,77,58,0.06), transparent 55%),
        #f8f4e9;
    }
    .fairway {
      background:
        radial-gradient(ellipse at top, rgba(255,255,255,0.04), transparent 60%),
        radial-gradient(circle at 20% 80%, rgba(212,162,76,0.09), transparent 50%),
        linear-gradient(180deg, #0f2a1f 0%, #1a4d3a 50%, #0f2a1f 100%);
    }
    .stage {
      background:
        radial-gradient(ellipse at center, #0f2a1f 0%, #05130e 80%);
    }
    .divider-dots {
      background-image: radial-gradient(circle, #1a4d3a 1.2px, transparent 1.4px);
      background-size: 8px 8px;
      background-repeat: repeat-x;
      background-position: center;
    }
    .hairline { border-color: rgba(15,31,26,0.18); }

    input[type=number]::-webkit-outer-spin-button,
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    input[type=number] { -moz-appearance: textfield; }
  `}</style>
);

// ─── Constants ────────────────────────────────────────────────────────────
const PENALTIES = [
  { key: "sandTraps",   label: "Sand Traps",          sub: "Doomscrolling sessions",            per: 1, unit: "per session" },
  { key: "wrongClub",   label: "Wrong Club",          sub: "Social media first on open",        per: 1, unit: "per occurrence" },
  { key: "badSwing",    label: "Bad Swing Etiquette", sub: "Opens from a social notification",  per: 1, unit: "+1 per 5", divisor: 5 },
  { key: "waterHazard", label: "Water Hazard",        sub: "Post-midnight scrolling",           per: 2, unit: "+2 each" },
  { key: "outOfBounds", label: "Out of Bounds",       sub: "Over daily screen-time goal",       per: 3, unit: "once, +3" },
];

const GOOD_SHOTS = [
  { key: "rangeMinutes",   label: "Range Session",  sub: "Minutes on productivity / wellness apps", per: 1, unit: "−1 per 30 min", divisor: 30 },
  { key: "phoneFreeMeals", label: "Fairway Drive",  sub: "Phone-free meals",                        per: 1, unit: "−1 each" },
  { key: "cleanMorning",   label: "Clean Tee Time", sub: "No phone in first 30 min of morning",     per: 2, unit: "−2 (once)" },
  { key: "eagleFocus",     label: "Eagle Focus",    sub: "1hr+ uninterrupted focus sessions",       per: 2, unit: "−2 each" },
];

const EMPTY_STATS = {
  sandTraps: 0, wrongClub: 0, badSwing: 0, waterHazard: 0, outOfBounds: 0,
  rangeMinutes: 0, phoneFreeMeals: 0, cleanMorning: 0, eagleFocus: 0,
};

// ─── Scoring ──────────────────────────────────────────────────────────────
function calcPenaltyStrokes(s = EMPTY_STATS) {
  return (
    (s.sandTraps   || 0) * 1 +
    (s.wrongClub   || 0) * 1 +
    Math.floor((s.badSwing || 0) / 5) * 1 +
    (s.waterHazard || 0) * 2 +
    (s.outOfBounds || 0) * 3
  );
}
function calcGoodStrokes(s = EMPTY_STATS) {
  return (
    Math.floor((s.rangeMinutes || 0) / 30) * 1 +
    (s.phoneFreeMeals || 0) * 1 +
    (s.cleanMorning   ? 1 : 0) * 2 +
    (s.eagleFocus     || 0) * 2
  );
}
function calcScore(s) { return calcPenaltyStrokes(s) - calcGoodStrokes(s); }

function rawPar(scores, goalOffset = 4) {
  if (!scores.length) return 0;
  const avg = scores.reduce((a,b) => a+b, 0) / scores.length;
  return Math.round(avg) - goalOffset;
}
function toParLabel(n) {
  if (n === 0) return "E";
  if (n > 0)   return `+${n}`;
  return `${n}`;
}

// Baseline helpers
function dayHasAnyData(day) {
  if (!day) return false;
  return Object.values(day).some(stats =>
    Object.values(stats).some(v => v && v !== 0)
  );
}
function getBaselineDate(group) {
  const days = group.days || {};
  const candidates = Object.keys(days).filter(d => dayHasAnyData(days[d])).sort();
  return candidates[0] || null;
}
function getParForDate(group, date, goalOffset) {
  const mode = group.parMode || "baseline";
  if (mode === "baseline") {
    const baseline = getBaselineDate(group);
    if (!baseline) return 0;
    const baseScores = (group.members || []).map(m =>
      calcScore(group.days?.[baseline]?.[m.id] || EMPTY_STATS)
    );
    return rawPar(baseScores, goalOffset);
  }
  const scores = (group.members || []).map(m =>
    calcScore(group.days?.[date]?.[m.id] || EMPTY_STATS)
  );
  return rawPar(scores, goalOffset);
}
function getRoundNumber(group, date) {
  const days = Object.keys(group.days || {}).filter(d => dayHasAnyData(group.days[d])).sort();
  const idx = days.indexOf(date);
  if (idx >= 0) return idx + 1;
  return days.filter(d => d < date).length + 1;
}

// ─── Storage ──────────────────────────────────────────────────────────────
const STORE_KEY = "phonegolf:v1";
async function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn("load failed", e); }
  return null;
}
async function saveState(state) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { console.error("save failed", e); }
}

// ─── html-to-image (imported as a real module in this build) ─────────────
function useHtmlToImage() {
  return { lib: htmlToImage, failed: false };
}

async function exportNodeToPng(lib, node, filename, bgColor = "#0f2a1f") {
  if (!lib || !node) return;
  try {
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch {} }
    const dataUrl = await lib.toPng(node, {
      pixelRatio: 2.5,
      backgroundColor: bgColor,
      cacheBust: true,
      style: { transform: "none" },
    });
    const link = document.createElement("a");
    link.download = filename;
    link.href = dataUrl;
    link.click();
  } catch (err) {
    console.error("Export failed:", err);
    alert("Couldn't export the image. Try again or screenshot the card.");
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const todayKey = () => new Date().toISOString().slice(0, 10);
function formatDate(key) {
  const d = new Date(key + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
function formatDateShort(key) {
  const d = new Date(key + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function shiftDate(key, delta) {
  const d = new Date(key + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

const INITIALS = (name) =>
  (name || "").split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");

const slug = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unnamed";

// ─── Small UI atoms ───────────────────────────────────────────────────────
const Chip = ({ children, tone = "fairway" }) => {
  const tones = {
    fairway: "bg-[#1a4d3a] text-[#f8f4e9]",
    gold:    "bg-[#d4a24c] text-[#0f1f1a]",
    cream:   "bg-[#f8f4e9] text-[#1a4d3a] border hairline",
    red:     "bg-[#b84226] text-[#f8f4e9]",
  };
  return (
    <span className={`font-body uppercase tracking-[0.14em] text-[10px] px-2.5 py-1 rounded-full font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
};

const IconBtn = ({ onClick, children, title, className = "" }) => (
  <button
    onClick={onClick} title={title}
    className={`h-10 w-10 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${className}`}
  >
    {children}
  </button>
);

const Button = ({ onClick, children, variant = "primary", className = "", disabled }) => {
  const variants = {
    primary:      "bg-[#1a4d3a] text-[#f8f4e9] hover:bg-[#2d6b4f]",
    gold:         "bg-[#d4a24c] text-[#0f1f1a] hover:brightness-95",
    outline:      "bg-transparent text-[#0f1f1a] border border-[#0f1f1a]/40 hover:bg-[#0f1f1a]/5",
    outlineLight: "bg-transparent text-[#f8f4e9] border border-[#f8f4e9]/40 hover:bg-white/10",
    ghost:        "bg-transparent text-[#f8f4e9] hover:bg-white/10",
    dark:         "bg-[#0f1f1a] text-[#f8f4e9] hover:bg-[#1a4d3a]",
  };
  return (
    <button
      onClick={onClick} disabled={disabled}
      className={`font-body font-bold uppercase tracking-[0.14em] text-xs px-5 py-3 rounded-full transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

// =============================================================================
//  MAIN APP
// =============================================================================
export default function PhoneGolfApp() {
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("home");
  const [groups, setGroups] = useState({});
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [activeDate, setActiveDate] = useState(todayKey());
  const [activeMemberId, setActiveMemberId] = useState(null);
  const [goalOffset, setGoalOffset] = useState(4);

  const { lib: h2iLib, failed: h2iFailed } = useHtmlToImage();

  useEffect(() => {
    (async () => {
      const s = await loadState();
      if (s) {
        setGroups(s.groups || {});
        setActiveGroupId(s.activeGroupId || null);
        setGoalOffset(s.goalOffset ?? 4);
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveState({ groups, activeGroupId, goalOffset });
  }, [groups, activeGroupId, goalOffset, loaded]);

  // ─── Mutations ──
  const createGroup = (name) => {
    const id = uid();
    setGroups(g => ({
      ...g,
      [id]: { id, name, createdAt: Date.now(), members: [], days: {}, parMode: "baseline" },
    }));
    setActiveGroupId(id);
    setView("facilitator");
  };
  const deleteGroup = (id) => {
    setGroups(g => { const n = { ...g }; delete n[id]; return n; });
    if (activeGroupId === id) setActiveGroupId(null);
  };
  const setParMode = (groupId, mode) => {
    setGroups(g => ({ ...g, [groupId]: { ...g[groupId], parMode: mode } }));
  };
  const addMember = (groupId, name) => {
    if (!name.trim()) return;
    setGroups(g => ({
      ...g,
      [groupId]: {
        ...g[groupId],
        members: [...g[groupId].members, { id: uid(), name: name.trim() }],
      },
    }));
  };
  const renameMember = (groupId, memberId, newName) => {
    if (!newName.trim()) return;
    setGroups(g => ({
      ...g,
      [groupId]: {
        ...g[groupId],
        members: g[groupId].members.map(m => m.id === memberId ? { ...m, name: newName.trim() } : m),
      },
    }));
  };
  const removeMember = (groupId, memberId) => {
    setGroups(g => ({
      ...g,
      [groupId]: { ...g[groupId], members: g[groupId].members.filter(m => m.id !== memberId) },
    }));
  };
  const updateStats = (groupId, date, memberId, patch) => {
    setGroups(g => {
      const grp = g[groupId];
      const day = grp.days?.[date] || {};
      const current = day[memberId] || { ...EMPTY_STATS };
      const next = { ...current, ...patch };
      return {
        ...g,
        [groupId]: { ...grp, days: { ...grp.days, [date]: { ...day, [memberId]: next } } },
      };
    });
  };

  if (!loaded) {
    return (
      <div className="min-h-screen fairway flex items-center justify-center font-display text-[#f8f4e9]">
        <StyleTag />
        <div className="text-xl shimmer tracking-[0.25em]">LOADING…</div>
      </div>
    );
  }

  const activeGroup = activeGroupId ? groups[activeGroupId] : null;

  return (
    <div className="min-h-screen fairway font-body text-[#f8f4e9] relative overflow-x-hidden">
      <StyleTag />

      <TopBar
        view={view} setView={setView}
        groupName={activeGroup?.name}
        hasGroup={!!activeGroup}
      />

      <div className="relative z-10 px-6 md:px-10 pb-24">
        {view === "home" && (
          <HomeView
            groups={groups}
            onOpen={(id) => { setActiveGroupId(id); setView("facilitator"); }}
            onCreate={createGroup}
            onDelete={deleteGroup}
          />
        )}

        {view === "facilitator" && activeGroup && (
          <FacilitatorView
            group={activeGroup}
            date={activeDate} setDate={setActiveDate}
            goalOffset={goalOffset} setGoalOffset={setGoalOffset}
            setParMode={(m) => setParMode(activeGroup.id, m)}
            addMember={(n) => addMember(activeGroup.id, n)}
            renameMember={(mid, n) => renameMember(activeGroup.id, mid, n)}
            removeMember={(mid) => removeMember(activeGroup.id, mid)}
            updateStats={(mid, patch) => updateStats(activeGroup.id, activeDate, mid, patch)}
            onPresentScorecard={(mid) => { setActiveMemberId(mid); setView("scorecard"); }}
            onPresentLeaderboard={() => setView("leaderboard")}
          />
        )}

        {view === "scorecard" && activeGroup && activeMemberId && (
          <ScorecardView
            group={activeGroup}
            memberId={activeMemberId}
            date={activeDate}
            goalOffset={goalOffset}
            h2iLib={h2iLib}
            h2iFailed={h2iFailed}
            onBack={() => setView("facilitator")}
          />
        )}

        {view === "leaderboard" && activeGroup && (
          <LeaderboardView
            group={activeGroup}
            date={activeDate}
            goalOffset={goalOffset}
            h2iLib={h2iLib}
            h2iFailed={h2iFailed}
            onBack={() => setView("facilitator")}
          />
        )}

        {view !== "home" && !activeGroup && (
          <div className="text-center py-20 font-display text-3xl">No group selected.</div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
//  TOP BAR
// =============================================================================
function TopBar({ view, setView, groupName, hasGroup }) {
  return (
    <div className="relative z-20 px-6 md:px-10 pt-8 pb-6">
      <div className="flex items-center justify-between gap-4">
        <button onClick={() => setView("home")} className="flex items-center gap-3 group">
          <div className="h-11 w-11 rounded-full bg-[#d4a24c] flex items-center justify-center shadow-lg">
            <Flag className="w-5 h-5 text-[#0f1f1a]" strokeWidth={2.5} />
          </div>
          <div className="text-left">
            <div className="font-display text-2xl leading-none tracking-tight italic text-[#f8f4e9]">Phone Golf</div>
            <div className="font-body text-[10px] uppercase tracking-[0.22em] text-[#d4a24c] mt-1 font-bold">
              Habit Club · Est. 2026
            </div>
          </div>
        </button>

        {hasGroup && groupName && (
          <div className="hidden md:flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[#f8f4e9]/85 font-semibold">
            <Users className="w-3.5 h-3.5" />
            <span>{groupName}</span>
          </div>
        )}

        <nav className="flex items-center gap-1">
          <NavTab active={view==="home"} onClick={() => setView("home")} icon={<Home className="w-4 h-4"/>} label="Groups"/>
          {hasGroup && (
            <NavTab active={view==="facilitator"} onClick={() => setView("facilitator")} icon={<ClipboardList className="w-4 h-4"/>} label="Enter"/>
          )}
        </nav>
      </div>
      <div className="mt-6 h-px bg-gradient-to-r from-transparent via-[#d4a24c]/50 to-transparent" />
    </div>
  );
}

const NavTab = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-full flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] font-bold transition-all
      ${active ? "bg-[#d4a24c] text-[#0f1f1a]" : "text-[#f8f4e9]/85 hover:text-[#f8f4e9] hover:bg-white/5"}`}
  >
    {icon}{label}
  </button>
);

// =============================================================================
//  HOME VIEW
// =============================================================================
function HomeView({ groups, onOpen, onCreate, onDelete }) {
  const [newName, setNewName] = useState("");
  const groupList = Object.values(groups).sort((a,b) => b.createdAt - a.createdAt);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Hero */}
      <div className="mt-8 mb-14 fade-up">
        <div className="text-[#d4a24c] font-body text-[11px] uppercase tracking-[0.28em] mb-4 font-bold">
          A prototype · Facilitator control panel
        </div>
        <h1 className="font-display text-6xl md:text-7xl leading-[0.95] tracking-tight text-[#f8f4e9]">
          Play your <em className="text-[#d4a24c]">phone</em><br/>
          like it's a <em>course.</em>
        </h1>
        <p className="font-display text-lg md:text-xl text-[#f8f4e9]/90 mt-6 max-w-2xl leading-relaxed">
          A week-long, socially-accountable experiment in retraining phone use.
          Log each member's shots. Watch the leaderboard drop at morning circle.
        </p>
      </div>

      {/* Create group card */}
      <div className="paper rounded-3xl p-8 text-[#0f1f1a] shadow-2xl mb-10 fade-up" style={{animationDelay:"0.1s"}}>
        <div className="flex items-start gap-3 mb-5">
          <div className="h-10 w-10 rounded-full bg-[#1a4d3a] flex items-center justify-center shrink-0">
            <Plus className="w-5 h-5 text-[#f8f4e9]"/>
          </div>
          <div>
            <div className="font-display text-2xl italic">New clubhouse</div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-[#1a4d3a]/80 mt-1 font-bold">Start a new group</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && newName.trim()) { onCreate(newName.trim()); setNewName(""); }}}
            placeholder="e.g. Monday Morning Sunrise"
            className="flex-1 min-w-[240px] bg-transparent border-b-2 border-[#1a4d3a]/40 focus:border-[#1a4d3a] outline-none font-display italic text-xl py-2 placeholder:text-[#1a4d3a]/55 text-[#0f1f1a]"
          />
          <Button
            variant="primary"
            onClick={() => { if (newName.trim()) { onCreate(newName.trim()); setNewName(""); } }}
          >
            Tee off
          </Button>
        </div>
      </div>

      {/* Group list */}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <div className="text-[#d4a24c] text-[11px] uppercase tracking-[0.22em] font-bold">Your groups</div>
          <div className="font-display text-3xl italic text-[#f8f4e9]">The locker room</div>
        </div>
        <div className="text-[11px] text-[#f8f4e9]/80 font-mono">{groupList.length} {groupList.length === 1 ? "group" : "groups"}</div>
      </div>

      {groupList.length === 0 ? (
        <div className="text-center py-16 text-[#f8f4e9]/80 font-display italic text-xl">
          No groups yet. Open a new clubhouse above.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          {groupList.map((g, i) => {
            const days = Object.keys(g.days || {}).filter(d => dayHasAnyData(g.days[d])).length;
            return (
              <div
                key={g.id}
                className="paper text-[#0f1f1a] rounded-3xl p-7 shadow-xl relative overflow-hidden cursor-pointer hover:-translate-y-1 transition-transform fade-up"
                style={{ animationDelay: `${0.15 + i*0.06}s` }}
                onClick={() => onOpen(g.id)}
              >
                <div className="absolute -right-6 -top-6 text-[#1a4d3a]/5 pointer-events-none">
                  <Flag className="w-48 h-48" strokeWidth={1}/>
                </div>
                <div className="relative">
                  <Chip tone="fairway">Group</Chip>
                  <div className="font-display text-3xl italic mt-3 mb-1 leading-tight">{g.name}</div>
                  <div className="font-body text-sm text-[#1a4d3a]/90">
                    {g.members.length} {g.members.length === 1 ? "player" : "players"} · {days} {days === 1 ? "round" : "rounds"}
                    {g.parMode === "rolling" && <> · rolling par</>}
                  </div>
                  <div className="mt-6 flex items-center justify-between">
                    <Button variant="primary" onClick={(e) => { e.stopPropagation(); onOpen(g.id); }}>
                      Open <ChevronRight className="inline w-3.5 h-3.5 ml-1"/>
                    </Button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${g.name}"? This clears all rounds.`)) onDelete(g.id);
                      }}
                      className="text-[#1a4d3a]/65 hover:text-[#b84226] transition-colors p-2"
                      title="Delete group"
                    >
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Footer/>
    </div>
  );
}

// =============================================================================
//  FACILITATOR VIEW
// =============================================================================
function FacilitatorView({
  group, date, setDate, goalOffset, setGoalOffset, setParMode,
  addMember, renameMember, removeMember, updateStats,
  onPresentScorecard, onPresentLeaderboard,
}) {
  const [newMemberName, setNewMemberName] = useState("");
  const [expandedMember, setExpandedMember] = useState(null);
  const [editingName, setEditingName] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  const par = getParForDate(group, date, goalOffset);
  const dayStats = group.days?.[date] || {};
  const baselineDate = getBaselineDate(group);
  const roundNum = getRoundNumber(group, date);
  const parMode = group.parMode || "baseline";

  const startEdit = (m) => { setEditingName(m.id); setEditingValue(m.name); };
  const saveEdit = (mid) => {
    if (editingValue.trim()) renameMember(mid, editingValue);
    setEditingName(null);
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mt-4 mb-8 fade-up flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="text-[#d4a24c] text-[11px] uppercase tracking-[0.22em] font-bold mb-2">
            Facilitator panel · Round {roundNum}
          </div>
          <div className="font-display text-5xl italic leading-none text-[#f8f4e9]">{group.name}</div>
          <div className="font-body text-sm text-[#f8f4e9]/90 mt-3">
            {group.members.length} {group.members.length === 1 ? "player" : "players"} · Round for {formatDate(date)}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outlineLight"
            onClick={onPresentLeaderboard}
            disabled={group.members.length === 0}
          >
            <Trophy className="inline w-4 h-4 mr-2"/>Present leaderboard
          </Button>
        </div>
      </div>

      {/* Date navigator + par */}
      <div className="paper text-[#0f1f1a] rounded-3xl p-6 mb-6 flex flex-wrap items-center gap-6 fade-up" style={{animationDelay:"0.05s"}}>
        <div className="flex items-center gap-2">
          <IconBtn onClick={() => setDate(shiftDate(date, -1))} title="Previous day" className="bg-[#1a4d3a] text-[#f8f4e9] hover:bg-[#2d6b4f]">
            <ChevronLeft className="w-5 h-5"/>
          </IconBtn>
          <div className="px-3 min-w-[200px] text-center">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#1a4d3a]/80 font-bold">Round date</div>
            <div className="font-display text-xl italic">{formatDate(date)}</div>
          </div>
          <IconBtn onClick={() => setDate(shiftDate(date, 1))} title="Next day" className="bg-[#1a4d3a] text-[#f8f4e9] hover:bg-[#2d6b4f]">
            <ChevronRight className="w-5 h-5"/>
          </IconBtn>
          <button onClick={() => setDate(todayKey())} className="ml-2 text-[11px] uppercase tracking-[0.16em] font-bold text-[#1a4d3a]/90 hover:text-[#1a4d3a]">
            Today
          </button>
        </div>

        <div className="flex-1 min-w-[240px] flex items-center gap-6 justify-end">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#1a4d3a]/80 font-bold">Today's par</div>
            <div className="font-display text-4xl italic leading-none mt-1">{par}</div>
          </div>
          <div className="h-12 w-px bg-[#1a4d3a]/25"/>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#1a4d3a]/80 font-bold">Goal offset</div>
            <div className="flex items-center gap-2 justify-end mt-1">
              <button onClick={() => setGoalOffset(Math.max(0, goalOffset - 1))} className="h-7 w-7 rounded-full bg-[#1a4d3a]/15 hover:bg-[#1a4d3a]/25 flex items-center justify-center">
                <Minus className="w-3 h-3"/>
              </button>
              <span className="font-mono text-lg w-8 text-center font-bold">−{goalOffset}</span>
              <button onClick={() => setGoalOffset(goalOffset + 1)} className="h-7 w-7 rounded-full bg-[#1a4d3a]/15 hover:bg-[#1a4d3a]/25 flex items-center justify-center">
                <Plus className="w-3 h-3"/>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Par mode toggle */}
      <div className="paper text-[#0f1f1a] rounded-3xl p-6 mb-8 fade-up" style={{animationDelay:"0.08s"}}>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-[260px]">
            <div className="h-10 w-10 rounded-full bg-[#1a4d3a] flex items-center justify-center shrink-0">
              {parMode === "baseline"
                ? <Lock className="w-4 h-4 text-[#d4a24c]"/>
                : <Unlock className="w-4 h-4 text-[#f8f4e9]"/>}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#1a4d3a]/80 font-bold">Par mode</div>
              <div className="font-display text-xl italic leading-tight">
                {parMode === "baseline" ? "Locked to Round 1 baseline" : "Rolling (recalculated daily)"}
              </div>
              <div className="text-[12px] text-[#1a4d3a]/90 mt-1 max-w-md leading-snug">
                {parMode === "baseline"
                  ? <>Par is fixed from Round 1's scores so improvements across the week actually show. {baselineDate ? <span className="font-mono font-semibold">(Baseline: {formatDateShort(baselineDate)})</span> : <span className="italic">Baseline will set when Round 1 data is entered.</span>}</>
                  : <>Par recalculates from each day's average, minus the goal offset. The bar moves with the group.</>}
              </div>
            </div>
          </div>
          <div className="flex items-center bg-[#1a4d3a]/10 rounded-full p-1 gap-1">
            <button
              onClick={() => setParMode("baseline")}
              className={`px-4 py-2 rounded-full text-[11px] uppercase tracking-[0.14em] font-bold transition-all ${parMode === "baseline" ? "bg-[#1a4d3a] text-[#f8f4e9]" : "text-[#1a4d3a]/80 hover:text-[#1a4d3a]"}`}
            >
              <Lock className="inline w-3 h-3 mr-1.5"/>Baseline
            </button>
            <button
              onClick={() => setParMode("rolling")}
              className={`px-4 py-2 rounded-full text-[11px] uppercase tracking-[0.14em] font-bold transition-all ${parMode === "rolling" ? "bg-[#1a4d3a] text-[#f8f4e9]" : "text-[#1a4d3a]/80 hover:text-[#1a4d3a]"}`}
            >
              <Unlock className="inline w-3 h-3 mr-1.5"/>Rolling
            </button>
          </div>
        </div>
      </div>

      {/* Add member */}
      <div className="mb-6 fade-up" style={{animationDelay:"0.1s"}}>
        <div className="flex gap-3 items-center flex-wrap">
          <input
            value={newMemberName} onChange={e => setNewMemberName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && newMemberName.trim()) { addMember(newMemberName); setNewMemberName(""); }}}
            placeholder="Add a player…"
            className="flex-1 min-w-[240px] bg-white/10 border border-white/25 focus:border-[#d4a24c] outline-none font-display italic text-lg py-3 px-5 rounded-full placeholder:text-[#f8f4e9]/55 text-[#f8f4e9]"
          />
          <Button variant="gold" onClick={() => { if (newMemberName.trim()) { addMember(newMemberName); setNewMemberName(""); }}}>
            <Plus className="inline w-4 h-4 mr-1"/> Add
          </Button>
        </div>
      </div>

      {/* Members list */}
      {group.members.length === 0 ? (
        <div className="text-center py-20 text-[#f8f4e9]/80 font-display italic text-xl">
          No players yet. Add someone above to begin.
        </div>
      ) : (
        <div className="space-y-3">
          {group.members.map((m, i) => {
            const stats = dayStats[m.id] || EMPTY_STATS;
            const score = calcScore(stats);
            const toPar = score - par;
            const expanded = expandedMember === m.id;
            const isEditing = editingName === m.id;
            return (
              <div key={m.id} className="paper text-[#0f1f1a] rounded-3xl shadow-xl overflow-hidden fade-up" style={{animationDelay:`${0.12 + i*0.04}s`}}>
                {/* Row summary */}
                <div className="p-5 flex items-center gap-5">
                  <div className="h-14 w-14 rounded-full bg-[#1a4d3a] text-[#f8f4e9] flex items-center justify-center font-display text-xl italic shrink-0">
                    {INITIALS(m.name) || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editingValue}
                        onChange={e => setEditingValue(e.target.value)}
                        onBlur={() => saveEdit(m.id)}
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(m.id); if (e.key === "Escape") setEditingName(null); }}
                        className="font-display text-2xl italic bg-transparent outline-none border-b-2 border-[#1a4d3a]/40 w-full text-[#0f1f1a]"
                      />
                    ) : (
                      <div className="font-display text-2xl italic truncate cursor-text" onDoubleClick={() => startEdit(m)}>
                        {m.name}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-xs text-[#1a4d3a]/90 font-body">
                      <span>Score <b className="font-mono">{score}</b></span>
                      <span>·</span>
                      <span className={`font-mono font-bold ${toPar < 0 ? "text-[#1a4d3a]" : toPar > 0 ? "text-[#b84226]" : "text-[#0f1f1a]"}`}>
                        {toParLabel(toPar)} to par
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => onPresentScorecard(m.id)} className="hidden sm:inline-flex">
                      <Share2 className="inline w-3.5 h-3.5 mr-1.5"/>Card
                    </Button>
                    <IconBtn onClick={() => startEdit(m)} className="bg-[#1a4d3a]/10 hover:bg-[#1a4d3a]/20" title="Rename">
                      <Edit3 className="w-4 h-4"/>
                    </IconBtn>
                    <IconBtn
                      onClick={() => setExpandedMember(expanded ? null : m.id)}
                      className={`${expanded ? "bg-[#1a4d3a] text-[#f8f4e9]" : "bg-[#1a4d3a]/10 hover:bg-[#1a4d3a]/20"}`}
                      title={expanded ? "Collapse" : "Expand"}
                    >
                      {expanded ? <X className="w-4 h-4"/> : <ChevronRight className="w-4 h-4"/>}
                    </IconBtn>
                    <IconBtn
                      onClick={() => { if (confirm(`Remove ${m.name}?`)) removeMember(m.id); }}
                      className="hover:bg-[#b84226]/15 text-[#b84226]/85 hover:text-[#b84226]"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4"/>
                    </IconBtn>
                  </div>
                </div>

                {/* Expanded data entry */}
                {expanded && (
                  <div className="border-t hairline px-5 py-6 bg-[#f3ecd9]/60">
                    <div className="grid md:grid-cols-2 gap-8">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#b84226] mb-3">
                          Penalty shots
                        </div>
                        <div className="space-y-2">
                          {PENALTIES.map(p => (
                            <CounterRow
                              key={p.key} meta={p} value={stats[p.key] || 0} tone="red"
                              onChange={(v) => updateStats(m.id, { [p.key]: v })}
                              binary={p.key === "outOfBounds"}
                            />
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#1a4d3a] mb-3">
                          Good shots
                        </div>
                        <div className="space-y-2">
                          {GOOD_SHOTS.map(p => (
                            <CounterRow
                              key={p.key} meta={p} value={stats[p.key] || 0} tone="fairway"
                              onChange={(v) => updateStats(m.id, { [p.key]: v })}
                              binary={p.key === "cleanMorning"}
                              steppedInput={p.key === "rangeMinutes"}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 pt-5 border-t hairline flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-6 text-sm">
                        <div>
                          <span className="text-[#1a4d3a]/80 uppercase tracking-wide text-[10px] block font-bold">Penalty</span>
                          <b className="font-mono text-[#b84226] text-lg">+{calcPenaltyStrokes(stats)}</b>
                        </div>
                        <div>
                          <span className="text-[#1a4d3a]/80 uppercase tracking-wide text-[10px] block font-bold">Good</span>
                          <b className="font-mono text-[#1a4d3a] text-lg">−{calcGoodStrokes(stats)}</b>
                        </div>
                        <div>
                          <span className="text-[#1a4d3a]/80 uppercase tracking-wide text-[10px] block font-bold">Score</span>
                          <b className="font-mono text-2xl">{score}</b>
                        </div>
                      </div>
                      <Button variant="primary" onClick={() => onPresentScorecard(m.id)}>
                        Present card <ChevronRight className="inline w-3.5 h-3.5 ml-1"/>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Footer/>
    </div>
  );
}

// Counter row used in data entry
function CounterRow({ meta, value, onChange, tone, binary = false, steppedInput = false }) {
  const accent = tone === "red" ? "#b84226" : "#1a4d3a";
  if (binary) {
    return (
      <label className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/55 hover:bg-white/80 cursor-pointer transition-colors">
        <input
          type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked ? 1 : 0)}
          className="h-5 w-5 accent-[#1a4d3a]"
        />
        <div className="flex-1 min-w-0">
          <div className="font-display italic text-base leading-tight">{meta.label}</div>
          <div className="text-[11px] text-[#1a4d3a]/90 truncate">{meta.sub}</div>
        </div>
        <div className="text-[10px] font-mono uppercase tracking-wide font-bold whitespace-nowrap" style={{color:accent}}>{meta.unit}</div>
      </label>
    );
  }
  const step = steppedInput ? 30 : 1;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/55 hover:bg-white/80 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="font-display italic text-base leading-tight truncate">{meta.label}</div>
        <div className="text-[11px] text-[#1a4d3a]/90 truncate">{meta.sub}</div>
      </div>
      <div className="text-[10px] font-mono uppercase tracking-wide font-bold whitespace-nowrap" style={{color:accent}}>{meta.unit}</div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onChange(Math.max(0, value - step))} className="h-7 w-7 rounded-full bg-[#1a4d3a]/15 hover:bg-[#1a4d3a]/25 flex items-center justify-center">
          <Minus className="w-3 h-3"/>
        </button>
        <input
          type="number" value={value}
          onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-12 text-center font-mono font-bold bg-transparent outline-none text-[#0f1f1a]"
        />
        <button onClick={() => onChange(value + step)} className="h-7 w-7 rounded-full bg-[#1a4d3a]/15 hover:bg-[#1a4d3a]/25 flex items-center justify-center">
          <Plus className="w-3 h-3"/>
        </button>
      </div>
    </div>
  );
}

// ─── Reusable export toolbar ──────────────────────────────────────────────
function ExportBar({ h2iLib, h2iFailed, onDownload, exportLabel = "Download PNG" }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
      <Button
        variant="gold"
        onClick={onDownload}
        disabled={!h2iLib}
      >
        <Download className="inline w-4 h-4 mr-2"/>
        {h2iLib ? exportLabel : h2iFailed ? "Export unavailable" : "Loading exporter…"}
      </Button>
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#f8f4e9]/80 font-semibold">
        or screenshot to share
      </div>
    </div>
  );
}

// =============================================================================
//  SCORECARD VIEW
// =============================================================================
function ScorecardView({ group, memberId, date, goalOffset, h2iLib, h2iFailed, onBack }) {
  const cardRef = useRef(null);
  const member = group.members.find(m => m.id === memberId);
  const stats = group.days?.[date]?.[memberId] || EMPTY_STATS;

  const par = getParForDate(group, date, goalOffset);
  const allScores = group.members.map(m => calcScore(group.days?.[date]?.[m.id] || EMPTY_STATS));
  const score = calcScore(stats);
  const toPar = score - par;
  const parMode = group.parMode || "baseline";

  const penaltyRows = PENALTIES.map(p => {
    const v = stats[p.key] || 0;
    const strokes = p.divisor ? Math.floor(v / p.divisor) * p.per : v * p.per;
    return { ...p, v, strokes };
  }).filter(r => r.v > 0);

  const goodRows = GOOD_SHOTS.map(p => {
    const v = stats[p.key] || 0;
    let strokes;
    if (p.key === "cleanMorning") strokes = v ? p.per : 0;
    else if (p.divisor) strokes = Math.floor(v / p.divisor) * p.per;
    else strokes = v * p.per;
    return { ...p, v, strokes };
  }).filter(r => r.v > 0);

  if (!member) return <div className="text-center text-[#f8f4e9] py-20 font-display italic text-2xl">Player not found.</div>;

  const isLeader = group.members.length > 1 && score === Math.min(...allScores);
  const handleDownload = () => {
    exportNodeToPng(
      h2iLib, cardRef.current,
      `phone-golf_${slug(group.name)}_${slug(member.name)}_${date}.png`,
      "#1a4d3a"
    );
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back bar */}
      <div className="mt-2 mb-6 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-[#f8f4e9]/90 hover:text-[#f8f4e9] text-xs uppercase tracking-[0.16em] font-bold">
          <ChevronLeft className="w-4 h-4"/> Back to panel
        </button>
        <div className="text-[10px] uppercase tracking-[0.16em] text-[#f8f4e9]/80 font-semibold">
          Scorecard · Individual
        </div>
      </div>

      {/* THE CARD */}
      <div ref={cardRef} className="paper text-[#0f1f1a] rounded-[32px] shadow-2xl overflow-hidden relative drop-in">
        {/* header band */}
        <div className="relative px-8 pt-9 pb-6 bg-[#1a4d3a] text-[#f8f4e9]">
          <div className="absolute -right-10 -top-10 opacity-15 pointer-events-none">
            <Flag className="w-56 h-56" strokeWidth={1}/>
          </div>
          <div className="flex items-start justify-between relative gap-4">
            <div className="min-w-0">
              <div className="text-[#d4a24c] text-[10px] uppercase tracking-[0.28em] font-bold mb-2">Official scorecard</div>
              <div className="font-display text-4xl italic leading-tight truncate">{member.name}</div>
              <div className="text-[#f8f4e9]/90 text-sm mt-1">{group.name}</div>
            </div>
            <div className="h-14 w-14 rounded-full bg-[#d4a24c] flex items-center justify-center shrink-0">
              <Flag className="w-6 h-6 text-[#0f1f1a]" strokeWidth={2.5}/>
            </div>
          </div>
          <div className="mt-5 text-[11px] uppercase tracking-[0.16em] text-[#f8f4e9]/90 font-bold">
            {formatDate(date)}
          </div>
        </div>

        {/* hero score */}
        <div className="px-8 py-8 relative">
          <div className="flex items-end justify-between gap-8">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#1a4d3a]/85 font-bold">Total strokes</div>
              <div className="font-display text-[84px] leading-[0.85] italic mt-1">{score}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#1a4d3a]/85 font-bold">To par</div>
              <div
                className={`font-display text-[84px] leading-[0.85] italic mt-1 ${toPar <= 0 ? "text-[#1a4d3a]" : "text-[#b84226]"}`}
              >
                {toParLabel(toPar)}
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2 flex-wrap">
            <Chip tone="fairway">Par {par}</Chip>
            <Chip tone="gold">{toPar < 0 ? "Under par" : toPar > 0 ? "Over par" : "Even"}</Chip>
            {isLeader && <Chip tone="fairway">Clubhouse leader</Chip>}
            {parMode === "baseline" && <Chip tone="cream">Baseline par</Chip>}
          </div>
        </div>

        <div className="divider-dots h-2 mx-8"/>

        {/* Shot detail */}
        <div className="px-8 py-8 grid md:grid-cols-2 gap-x-10 gap-y-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-4 h-4 text-[#b84226]"/>
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#b84226]">Penalties</div>
            </div>
            {penaltyRows.length === 0 ? (
              <div className="font-display italic text-[#1a4d3a]/80 text-sm">Clean card. No penalties.</div>
            ) : (
              <div className="space-y-3">
                {penaltyRows.map(r => (
                  <ShotLine key={r.key} label={r.label} sub={r.sub} count={r.v} strokes={`+${r.strokes}`} tone="red"/>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-[#1a4d3a]"/>
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#1a4d3a]">Good shots</div>
            </div>
            {goodRows.length === 0 ? (
              <div className="font-display italic text-[#1a4d3a]/80 text-sm">No good shots logged.</div>
            ) : (
              <div className="space-y-3">
                {goodRows.map(r => (
                  <ShotLine
                    key={r.key}
                    label={r.label} sub={r.sub}
                    count={r.key === "cleanMorning" ? (r.v ? "✓" : 0) : r.v}
                    strokes={`−${r.strokes}`}
                    tone="fairway"
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* footer stamp */}
        <div className="px-8 pb-8 pt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-[#1a4d3a]/80 font-bold">
          <div className="flex items-center gap-1.5"><Flag className="w-3 h-3"/> Phone Golf Habit Club</div>
          <div className="font-mono">RD · {formatDateShort(date)}</div>
        </div>
      </div>

      <ExportBar h2iLib={h2iLib} h2iFailed={h2iFailed} onDownload={handleDownload} exportLabel="Download scorecard"/>
      <Footer/>
    </div>
  );
}

const ShotLine = ({ label, sub, count, strokes, tone }) => {
  const color = tone === "red" ? "#b84226" : "#1a4d3a";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b hairline pb-2.5">
      <div className="flex-1 min-w-0">
        <div className="font-display italic text-lg leading-tight">{label}</div>
        <div className="text-[11px] text-[#1a4d3a]/90 truncate">{sub}</div>
      </div>
      <div className="font-mono text-sm text-[#1a4d3a]/90 whitespace-nowrap">×{count}</div>
      <div className="font-mono font-bold text-lg whitespace-nowrap" style={{color}}>{strokes}</div>
    </div>
  );
};

// =============================================================================
//  LEADERBOARD VIEW — theatrical morning-circle drop
// =============================================================================
function LeaderboardView({ group, date, goalOffset, h2iLib, h2iFailed, onBack }) {
  const [revealKey, setRevealKey] = useState(0);
  const [phase, setPhase] = useState("intro"); // intro | dropping | done
  const boardRef = useRef(null);

  const par = getParForDate(group, date, goalOffset);
  const roundNum = getRoundNumber(group, date);
  const parMode = group.parMode || "baseline";
  const dayStats = group.days?.[date] || {};
  const rows = group.members.map(m => {
    const stats = dayStats[m.id] || EMPTY_STATS;
    const score = calcScore(stats);
    return { id: m.id, name: m.name, score, stats };
  });
  const sorted = [...rows].sort((a, b) => a.score - b.score)
                          .map((r, i) => ({ ...r, rank: i + 1, toPar: r.score - par }));

  const allZero = sorted.every(r => !Object.values(r.stats).some(v => v));
  const totalRows = sorted.length;
  const perRowDelay = 0.6;
  const introDuration = 1600;
  const totalDropTime = Math.max(totalRows, 1) * perRowDelay * 1000 + 1000;

  useEffect(() => {
    setPhase("intro");
    const t1 = setTimeout(() => setPhase("dropping"), introDuration);
    const t2 = setTimeout(() => setPhase("done"), introDuration + totalDropTime);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [revealKey]);

  const rerun = () => setRevealKey(k => k + 1);
  const goFullscreen = () => {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen();
  };
  const handleDownload = () => {
    setPhase("done");
    setTimeout(() => {
      exportNodeToPng(
        h2iLib, boardRef.current,
        `phone-golf_${slug(group.name)}_leaderboard_${date}.png`,
        "#05130e"
      );
    }, 80);
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back bar */}
      <div className="mt-2 mb-6 flex items-center justify-between gap-3 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-2 text-[#f8f4e9]/90 hover:text-[#f8f4e9] text-xs uppercase tracking-[0.16em] font-bold">
          <ChevronLeft className="w-4 h-4"/> Back to panel
        </button>
        <div className="flex items-center gap-2">
          <button onClick={goFullscreen} className="flex items-center gap-1.5 text-[#f8f4e9]/90 hover:text-[#f8f4e9] text-[11px] uppercase tracking-[0.16em] font-bold px-3 py-2 rounded-full hover:bg-white/10">
            <Maximize2 className="w-3.5 h-3.5"/> Fullscreen
          </button>
          <button onClick={rerun} className="flex items-center gap-1.5 text-[#d4a24c] text-[11px] uppercase tracking-[0.16em] font-bold px-3 py-2 rounded-full hover:bg-white/10">
            <RotateCcw className="w-3.5 h-3.5"/> Replay drop
          </button>
        </div>
      </div>

      {allZero && (
        <div className="paper text-[#0f1f1a] rounded-2xl p-5 mb-6 text-center font-display italic">
          No shots logged yet for {formatDateShort(date)}. Enter data on the panel to see a real leaderboard.
        </div>
      )}

      {/* PRESENTATION STAGE */}
      <div className="stage rounded-[36px] p-4 md:p-6 relative overflow-hidden">
        {/* Intro overlay */}
        {phase === "intro" && (
          <div className="absolute inset-0 z-20 flex items-center justify-center stage rounded-[36px]">
            <div className="text-center intro-in px-6">
              <div className="text-[#d4a24c] text-[11px] uppercase tracking-[0.4em] font-bold mb-4">
                Morning Circle
              </div>
              <div className="font-display italic text-5xl md:text-6xl text-[#f8f4e9] mb-3 leading-tight">
                {group.name}
              </div>
              <div className="font-display text-xl text-[#f8f4e9]/90 italic">
                Round {roundNum} · {formatDate(date)}
              </div>
              <div className="mt-8 flex items-center justify-center gap-3 text-[#d4a24c]">
                <div className="h-px w-16 bg-[#d4a24c]/70"/>
                <Flag className="w-4 h-4" strokeWidth={2.5}/>
                <div className="h-px w-16 bg-[#d4a24c]/70"/>
              </div>
              <div className="mt-4 text-[#f8f4e9]/85 text-[11px] uppercase tracking-[0.28em] font-bold shimmer">
                Presenting the board
              </div>
            </div>
          </div>
        )}

        {/* The leaderboard card */}
        <div ref={boardRef} className="paper text-[#0f1f1a] rounded-[28px] shadow-2xl overflow-hidden relative" key={revealKey}>
          {/* Header */}
          <div className="relative px-8 pt-9 pb-7 bg-[#0f2a1f] text-[#f8f4e9]">
            <div className="absolute inset-0 opacity-[0.08] pointer-events-none" style={{
              backgroundImage: "radial-gradient(circle at 20% 30%, #d4a24c 0%, transparent 40%), radial-gradient(circle at 80% 70%, #d4a24c 0%, transparent 40%)"
            }}/>
            <div className="relative flex items-start justify-between gap-6 flex-wrap">
              <div className="min-w-0">
                <div className="text-[#d4a24c] text-[10px] uppercase tracking-[0.28em] font-bold mb-2">The Leaderboard · Round {roundNum}</div>
                <div className="font-display text-4xl md:text-5xl italic leading-tight">{group.name}</div>
                <div className="text-[#f8f4e9]/90 text-[11px] mt-1 uppercase tracking-[0.16em] font-bold">{formatDate(date)}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#f8f4e9]/85 font-bold">
                  {parMode === "baseline" ? "Baseline Par" : "Rolling Par"}
                </div>
                <div className="font-display text-6xl italic leading-none text-[#d4a24c]">{par}</div>
              </div>
            </div>
          </div>

          {/* column header */}
          <div className="px-8 pt-5 pb-2 grid grid-cols-[36px_1fr_64px_72px] gap-4 items-center text-[10px] uppercase tracking-[0.18em] font-bold text-[#1a4d3a]/90 border-b hairline">
            <div>#</div>
            <div>Player</div>
            <div className="text-right">Score</div>
            <div className="text-right">To Par</div>
          </div>

          {/* rows */}
          <div className="px-4 py-3 relative min-h-[80px]">
            {sorted.length === 0 && (
              <div className="py-16 text-center font-display italic text-xl text-[#1a4d3a]/80">
                No players in this group yet.
              </div>
            )}
            {sorted.map((r, i) => {
              const delay = (sorted.length - 1 - i) * perRowDelay;
              const isLeader = i === 0 && sorted.length > 1;
              const showRow = phase !== "intro";
              return (
                <div
                  key={`${revealKey}-${r.id}`}
                  className={`${showRow ? "drop-in" : "opacity-0"} ${isLeader && phase === "done" ? "winner-glow" : ""} grid grid-cols-[36px_1fr_64px_72px] gap-4 items-center px-4 py-4 rounded-2xl my-1.5 border hairline relative overflow-hidden`}
                  style={{
                    animationDelay: showRow ? `${delay}s` : undefined,
                    background: isLeader
                      ? "linear-gradient(90deg, rgba(212,162,76,0.32), rgba(212,162,76,0.08))"
                      : "rgba(255,255,255,0.6)",
                  }}
                >
                  <div className="font-display text-3xl italic text-[#1a4d3a]">
                    {r.rank}
                  </div>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center font-display text-sm italic shrink-0 ${isLeader ? "bg-[#d4a24c] text-[#0f1f1a]" : "bg-[#1a4d3a] text-[#f8f4e9]"}`}>
                      {INITIALS(r.name) || "?"}
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-2xl italic truncate leading-tight">{r.name}</div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[#1a4d3a]/90 flex items-center gap-1.5 font-bold">
                        {isLeader
                          ? (<><Trophy className="w-3 h-3 text-[#d4a24c]"/>Clubhouse leader</>)
                          : r.rank === sorted.length && sorted.length > 1
                            ? "Bottom of the board"
                            : r.rank === 2 ? "Chasing" : r.rank === 3 ? "In contention" : "On course"}
                      </div>
                    </div>
                  </div>
                  <div className="font-mono font-bold text-2xl text-right text-[#0f1f1a]">
                    {r.score}
                  </div>
                  <div className={`font-mono font-bold text-2xl text-right ${r.toPar < 0 ? "text-[#1a4d3a]" : r.toPar > 0 ? "text-[#b84226]" : "text-[#0f1f1a]"}`}>
                    {toParLabel(r.toPar)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div className="px-8 pb-7 pt-4 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-[#1a4d3a]/90 border-t hairline font-bold">
            <div className="flex items-center gap-1.5"><Flag className="w-3 h-3"/> Phone Golf Habit Club</div>
            <div className="font-mono">Low score wins</div>
          </div>
        </div>
      </div>

      <ExportBar h2iLib={h2iLib} h2iFailed={h2iFailed} onDownload={handleDownload} exportLabel="Download leaderboard"/>

      <div className="mt-4 text-center text-[11px] uppercase tracking-[0.18em] text-[#f8f4e9]/80 font-semibold">
        Rows drop from last place to first — winner revealed last
      </div>
      <Footer/>
    </div>
  );
}

// =============================================================================
//  FOOTER
// =============================================================================
const Footer = () => (
  <div className="mt-20 pt-8 border-t border-[#f8f4e9]/20 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-[#f8f4e9]/80 font-semibold">
    <div className="flex items-center gap-2">
      <Circle className="w-2.5 h-2.5 fill-[#d4a24c] text-[#d4a24c]"/>
      Phone Golf · Facilitator prototype
    </div>
    <div className="font-mono">v1.1</div>
  </div>
);
