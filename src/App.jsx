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

import { useEffect, useMemo, useRef, useState } from "react";
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
import Century from "./components/Century.jsx";
import Burndown from "./components/Burndown.jsx";
import Future from "./components/Future.jsx";
import Hunt from "./components/Hunt.jsx";
import Challenges from "./components/Challenges.jsx";
import Bingo from "./components/Bingo.jsx";
import Trophies from "./components/Trophies.jsx";
import { THEMES, SURFACES, MODES, DEFAULT_THEME, DEFAULT_SURFACE, DEFAULT_MODE, applyTheme, applySurface } from "./lib/themes.js";

// Module-scope on purpose: BOTH retry loops in loadAll use this (the
// delta fetch and the live batch loop). It used to be declared between
// them, which put the delta's `await sleep(2000)` in the temporal dead
// zone — a ReferenceError that the delta's catch silently ate, so one
// throttled chunk aborted the whole delta merge and the "retry" never
// retried. Hoisted here so that can't happen again.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  ["hunt", "Hunt"], ["bingo", "Bingo"], ["wheel", "Wheel"], ["century", "Century"], ["burndown", "Burndown"], ["future", "Future"], ["challenges", "Challenges"],
  ["stats", "Stats"], ["compare", "Compare"], ["trophies", "Trophies"],
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
  const [refreshFailed, setRefreshFailed] = useState(false);   // live refresh died; snapshot is what you get
  const [history, setHistory] = useState([]);       // daily aggregates for the progress chart
  // Every load takes a ticket; only the NEWEST load may write state.
  // Without this, overlapping loads (page-load refresh + a mutation's
  // reload + a quick meta refresh) finish in arbitrary order and the
  // stale one overwrites the fresh one — games "forget" they exist,
  // 100%s flicker, ownership blinks. Classic async race, classic fix.
  const loadSeq = useRef(0);

  // Refresh CLUB data only (members, games list, contracts, century,
  // covers, …) — no Steam round trip. This is all most mutations need:
  // rebuilding stats from existing clubData + fresh meta is instant.
  async function loadMeta() {
    const seq = ++loadSeq.current;
    const r = await fetch("/api/db");
    const j = await r.json();
    if (r.ok && seq === loadSeq.current) setMeta(j);
    return j;
  }

  // skipCache: game-set changes (add/remove game or member) must NOT
  // repaint from last night's snapshot — it predates the change, so it
  // would show a world where the edit never happened ("game isn't in
  // the database"). Those flows go straight to a progressive live load.
  async function loadAll({ skipCache = false } = {}) {
    const seq = ++loadSeq.current;
    const fresh = () => seq === loadSeq.current;   // are we still the newest load?
    setError("");
    try {
      const metaRes = await fetch("/api/db");
      const metaJson = await metaRes.json();
      if (!metaRes.ok) throw new Error(metaJson.error);
      if (!fresh()) return;
      setMeta(metaJson);
      setSavedSettings(metaJson.settings ?? {});
      setCfg({ ...DEFAULT_SETTINGS, ...metaJson.settings });

      if (!metaJson.members.length || !metaJson.games.length) {
        if (fresh()) setClubData({ games: [], profiles: {} });
        return;
      }

      // FIRST PAINT: last night's snapshot, instantly (if the cron has run).
      let haveCache = false;
      let cachePayload = null;   // kept for the delta fetch below
      if (!skipCache) try {
        const cRes = await fetch("/api/cached");
        const c = await cRes.json();
        if (cRes.ok && c.payload?.games?.length) {
          if (!fresh()) return;
          cachePayload = c.payload;
          setClubData(c.payload);
          setDataAsOf(c.fetched_at);
          haveCache = true;
        }
      } catch { /* no cache yet — fall through to live load */ }

      // history chart data (non-critical; ignore failures)
      fetch("/api/history").then((r) => r.json()).then((j) => fresh() && setHistory(j.rows ?? [])).catch(() => {});

      // READ-THROUGH REFRESH: the server fetches whatever's stale,
      // persists it to the shared cache, and hands back the merged
      // payload — this little loop is the entire live layer now. A
      // fresh cache costs one cheap no-op call; a roster or game
      // change costs a few rounds while the server crawls the stale
      // slice ONCE, for everyone. All the machinery this replaced
      // (delta fetch, chunked retries, per-game carry-forward, the
      // garbage guard) lives server-side in lib/clubSync.js.
      let paintedAnything = haveCache;
      let firstStale = null;
      for (let round = 0; round < 8; round++) {
        if (!fresh()) return;
        let j = null;
        try {
          const r = await fetch("/api/refresh");
          j = await r.json();
          if (!r.ok) throw new Error(j.error ?? "refresh failed");
        } catch (e) {
          if (!paintedAnything) throw e;   // nothing on screen → surface the real error
          setLoadProgress(null);
          setRefreshFailed(true);          // something complete is on screen — keep it, say so
          break;
        }
        if (j.payload && fresh()) {
          setClubData(j.payload);
          paintedAnything = true;
          if (firstStale === null) firstStale = (j.staleRemaining ?? 0) + (j.fetchedGames ?? 0);
          setLoadProgress((j.staleRemaining ?? 0) > 0 ? { done: firstStale - j.staleRemaining, total: firstStale } : null);
        }
        if (j.fresh || (j.staleRemaining ?? 0) === 0) {
          if (fresh()) { setDataAsOf(null); setLoadProgress(null); setRefreshFailed(false); }
          break;
        }
        await sleep(1200);
      }
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
  async function mutate(op, body, successMsg, opts = {}) {
    // opts.reloadAfter: a promise — the Wheel commits spins server-side
    // BEFORE the animation plays, and settles this when the wheel has
    // landed, so the meta reload never rebuilds the page under a turning
    // wheel. Capped: leave the page mid-spin and the reload still
    // happens, just later. opts.quiet: no notice banner (the Wheel
    // narrates its own outcomes).
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, clubKey, ...body }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (successMsg && !opts.quiet) setNotice(successMsg(j));
      // Only game-set changes need the full Steam pipeline (with its
      // snapshot-repaint-then-live-refresh dance). Everything else —
      // century picks, covers, contracts, votes, ratings, settings —
      // changes club metadata only: refresh that and let stats
      // recompute in place. This is what stops the library from
      // "vanishing and coming back" on unrelated edits.
      const after = ["addGame", "removeGame", "promoteBacklog", "addMember", "removeMember"].includes(op)
        ? () => loadAll({ skipCache: true })   // the snapshot predates this change — don't paint from it
        : () => loadMeta();
      if (opts.reloadAfter) Promise.race([opts.reloadAfter, sleep(12000)]).then(after);
      else await after();
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
  const [gameSort, setGameSort] = useState("missing");   // Settings tracked-games sort

  const board = stats
    ? (boardMode === "month" ? stats.monthBoard : boardMode === "contracts" ? stats.contractBoard : stats.board)
    : [];
  const pts = (p) => (boardMode === "month" ? p.monthPoints : boardMode === "contracts" ? p.contractPts : p.points);

  // LADDER LEVERS (all-time board only): the gap to the row above, and
  // the cheapest single "finish this game" that closes it. Candidates
  // are started-incomplete games — "finish Elden Ring (0% in)" is a
  // wish, not a plan. ptsLeft = pool − basePoints, so the completion
  // bonus is included and a 95%-done game shows its true payout.
  const levers = useMemo(() => {
    if (!stats) return {};
    const cands = {};
    for (const g of stats.games) {
      for (const [sid, r] of Object.entries(g.players)) {
        if (!r.unlocks.length || r.complete) continue;
        (cands[sid] ??= []).push({ appid: g.appid, name: g.name, pct: r.pct,
          ptsLeft: Math.max(1, Math.round(g.pool - r.basePoints)) });
      }
    }
    for (const list of Object.values(cands)) list.sort((a, b) => a.ptsLeft - b.ptsLeft);
    return cands;
  }, [stats]);
  const leverLine = (i) => {
    const b = stats.board;                    // levers speak all-time points
    const p = b[i];
    if (i === 0) {
      const chaser = b[1];
      if (!chaser) return <>👑 Uncontested.</>;
      const back = p.points - chaser.points;
      return back <= 0 ? <>👑 Tied at the top — any unlock decides it.</>
        : <>👑 {chaser.name} is {back.toLocaleString()} pts back — don't sleep.</>;
    }
    const gap = b[i - 1].points - p.points;
    if (gap <= 0) return <>▲ Tied with {b[i - 1].name} — any unlock breaks it.</>;
    const list = levers[p.steamid] ?? [];
    const pass = list.find((c) => c.ptsLeft >= gap);
    if (pass) return <>▲ {gap.toLocaleString()} behind {b[i - 1].name} · cheapest pass: finish{" "}
      <a style={{ color: "var(--ink)", cursor: "pointer", textDecoration: "underline" }}
        onClick={() => nav(`/game/${pass.appid}`)}>{pass.name}</a> ({pass.pct}% in) → +{pass.ptsLeft.toLocaleString()}</>;
    const best = list[list.length - 1];
    if (best) return <>▲ {gap.toLocaleString()} behind {b[i - 1].name} · biggest move: finish {best.name} (+{best.ptsLeft.toLocaleString()}) — {(gap - best.ptsLeft).toLocaleString()} still short</>;
    return <>▲ {gap.toLocaleString()} behind {b[i - 1].name} · nothing started to finish — crack a game open</>;
  };

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
        @media (max-width: 860px) { .century-cols { grid-template-columns: 1fr !important; } }
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
            <span style={{ width: 8, height: 8, borderRadius: 4, background: refreshFailed ? "var(--err-border)" : "var(--accent)",
              animation: refreshFailed ? "none" : "pulse 1.4s ease-in-out infinite" }} />
            {refreshFailed
              ? <>Showing the latest snapshot ({new Date(dataAsOf).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}) — live refresh hit Steam's limits. Data may be up to a day old; reload in a minute to retry.</>
              : <>Showing the latest snapshot ({new Date(dataAsOf).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}) — refreshing live in the background…</>}
          </div>
        )}
        {(() => {   // DATA HEALTH: games in the club DB still awaiting achievement data
          const dataIds = new Set((clubData?.games ?? []).map((g) => Number(g.appid)));
          const waiting = clubData ? (meta?.games ?? []).filter((g) => !dataIds.has(Number(g.appid))) : [];
          return waiting.length > 0 && (
            <div className="panel" style={{ ...S.panel, marginBottom: 14, padding: "8px 14px", fontSize: 12, color: "var(--muted)" }}>
              ⏳ Awaiting data for {waiting.length} game{waiting.length > 1 ? "s" : ""}: {waiting.map((g) => g.name).join(", ")}
              <span style={{ color: "var(--faint)" }}> — added to the club, achievement data not fetched yet (usually Steam throttling; fills in on a successful refresh or tonight's snapshot).</span>
            </div>
          );
        })()}
        {(() => {   // DATA HEALTH: members whose library list is riding on an old ownership fetch.
          // ownedAt = last time GetOwnedGames genuinely answered for them; failed/empty
          // fetches carry the previous library forward instead of wiping it (lib/clubSync.js),
          // and this strip is where that carrying stops being silent. Payloads that predate
          // ownedAt simply don't warn.
          const nowSec = Date.now() / 1000;
          const stale = Object.entries(clubData?.profiles ?? {})
            .filter(([, p]) => p?.ownedAt !== undefined && Object.keys(p?.playtime ?? {}).length > 0
              && nowSec - (p.ownedAt || nowSec) > 36 * 3600)
            .map(([sid]) => (meta?.members ?? []).find((m) => m.steamid === sid)?.name ?? sid);
          return stale.length > 0 && (
            <div className="panel" style={{ ...S.panel, marginBottom: 14, padding: "8px 14px", fontSize: 12, color: "var(--muted)" }}>
              📚 Library list carried from the last good fetch for {stale.join(", ")}
              <span style={{ color: "var(--faint)" }}> — Steam hasn't confirmed their owned games in over a day, so the site is showing the last known library. Usually throttling; if it persists, check that their Steam privacy has "Game details" set to Public.</span>
            </div>
          );
        })()}
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
        {stats && !empty && page === "century" && <Century stats={stats} meta={meta} mutate={mutate} busy={busy} nav={nav} />}
        {stats && !empty && page === "burndown" && <Burndown stats={stats} meta={meta} history={history} nav={nav} cfg={cfg} />}
        {stats && !empty && page === "future" && <Future stats={stats} meta={meta} mutate={mutate} busy={busy} nav={nav} />}
        {stats && !empty && page === "hunt" && <Hunt stats={stats} meta={meta} mutate={mutate} busy={busy} nav={nav} />}
        {stats && !empty && page === "bingo" && <Bingo stats={stats} meta={meta} mutate={mutate} busy={busy} nav={nav} />}
        {stats && !empty && page === "trophies" && <Trophies stats={stats} meta={meta} nav={nav} />}
        {stats && !empty && page === "challenges" && <Challenges stats={stats} meta={meta} mutate={mutate} busy={busy} />}

        {stats && !empty && page === "board" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              {[["all", "All-time"], ["month", `This month (${stats.monthLabel})`], ["contracts", "⚔ Contract kills"], ["history", "🏆 History"]].map(([k, l]) => (
                <button key={k} style={{ ...S.btnGhost, ...(boardMode === k ? { color: "var(--accent)", borderColor: "var(--accent-border)" } : {}) }}
                  onClick={() => setBoardMode(k)}>{l}</button>
              ))}
            </div>
            {boardMode === "history" && (() => {
              const nameOf = (sid) => stats.byId[sid]?.name ?? sid;
              const colorOf = (sid) => stats.byId[sid]?.color;
              const banners = stats.board.filter((p) => p.monthWins > 0)
                .sort((a, b) => b.monthWins - a.monthWins);
              return (
                <>
                  <div className="panel" style={{ ...S.panel, display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span style={S.label}>Banners</span>
                    {banners.length ? banners.map((p) => (
                      <span key={p.steamid} style={{ fontSize: 14, cursor: "pointer" }} onClick={() => nav(`/player/${p.steamid}`)}>
                        <b style={{ color: p.color }}>{p.name}</b>
                        <span style={{ color: "var(--accent)" }}> 🏆×{p.monthWins}</span>
                      </span>
                    )) : (
                      <span style={{ fontSize: 13, color: "var(--muted)" }}>
                        No crowns yet — the first is awarded when {stats.monthLabel} ends.
                      </span>
                    )}
                  </div>
                  {[...stats.monthHistory].reverse().map((mo) => (
                    <div key={mo.month} className="panel" style={S.panel}>
                      <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 10, flexWrap: "wrap" }}>
                        <span style={{ ...S.display, fontSize: 17, fontWeight: 700 }}>{mo.label}</span>
                        {mo.done ? (
                          mo.winners.length
                            ? <span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600 }}>
                                👑 {mo.winners.map(nameOf).join(" & ")}
                              </span>
                            : <span style={{ fontSize: 12, color: "var(--faint)" }}>the club slept — no crown awarded</span>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--muted)", border: "1px solid var(--border)",
                            borderRadius: 999, padding: "2px 10px" }}>
                            in progress — current standings, crown at month's end
                          </span>
                        )}
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {mo.standings.map((row, i) => {
                          const crowned = mo.done && mo.winners.includes(row.sid);
                          return (
                            <div key={row.sid} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
                              <span style={{ width: 18, color: "var(--faint)", fontSize: 11, textAlign: "right" }}>{i + 1}.</span>
                              <a style={{ width: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                color: colorOf(row.sid), fontWeight: crowned ? 700 : 500, cursor: "pointer" }}
                                onClick={() => nav(`/player/${row.sid}`)}>
                                {crowned && "👑 "}{nameOf(row.sid)}
                              </a>
                              <span style={{ ...S.display, minWidth: 76, textAlign: "right", fontWeight: 700,
                                color: crowned ? "var(--accent)" : !mo.done && i === 0 && row.pts > 0 ? "var(--ink-strong)" : "var(--muted)" }}>
                                {row.pts.toLocaleString()}
                              </span>
                              <span style={{ fontSize: 12, color: "var(--faint)" }}>
                                {row.unlocks} unlock{row.unlocks === 1 ? "" : "s"}
                                {!mo.done && i === 0 && row.pts > 0 && " · leading"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <p style={{ fontSize: 12, color: "var(--muted)", margin: "2px 2px" }}>
                    One crown per finished month, scored in the main points economy. Ties crown co-champions.
                    The record starts August 2026 — earlier unlocks count all-time, but there are no retroactive crowns.
                  </p>
                </>
              );
            })()}
            {boardMode !== "history" && board.map((p, i) => (
              <div key={p.steamid} className="panel" style={{ ...S.panel, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ ...S.display, fontSize: 32, fontWeight: 700, color: i === 0 ? "var(--accent)" : "var(--faint)", width: 36 }}>{i + 1}</div>
                <Avatar url={p.avatar} color={p.color} size={44} />
                <div style={{ flex: "1 1 150px" }}>
                  <a style={{ fontSize: 17, fontWeight: 600, color: p.color, cursor: "pointer" }} onClick={() => nav(`/player/${p.steamid}`)}>{p.name}</a>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {p.rarestUnlock ? <>Rarest: {p.rarestUnlock.achName} ({p.rarestUnlock.pct.toFixed(2)}%)</> : "No unlocks yet"}
                  </div>
                  {boardMode === "all" && (
                    <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 3 }}>{leverLine(i)}</div>
                  )}
                </div>
                {[
                  ["Perfects", p.perfects, "var(--ink-strong)"],
                  boardMode === "contracts" ? ["Kills", p.contractKills, "var(--muted)"]
                    : boardMode === "month" ? ["Achievements", p.monthUnlocks, "var(--muted)"]
                    : ["Streak", `${p.streak.current}w`, "var(--muted)"],
                  ["Points", pts(p).toLocaleString(), "var(--accent)"],
                ].map(([l, v, c]) => (
                  <div key={l} style={{ textAlign: "right", minWidth: 74 }}>
                    <div style={S.label}>{l}</div>
                    <div style={{ ...S.display, fontSize: 24, fontWeight: 700, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
            ))}
            {boardMode !== "history" && (
              <p style={{ fontSize: 12, color: "var(--muted)", margin: "2px 2px" }}>
                {boardMode === "contracts"
                  ? "Contract kills: achievements and points earned under an active wheel contract or club bounty."
                  : boardMode === "month"
                  ? "Month points count only what's earned this calendar month — all-time totals are untouched. Crown awarded when the month ends (🏆 History)."
                  : <>Points accrue per achievement (rarity-weighted, +{Math.round((cfg.firstBloodPct ?? 0.1) * 100)}% first-blood bonus 🩸) — {Math.round(cfg.bonus * 100)}% of each pool only lands on 100%.</>}
              </p>
            )}
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
                  if (libSort === "easy") return (a.diff ?? 99) - (b.diff ?? 99);
                  if (libSort === "active") {
                    const la = Math.max(0, ...Object.values(a.players).map((r) => r.lastUnlock));
                    const lb = Math.max(0, ...Object.values(b.players).map((r) => r.lastUnlock));
                    return lb - la;
                  }
                  return (b.diff ?? -1) - (a.diff ?? -1);
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
                          {g.unrated
                            ? <span style={{ color: "var(--accent)" }}> · ⏱ needs time data</span>
                            : <span> · {g.hours}h</span>}
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
              <div style={{ ...S.label, marginBottom: 12 }}>Backups</div>
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 0 }}>
                Free-tier Supabase keeps <b>no automatic backups</b> — the club's data is one copy until you
                download another. <b>Core</b> is the irreplaceable part (roster, game list, settings, contracts,
                century picks, bingo, everything the club decided); grab it after big curation sessions.
                <b> History</b> is the nightly snapshot rows, chunked by month.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a style={S.btn} href="/api/backup" download>Download core</a>
                <a style={S.btnGhost} href={`/api/backup?snapshots=${new Date().toISOString().slice(0, 7)}`} download>
                  This month's history
                </a>
                <a style={S.btnGhost} href="/api/backup?manifest=1" target="_blank" rel="noreferrer">
                  All months…
                </a>
              </div>
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
              {(() => { const missing = meta.games.filter((g) => g.hours_median == null).length; return (
                <div style={{ ...S.label, marginBottom: 12 }}>
                  Tracked games ({meta.games.length}
                  {missing > 0 && <span style={{ color: "var(--accent)" }}> · ⏱ {missing} need time</span>})
                </div>
              ); })()}
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {meta.games.length > 5 && (
                  <input style={{ ...S.input, flex: 1 }} placeholder="Search games…"
                    value={gameFilter} onChange={(e) => setGameFilter(e.target.value)} />
                )}
                <select value={gameSort} onChange={(e) => setGameSort(e.target.value)} style={{ ...S.input, width: "auto" }}
                  aria-label="Sort tracked games">
                  <option value="missing">⏱ Needs time first</option>
                  <option value="name">A–Z</option>
                  <option value="hours">Longest first</option>
                  <option value="shortest">Shortest first</option>
                </select>
              </div>
              <div style={{ maxHeight: 340, overflowY: "auto", paddingRight: 4 }}>
                {[...meta.games]
                  .filter((g) => (g.name ?? "").toLowerCase().includes(gameFilter.toLowerCase()))
                  .sort((a, b) => {
                    const an = (a.name ?? "").toLowerCase(), bn = (b.name ?? "").toLowerCase();
                    if (gameSort === "name") return an.localeCompare(bn);
                    if (gameSort === "hours") return (Number(b.hours_median) || -1) - (Number(a.hours_median) || -1) || an.localeCompare(bn);
                    if (gameSort === "shortest") return (Number(a.hours_median) || 9e9) - (Number(b.hours_median) || 9e9) || an.localeCompare(bn);
                    // "missing": unrated first (that's the to-do list), then A–Z within each group
                    return (a.hours_median == null ? 0 : 1) - (b.hours_median == null ? 0 : 1) || an.localeCompare(bn);
                  })
                  .map((g) => (
                    <div key={g.appid} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      {g.hours_median == null && <span title="Needs median hours-to-complete" style={{ flexShrink: 0 }}>⏱</span>}
                      <span style={{ flex: 1, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        color: g.hours_median == null ? "var(--accent)" : "var(--ink)" }}>{g.name ?? g.appid}</span>
                      <input
                        key={`${g.appid}:${g.hours_median ?? ""}`}
                        type="number" min="0.5" step="0.5" placeholder="hrs"
                        defaultValue={g.hours_median ?? ""}
                        aria-label={`${g.name} median hours to complete`}
                        style={{ ...S.input, width: 74, padding: "6px 8px" }}
                        disabled={busy}
                        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          const cur = g.hours_median == null ? "" : String(g.hours_median);
                          if (v === cur) return;   // unchanged — no write
                          mutate("setHours", { appid: g.appid, hours: v === "" ? null : Number(v) },
                            (j) => j.hours == null ? `${g.name}: time cleared (⏱ unrated)` : `${g.name}: ${j.hours}h median`);
                        }} />
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
