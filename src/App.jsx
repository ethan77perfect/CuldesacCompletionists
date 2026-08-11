// ---------------------------------------------------------------
// App.jsx — the shell. This file owns three jobs:
//
//   1. DATA. It fetches everything (loadAll), holds it in React
//      state, and hands it down to page components as props.
//      Components never fetch; they only render what they're given.
//   2. ROUTING. useRoute() reads the URL hash (#/game/123) and
//      decides which page component to show.
//   3. FOUR INLINE PAGES. Leaderboard, Library, Charts, and
//      Settings are small enough that they live right here
//      instead of separate files.
//
// React mental model (for the embedded-brained): components are
// functions that re-run whenever their state changes. useState
// gives you a [value, setter] pair; calling the setter re-renders.
// There is no manual "update the screen" step — you change state,
// React re-runs the function, and the returned JSX diff is applied
// to the DOM. Think of it as an event loop where state writes are
// the interrupts.
// ---------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { DEFAULT_SETTINGS } from "./lib/scoring.js";
import { buildClubStats } from "./lib/stats.js";
import { S, Dial, Slider, Avatar, diffColor } from "./components/ui.jsx";
import Home from "./components/Home.jsx";
import GameDetail from "./components/GameDetail.jsx";
import PlayerPage from "./components/PlayerPage.jsx";
import Compare from "./components/Compare.jsx";
import StatsPage from "./components/StatsPage.jsx";
import Backlog from "./components/Backlog.jsx";
import Wheel from "./components/Wheel.jsx";
import Hunt from "./components/Hunt.jsx";
import Challenges from "./components/Challenges.jsx";
import { THEMES, SURFACES, MODES, DEFAULT_THEME, DEFAULT_SURFACE, DEFAULT_MODE, applyTheme, applySurface } from "./lib/themes.js";

// ---- tiny hash router ----
// The URL hash ("#/game/123") is our page address. Why hash instead
// of real paths (/game/123)? Because this is a static site: Vercel
// serves index.html for "/" only, and a hard refresh on /game/123
// would 404. The hash is never sent to the server, so every page
// works on refresh with zero server config. useRoute() parses the
// hash into ["game", "123"] and re-renders on the "hashchange"
// browser event. nav("/game/123") just writes the hash.
function useRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const fn = () => setHash(window.location.hash);
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const nav = (path) => { window.location.hash = path; };
  return [parts[0] || "home", parts[1], nav];
}

const NAV = [
  ["home", "Home"], ["board", "Leaderboard"], ["library", "Library"],
  ["hunt", "Hunt"], ["wheel", "Wheel"], ["challenges", "Challenges"],
  ["stats", "Stats"], ["compare", "Compare"],
  ["backlog", "Backlog"], ["settings", "Settings"],
];

export default function App() {
  const [page, param, nav] = useRoute();

  // ---- state ----
  // meta      : raw DB rows from /api/db (members, games, settings, backlog)
  // clubData  : raw Steam data from /api/club (achievements, unlocks, profiles)
  // cfg       : the LIVE scoring knobs — sliders edit this, everything
  //             recomputes instantly; "Save as club rules" persists it
  // clubKey   : the shared edit password, mirrored to localStorage so
  //             it survives refreshes
  // busy      : true while a mutation is in flight (disables buttons)
  const [meta, setMeta] = useState(null);
  const [clubData, setClubData] = useState(null);
  const [cfg, setCfg] = useState(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] = useState({});
  const [clubKey, setClubKey] = useState(() => localStorage.getItem("clubKey") ?? "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState("12");
  const [gameFilter, setGameFilter] = useState("");
  const [libSort, setLibSort] = useState("diff");
  const [libSearch, setLibSearch] = useState("");
  const [boardMode, setBoardMode] = useState("all");
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") ?? DEFAULT_THEME);
  const [surface, setSurface] = useState(() => localStorage.getItem("surface") ?? DEFAULT_SURFACE);
  const [colorMode, setColorMode] = useState(() => localStorage.getItem("mode") ?? DEFAULT_MODE);
  useEffect(() => { applyTheme(theme, colorMode); }, [theme, colorMode]);
  useEffect(() => { applySurface(surface); }, [surface]);

  const [loadProgress, setLoadProgress] = useState(null);
  const [dataAsOf, setDataAsOf] = useState(null);   // set while showing last night's snapshot
  const [history, setHistory] = useState([]);       // daily aggregates for the progress chart

  async function loadAll() {
    setError("");
    try {
      const metaRes = await fetch("/api/db");
      const metaJson = await metaRes.json();
      if (!metaRes.ok) throw new Error(metaJson.error);
      setMeta(metaJson);
      setSavedSettings(metaJson.settings ?? {});
      setCfg({ ...DEFAULT_SETTINGS, ...metaJson.settings });

      if (!metaJson.members.length || !metaJson.games.length) {
        setClubData({ games: [], profiles: {} });
        return;
      }

      // FIRST PAINT: last night's snapshot, instantly (if the cron has run).
      let haveCache = false;
      try {
        const cRes = await fetch("/api/cached");
        const c = await cRes.json();
        if (cRes.ok && c.payload?.games?.length) {
          setClubData(c.payload);
          setDataAsOf(c.fetched_at);
          haveCache = true;
        }
      } catch { /* no cache yet — fall through to live load */ }

      // history chart data (non-critical; ignore failures)
      fetch("/api/history").then((r) => r.json()).then((j) => setHistory(j.rows ?? [])).catch(() => {});

      // THEN: live refresh in small batches so big clubs don't trip Steam rate limits.
      const sids = metaJson.members.map((m) => m.steamid).join(",");
      const appids = metaJson.games.map((g) => g.appid);
      const BATCH = 12;
      const chunks = [];
      for (let i = 0; i < appids.length; i += BATCH) chunks.push(appids.slice(i, i + BATCH));

      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let games = [], profiles = {};
      for (let ci = 0; ci < chunks.length; ci++) {
        if (!haveCache) setLoadProgress({ done: ci, total: chunks.length });
        const url = `/api/club?steamids=${sids}&appids=${chunks[ci].join(",")}&profiles=${ci === 0 ? 1 : 0}`;
        let j = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const r = await fetch(url);
          const body = await r.json();
          if (!r.ok) throw new Error(body.error);
          j = body;
          if (!j.failed) break;          // clean batch
          await sleep(2500 * (attempt + 1)); // Steam throttled us — cool off, retry batch
        }
        games = games.concat(j.games);
        Object.assign(profiles, j.profiles ?? {});
        // with a cache on screen, swap in live data only once it's COMPLETE —
        // partial live data replacing a full snapshot would look like regression
        if (!haveCache) setClubData({ games: [...games], profiles: { ...profiles } });
      }
      setClubData({ games, profiles });
      setDataAsOf(null);
      setLoadProgress(null);
    } catch (e) {
      setLoadProgress(null);
      setError(e.message || "Something went wrong loading club data");
    }
  }
  useEffect(() => { loadAll(); }, []);

  // ---- mutate: the one door for every write ----
  // POSTs { op, clubKey, ...body } to /api/db, shows the result as a
  // notice or error, then calls loadAll() so the screen reflects the
  // database. successMsg is a function because some messages need the
  // server's response (e.g. the resolved game name).
  async function mutate(op, body, successMsg) {
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, clubKey, ...body }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setNotice(successMsg(j));
      await loadAll();
      return j;
    } catch (e) {
      setError(e.message || "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  // ---- the big recompute ----
  // useMemo caches a computed value and only re-runs the function when
  // a dependency (the [meta, clubData, cfg] array) changes. This is why
  // the settings sliders feel live: dragging one changes cfg, which
  // re-runs buildClubStats over data already in memory — no network.
  const stats = useMemo(
    () => (meta && clubData ? buildClubStats(clubData, meta, cfg) : null),
    [meta, clubData, cfg]
  );

  const empty = meta && (!meta.members.length || !meta.games.length);
  const [newMember, setNewMember] = useState({ idOrVanity: "", color: "#7FB4E6" });
  const [newGame, setNewGame] = useState("");

  const board = stats
    ? (boardMode === "season" ? stats.seasonBoard : boardMode === "contracts" ? stats.contractBoard : stats.board)
    : [];
  const pts = (p) => (boardMode === "season" ? p.seasonPoints : boardMode === "contracts" ? p.contractPts : p.points);

  return (
    <div className="app-bg" style={S.page}>
      <style>{`
        .tab { background:none; border:none; color:var(--muted); font:600 13px Inter,sans-serif; letter-spacing:.08em; text-transform:uppercase; padding:10px 2px; margin-right:22px; cursor:pointer; border-bottom:2px solid transparent; }
        .tab.on { color:var(--accent); border-bottom-color:var(--accent); }
        .tab:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
        a { text-decoration: none; }
        body, .panel-hover { transition: background .25s, border-color .25s, color .25s; }
        .card-lift { transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease; }
        .card-lift:hover { transform: translateY(-2px); border-color: var(--accent-border); box-shadow: 0 6px 18px rgba(0,0,0,.35); }
        [data-mode="light"] .card-lift:hover, [data-mode="game"] .card-lift:hover { box-shadow: 0 6px 16px rgba(30,30,25,.18); }
        @keyframes pulse { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
        @keyframes pointer-kick { 0% { transform: translateX(-50%) rotate(0); } 35% { transform: translateX(-50%) rotate(10deg); } 100% { transform: translateX(-50%) rotate(0); } }
        .wheel-pointer { transform: translateX(-50%); animation: pointer-kick .12s ease-out; }
        @media (prefers-reduced-motion: reduce) { .wheel-pointer { animation: none; } }
        [data-mode="light"] [data-surface="glass"] .panel, [data-mode="light"][data-surface="glass"] .panel { background: color-mix(in srgb, var(--panel) 62%, transparent) !important; }
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: var(--bg); }
        ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 6px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--faint); }

        /* ---- surfaces ---- */
        [data-surface="glass"] .app-bg {
          background-image:
            radial-gradient(900px 500px at 15% -5%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 60%),
            radial-gradient(800px 600px at 100% 30%, color-mix(in srgb, var(--accent) 6%, transparent), transparent 55%),
            radial-gradient(700px 500px at 40% 110%, color-mix(in srgb, var(--ink) 4%, transparent), transparent 60%);
        }
        [data-surface="glass"] .panel {
          background: color-mix(in srgb, var(--panel) 52%, transparent) !important;
          backdrop-filter: blur(14px) saturate(1.25);
          -webkit-backdrop-filter: blur(14px) saturate(1.25);
          border-color: color-mix(in srgb, var(--ink) 14%, transparent) !important;
        }
        [data-surface="neon"] .panel {
          box-shadow: 0 0 0 1px var(--accent-border), 0 0 22px -10px var(--accent);
        }
        [data-surface="neon"] .tab.on { text-shadow: 0 0 12px var(--accent); }
        [data-surface="neon"] h1 { text-shadow: 0 0 18px color-mix(in srgb, var(--accent) 45%, transparent); }
        @media (prefers-reduced-motion: reduce){ *{ transition:none !important } }`}</style>

      <div style={{ borderBottom: "1px solid var(--border)", background: "var(--header)", backgroundImage: "linear-gradient(to right, var(--accent) 0%, var(--accent2, var(--accent)) 30%, transparent 65%)", backgroundSize: "100% 2px", backgroundRepeat: "no-repeat", backgroundPosition: "bottom" }}>
        <div style={{ ...S.wrap, padding: "24px 20px 0" }}>
          <h1 style={{ ...S.display, fontSize: 40, fontWeight: 700, margin: 0, color: "var(--ink-strong)", letterSpacing: "0.02em", cursor: "pointer" }}
            onClick={() => nav("/home")}>THE 100% CLUB</h1>
          <nav style={{ marginTop: 12, overflowX: "auto", whiteSpace: "nowrap" }}>
            {NAV.map(([k, l]) => (
              <button key={k} className={`tab ${page === k ? "on" : ""}`} onClick={() => nav(`/${k}`)}>{l}</button>
            ))}
          </nav>
        </div>
      </div>

      <div style={{ ...S.wrap, marginTop: 24 }}>
        {error && (
          <div className="panel" style={{ ...S.panel, borderColor: "var(--err-border)", background: "var(--err-bg)", marginBottom: 14, fontSize: 13 }}>
            {error} <button style={{ ...S.btnGhost, marginLeft: 10 }} onClick={loadAll}>Retry</button>
          </div>
        )}
        {notice && (
          <div className="panel" style={{ ...S.panel, borderColor: "var(--accent-border)", background: "var(--ok-bg)", marginBottom: 14, fontSize: 13, color: "var(--accent)" }}>{notice}</div>
        )}
        {dataAsOf && (
          <div className="panel" style={{ ...S.panel, marginBottom: 14, padding: "8px 14px", fontSize: 12, color: "var(--muted)", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--accent)", animation: "pulse 1.4s ease-in-out infinite" }} />
            Showing last night's snapshot ({new Date(dataAsOf).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}) — refreshing live in the background…
          </div>
        )}
        {loadProgress && (
          <div className="panel" style={{ ...S.panel, marginBottom: 14, fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 12 }}>
            <span>Syncing with Steam… {Math.min(loadProgress.done * 12, (meta?.games?.length ?? 0))} / {meta?.games?.length ?? 0} games</span>
            <div style={{ flex: 1, background: "var(--border)", borderRadius: 3, height: 6 }}>
              <div style={{ width: `${(loadProgress.done / Math.max(loadProgress.total, 1)) * 100}%`, background: "var(--accent)", height: 6, borderRadius: 3, transition: "width .3s" }} />
            </div>
          </div>
        )}
        {!meta && !error && <div style={{ color: "var(--muted)", padding: 40, textAlign: "center" }}>Loading the club…</div>}
        {meta && !clubData && !error && <div style={{ color: "var(--muted)", padding: 40, textAlign: "center" }}>Pulling achievements from Steam…</div>}

        {empty && page !== "settings" && (
          <div className="panel" style={{ ...S.panel, textAlign: "center", padding: 40 }}>
            <div style={{ ...S.display, fontSize: 26, fontWeight: 700, color: "var(--ink-strong)" }}>The club is empty</div>
            <p style={{ color: "var(--muted)", fontSize: 14 }}>Add members and games in Settings to bring it to life.</p>
            <button style={S.btn} onClick={() => nav("/settings")}>Open settings</button>
          </div>
        )}

        {/* ---- page switch ----
            Each line is: "if we're on page X and data is ready, render
            component X". The `stats && !empty &&` guards stop pages from
            rendering before data exists. To add a page: add an entry to
            NAV above, add a line here, create the component. */}
        {stats && !empty && page === "home" && <Home stats={stats} nav={nav} />}
        {stats && !empty && page === "game" && <GameDetail stats={stats} appid={param} meta={meta} mutate={mutate} busy={busy} nav={nav} />}
        {stats && !empty && page === "player" && <PlayerPage stats={stats} sid={param} nav={nav} />}
        {stats && !empty && page === "compare" && <Compare stats={stats} meta={meta} nav={nav} />}
        {stats && !empty && page === "stats" && <StatsPage stats={stats} nav={nav} members={meta.members} history={history} />}
        {meta && page === "backlog" && <Backlog meta={meta} mutate={mutate} busy={busy} />}
        {stats && !empty && page === "wheel" && <Wheel stats={stats} meta={meta} mutate={mutate} busy={busy} nav={nav} />}
        {stats && !empty && page === "hunt" && <Hunt stats={stats} meta={meta} mutate={mutate} busy={busy} nav={nav} />}
        {stats && !empty && page === "challenges" && <Challenges stats={stats} meta={meta} mutate={mutate} busy={busy} />}

        {stats && !empty && page === "board" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              {[["all", "All-time"], ["season", `This season (${stats.season})`], ["contracts", "⚔ Contract kills"]].map(([k, l]) => (
                <button key={k} style={{ ...S.btnGhost, ...(boardMode === k ? { color: "var(--accent)", borderColor: "var(--accent-border)" } : {}) }}
                  onClick={() => setBoardMode(k)}>{l}</button>
              ))}
            </div>
            {board.map((p, i) => (
              <div key={p.steamid} className="panel" style={{ ...S.panel, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ ...S.display, fontSize: 32, fontWeight: 700, color: i === 0 ? "var(--accent)" : "var(--faint)", width: 36 }}>{i + 1}</div>
                <Avatar url={p.avatar} color={p.color} size={44} />
                <div style={{ flex: "1 1 150px" }}>
                  <a style={{ fontSize: 17, fontWeight: 600, color: p.color, cursor: "pointer" }} onClick={() => nav(`/player/${p.steamid}`)}>{p.name}</a>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {p.rarestUnlock ? <>Rarest: {p.rarestUnlock.achName} ({p.rarestUnlock.pct.toFixed(2)}%)</> : "No unlocks yet"}
                  </div>
                </div>
                {[
                  ["Perfects", p.perfects, "var(--ink-strong)"],
                  boardMode === "contracts" ? ["Kills", p.contractKills, "var(--muted)"] : ["Streak", `${p.streak.current}w`, "var(--muted)"],
                  ["Points", pts(p).toLocaleString(), "var(--accent)"],
                ].map(([l, v, c]) => (
                  <div key={l} style={{ textAlign: "right", minWidth: 74 }}>
                    <div style={S.label}>{l}</div>
                    <div style={{ ...S.display, fontSize: 24, fontWeight: 700, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
            ))}
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "2px 2px" }}>
              {boardMode === "contracts"
                ? "Contract kills: achievements and points earned under an active wheel contract or club bounty."
                : boardMode === "season"
                ? "Season points count only unlocks earned this quarter — all-time totals are untouched."
                : <>Points accrue per achievement (rarity-weighted, +{Math.round((cfg.firstBloodPct ?? 0.1) * 100)}% first-blood bonus 🩸) — {Math.round(cfg.bonus * 100)}% of each pool only lands on 100%.</>}
            </p>
          </div>
        )}

        {stats && !empty && page === "library" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input style={{ ...S.input, flex: "1 1 200px" }} placeholder="Search library…"
                value={libSearch} onChange={(e) => setLibSearch(e.target.value)} />
              <select value={libSort} onChange={(e) => setLibSort(e.target.value)} style={{ ...S.input, width: "auto" }}>
                <option value="diff">Hardest first</option>
                <option value="easy">Easiest first</option>
                <option value="name">A → Z</option>
                <option value="active">Recently active</option>
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
              {[...stats.games]
                .filter((g) => g.name.toLowerCase().includes(libSearch.toLowerCase()))
                .sort((a, b) => {
                  if (libSort === "name") return a.name.localeCompare(b.name);
                  if (libSort === "easy") return a.diff - b.diff;
                  if (libSort === "active") {
                    const la = Math.max(0, ...Object.values(a.players).map((r) => r.lastUnlock));
                    const lb = Math.max(0, ...Object.values(b.players).map((r) => r.lastUnlock));
                    return lb - la;
                  }
                  return b.diff - a.diff;
                })
                .map((g) => (
                  <div key={g.appid} className="card-lift panel" style={{ ...S.panel, cursor: "pointer" }} onClick={() => nav(`/game/${g.appid}`)}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <Dial value={g.diff} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {g.race && "🏁 "}{g.name}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>
                          {g.ach.length} achievements · pool {g.pool} pts
                          {g.adjust !== 0 && <span style={{ color: "var(--accent)" }}> · adj {g.adjust > 0 ? `+${g.adjust}` : g.adjust}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {meta.members.filter((m) => g.players[m.steamid]).map((m) => {
                        const r = g.players[m.steamid];
                        return (
                          <span key={m.steamid} style={{
                            fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20,
                            background: r.complete ? "var(--accent-bg)" : "var(--chip)",
                            color: r.complete ? "var(--accent)" : m.color,
                            border: `1px solid ${r.complete ? "var(--accent-border)" : "var(--border2)"}`,
                          }}>
                            {m.name} {r.complete ? "★ 100%" : `${r.pct}%`}
                          </span>
                        );
                      })}
                      {Object.keys(g.players).length === 0 && (
                        <span style={{ fontSize: 12, color: "var(--faint)" }}>No one has started this yet</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {meta && page === "settings" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
            <div className="panel" style={S.panel}>
              <div style={{ ...S.label, marginBottom: 12 }}>Club key</div>
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 0 }}>
                Needed to add or remove anything — it's the CLUB_KEY from deployment. Share it with your friends.
              </p>
              <input style={S.input} type="password" placeholder="Enter club key" value={clubKey}
                onChange={(e) => { setClubKey(e.target.value); localStorage.setItem("clubKey", e.target.value); }} />
            </div>

            <div className="panel" style={S.panel}>
              <div style={{ ...S.label, marginBottom: 12 }}>Members</div>
              {meta.members.map((m) => (
                <div key={m.steamid} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 6, background: m.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{m.name}</span>
                  <button style={S.btnGhost} disabled={busy}
                    onClick={() => mutate("removeMember", { steamid: m.steamid }, () => `${m.name} removed`)}>Remove</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <input style={{ ...S.input, flex: 1 }} placeholder="Steam profile URL, vanity name, or ID"
                  value={newMember.idOrVanity}
                  onChange={(e) => setNewMember({ ...newMember, idOrVanity: e.target.value })} />
                <input type="color" value={newMember.color} aria-label="Member color"
                  onChange={(e) => setNewMember({ ...newMember, color: e.target.value })}
                  style={{ width: 42, height: 40, border: "none", background: "none", cursor: "pointer" }} />
              </div>
              <button style={{ ...S.btn, marginTop: 10 }} disabled={busy || !newMember.idOrVanity}
                onClick={() => mutate("addMember", newMember, (j) => `${j.name} joined the club`).then(() => setNewMember({ idOrVanity: "", color: "#7FB4E6" }))}>
                Add member
              </button>
            </div>

            <div className="panel" style={S.panel}>
              <div style={{ ...S.label, marginBottom: 12 }}>Tracked games ({meta.games.length})</div>
              {meta.games.length > 5 && (
                <input style={{ ...S.input, marginBottom: 10 }} placeholder="Search games…"
                  value={gameFilter} onChange={(e) => setGameFilter(e.target.value)} />
              )}
              <div style={{ maxHeight: 300, overflowY: "auto", paddingRight: 4 }}>
                {meta.games
                  .filter((g) => (g.name ?? "").toLowerCase().includes(gameFilter.toLowerCase()))
                  .map((g) => (
                    <div key={g.appid} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ flex: 1, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name ?? g.appid}</span>
                      <span title="Club difficulty adjustment" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button style={S.btnGhost} disabled={busy || (g.adjust ?? 0) <= -3} aria-label={`Lower ${g.name} difficulty`}
                          onClick={() => mutate("setAdjust", { appid: g.appid, adjust: (g.adjust ?? 0) - 1 }, (j) => `${g.name} adjustment: ${j.adjust >= 0 ? "+" : ""}${j.adjust}`)}>−</button>
                        <span style={{ fontSize: 12, fontWeight: 700, width: 24, textAlign: "center", color: (g.adjust ?? 0) !== 0 ? "var(--accent)" : "var(--faint)" }}>
                          {(g.adjust ?? 0) > 0 ? `+${g.adjust}` : (g.adjust ?? 0)}
                        </span>
                        <button style={S.btnGhost} disabled={busy || (g.adjust ?? 0) >= 3} aria-label={`Raise ${g.name} difficulty`}
                          onClick={() => mutate("setAdjust", { appid: g.appid, adjust: (g.adjust ?? 0) + 1 }, (j) => `${g.name} adjustment: ${j.adjust >= 0 ? "+" : ""}${j.adjust}`)}>+</button>
                      </span>
                      <button style={S.btnGhost} disabled={busy}
                        onClick={() => mutate("removeGame", { appid: g.appid }, () => `${g.name} removed`)}>Remove</button>
                    </div>
                  ))}
              </div>
              <input style={{ ...S.input, marginTop: 6 }} placeholder="Steam store URL or appid"
                value={newGame} onChange={(e) => setNewGame(e.target.value)} />
              <button style={{ ...S.btn, marginTop: 10 }} disabled={busy || !newGame}
                onClick={() => mutate("addGame", { appidOrUrl: newGame }, (j) => `${j.name} added (${j.achCount} achievements)`).then(() => setNewGame(""))}>
                Add game
              </button>
            </div>

            <div className="panel" style={S.panel}>
              <div style={{ ...S.label, marginBottom: 12 }}>Theme</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {Object.entries(MODES).map(([id, label]) => (
                  <button key={id} onClick={() => setColorMode(id)}
                    style={{ ...S.btnGhost, ...(colorMode === id ? { color: "var(--accent)", borderColor: "var(--accent-border)", fontWeight: 700 } : {}) }}>
                    {id === "dark" ? "🌙 " : id === "light" ? "☀️ " : "🎮 "}{label}
                  </button>
                ))}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {Object.entries(THEMES).map(([id, t]) => (
                  <label key={id} style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", fontSize: 14 }}>
                    <input type="radio" name="theme" checked={theme === id} onChange={() => setTheme(id)}
                      style={{ accentColor: "var(--accent)" }} />
                    <span style={{ display: "flex", gap: 3 }}>
                      {["--bg", "--panel", "--accent", "--accent2"].filter((v) => (t[colorMode] ?? t.dark)[v]).map((v) => (
                        <span key={v} style={{ width: 14, height: 14, borderRadius: 4, background: (t[colorMode] ?? t.dark)[v], border: "1px solid var(--border2)" }} />
                      ))}
                    </span>
                    <span style={{ fontWeight: theme === id ? 700 : 400, color: theme === id ? "var(--accent)" : "var(--ink)" }}>{t.label}</span>
                  </label>
                ))}
              </div>
              <div style={{ ...S.label, margin: "16px 0 8px" }}>Surface</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(SURFACES).map(([id, label]) => (
                  <button key={id} onClick={() => setSurface(id)}
                    style={{ ...S.btnGhost, ...(surface === id ? { color: "var(--accent)", borderColor: "var(--accent-border)", fontWeight: 700 } : {}) }}>
                    {label}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 12, color: "var(--faint)", marginTop: 10 }}>Theme × surface, saved per device — everyone picks their own. Glass frosts the panels over an ambient glow; Neon adds an accent halo.</p>
            </div>

            <div className="panel" style={S.panel}>
              <div style={{ ...S.label, marginBottom: 16 }}>Scoring rules</div>
              <Slider label="100% completion bonus" value={cfg.bonus} min={0} max={0.8} step={0.05}
                onChange={(v) => setCfg({ ...cfg, bonus: v })} fmt={(v) => `${Math.round(v * 100)}% of pool`} />
              <Slider label="Rarity steepness" value={cfg.steepness} min={2} max={5} step={0.1}
                onChange={(v) => setCfg({ ...cfg, steepness: v })} fmt={(v) => v.toFixed(1)} />
              <Slider label="Rarest achievement weight" value={cfg.rarestWeight} min={0.3} max={1} step={0.05}
                onChange={(v) => setCfg({ ...cfg, rarestWeight: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="First blood bonus 🩸" value={cfg.firstBloodPct ?? 0.1} min={0} max={0.25} step={0.05}
                onChange={(v) => setCfg({ ...cfg, firstBloodPct: v })} fmt={(v) => `+${Math.round(v * 100)}%`} />

              <div style={{ ...S.label, margin: "18px 0 10px" }}>Monthly challenge</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select value={cfg.challenge?.appid ?? ""} style={{ ...S.input, flex: 1 }}
                  onChange={(e) => setCfg({ ...cfg, challenge: e.target.value ? { appid: Number(e.target.value), month: cfg.challenge?.month ?? new Date().toISOString().slice(0, 7) } : null })}>
                  <option value="">No challenge</option>
                  {meta.games.map((g) => <option key={g.appid} value={g.appid}>{g.name}</option>)}
                </select>
                {cfg.challenge && (
                  <input type="month" style={{ ...S.input, width: "auto" }} value={cfg.challenge.month}
                    onChange={(e) => setCfg({ ...cfg, challenge: { ...cfg.challenge, month: e.target.value } })} />
                )}
              </div>

              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 14 }}>
                Everything previews live for you — saving makes it official for the whole club.
              </p>
              <button style={S.btn} disabled={busy}
                onClick={() => mutate("saveSettings", { data: cfg }, () => "Club rules saved")}>
                Save as club rules
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
