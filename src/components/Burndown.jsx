// ---------------------------------------------------------------
// Burndown.jsx — "#/burndown": the backlog-burning page.
//
// LIBRARY SCOPE (v9): your mountain is the club games YOU OWN —
// nothing else. The first version measured everyone against the
// entire club list, which mostly measured purchasing decisions;
// this version measures how clean your own shelf is, which is the
// thing the page exists to incentivize.
//
// A game is "on your mountain" when you own it (it appears in your
// GetOwnedGames playtime map, already fetched with every payload)
// OR you have achievement data for it. The OR matters twice: free
// games Steam doesn't report as owned until first launch, and
// loads where the ownership fetch failed (empty playtime map ⇒
// unknown, not "owns nothing" — degrade to started-games scope,
// the same convention Century uses for its dust treatment).
//
// Sections:
//   · Cleanest shelf — ranked by % of your own library conquered.
//     Ranking by raw remaining would crown the smallest library
//     forever; completion RATE is the fair fight. Biggest Burner
//     stays as the monthly effort prize.
//   · %-over-time chart from nightly snapshots. cron.js now writes
//     rows for owned-but-untouched games too, so going forward the
//     denominator is your library; older days counted started
//     games only — hence the one-time step noted under the chart.
//   · Pace + ETA at current pace.
//   · Spotlight — top offenders (started, then abandoned), the
//     Untouched Shelf (owned, zero achievements — the deep
//     backlog, dustiest first), and quick wins.
//
// Points-remaining = Σ over your mountain of (pool − basePoints):
// untouched games owe their full pool, perfected games owe zero,
// and the completion bonus is included automatically.
// ---------------------------------------------------------------
import { useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { S, PctBar } from "./ui.jsx";
import { chartInk } from "../lib/themes.js";

const WEEK = 7 * 86400, MONTH30 = 30 * 86400;

const fmtEta = (weeks) =>
  !isFinite(weeks) ? "never, at this pace 😴"
  : weeks < 1 ? "this week 🔥"
  : weeks < 10 ? `~${Math.round(weeks)} weeks`
  : weeks < 52 ? `~${Math.round(weeks / 4.33)} months`
  : `~${(weeks / 52).toFixed(1)} years`;

const fmtMin = (min) => (min >= 60 ? `${(min / 60).toFixed(min >= 600 ? 0 : 1)}h` : `${min}m`);
const ago = (epoch) => {
  const d = (Date.now() / 1000 - epoch) / 86400;
  return d >= 365 ? `${(d / 365).toFixed(1)}y ago` : d >= 30 ? `${Math.round(d / 30)}mo ago`
    : d >= 1 ? `${Math.round(d)}d ago` : "today";
};

export default function Burndown({ stats, meta, history = [], nav, cfg }) {
  const ink = chartInk();
  const [spot, setSpot] = useState(meta.members[0]?.steamid ?? "");
  const now = Date.now() / 1000;

  // ---- each member's mountain: the club games THEY own ----
  const mountains = useMemo(() => {
    const m = new Map();
    for (const mem of meta.members) {
      const pt = stats.profilesPlaytime?.[mem.steamid] ?? {};
      const ownershipKnown = Object.keys(pt).length > 0;
      m.set(mem.steamid, stats.games.filter((g) =>
        g.players[mem.steamid] || (ownershipKnown && pt[g.appid] !== undefined)));
    }
    return m;
  }, [stats, meta]);

  // ---- per-member numbers, scoped to their own mountain ----
  const rows = useMemo(() => meta.members.map((m) => {
    const mine = mountains.get(m.steamid) ?? [];
    let totalAch = 0, unlocked = 0, remainingPts = 0, untouched = 0;
    for (const g of mine) {
      const p = g.players[m.steamid];
      totalAch += g.ach.length;
      unlocked += p ? p.unlocks.length : 0;
      remainingPts += Math.max(0, g.pool - (p?.basePoints ?? 0));
      if ((p?.unlocks.length ?? 0) === 0) untouched += 1;
    }
    const recent = stats.events.filter((e) => e.kind === "unlock" && e.sid === m.steamid && e.t >= now - MONTH30).length;
    const weekly = recent / (MONTH30 / WEEK);
    const remaining = totalAch - unlocked;
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const burnedThisMonth = stats.events.filter((e) => e.kind === "unlock" && e.sid === m.steamid && e.t >= monthStart.getTime() / 1000).length;
    return {
      sid: m.steamid, name: m.name, color: m.color,
      libSize: mine.length, untouched, totalAch, unlocked, remaining,
      pct: totalAch ? Math.round((unlocked / totalAch) * 100) : 0,
      remainingPts: Math.round(remainingPts), weekly, eta: remaining / (weekly || 0),
      burnedThisMonth,
    };
  }).sort((a, b) => b.pct - a.pct || a.remaining - b.remaining), [stats, meta, mountains, now]);

  const burner = [...rows].sort((a, b) => b.burnedThisMonth - a.burnedThisMonth)[0];

  // ---- %-over-time chart from snapshot history ----
  const hasTotals = history.some((r) => r.total > 0);
  const chartRows = useMemo(() => {
    if (!hasTotals) return [];
    const nameOf = Object.fromEntries(meta.members.map((m) => [m.steamid, m.name]));
    const byDay = new Map();
    for (const r of history) {
      if (!r.total) continue;
      if (!byDay.has(r.day)) byDay.set(r.day, { day: r.day.slice(5) });
      byDay.get(r.day)[nameOf[r.steamid] ?? r.steamid] = Math.round((r.unlocked / r.total) * 1000) / 10;
    }
    return [...byDay.values()];
  }, [history, meta, hasTotals]);

  // ---- spotlight member ----
  const s = rows.find((r) => r.sid === spot);
  const spotGames = mountains.get(spot) ?? [];
  const offenders = useMemo(() => spotGames
    .filter((g) => { const p = g.players[spot]; return p && p.unlocks.length > 0 && !p.complete; })
    .map((g) => ({ appid: g.appid, name: g.name, remaining: g.ach.length - g.players[spot].unlocks.length }))
    .sort((a, b) => b.remaining - a.remaining).slice(0, 8), [spotGames, spot]);
  const shelf = useMemo(() => {
    const pt = stats.profilesPlaytime?.[spot] ?? {};
    const lp = stats.profilesLastPlayed?.[spot] ?? {};
    return spotGames
      .filter((g) => (g.players[spot]?.unlocks.length ?? 0) === 0)
      .map((g) => ({ appid: g.appid, name: g.name, ach: g.ach.length,
        minutes: pt[g.appid] ?? 0, last: lp[g.appid] ?? 0 }))
      .sort((a, b) => (a.last || 0) - (b.last || 0) || b.ach - a.ach);
  }, [spotGames, stats, spot]);
  const quickWins = useMemo(() =>
    stats.recs.filter((r) => r.sid === spot).slice(0, 5), [stats, spot]);
  const maxOffender = Math.max(...offenders.map((o) => o.remaining), 1);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="panel" style={{ ...S.panel, display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={S.label}>Burndown</span>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          Your shelf. Your mountain. Burn it.
        </span>
        {burner && burner.burnedThisMonth > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--accent)" }}>
            🔥 Biggest burner this month: <b>{burner.name}</b> ({burner.burnedThisMonth} achievements)
          </span>
        )}
      </div>

      {chartRows.length > 1 ? (
        <div className="panel" style={S.panel}>
          <div style={{ ...S.label, marginBottom: 12 }}>% of your library conquered — every nightly snapshot</div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartRows}>
              <CartesianGrid stroke={ink.grid} vertical={false} />
              <XAxis dataKey="day" stroke={ink.axis} fontSize={11} />
              <YAxis stroke={ink.axis} fontSize={11} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: "var(--header)", border: "1px solid var(--border)", borderRadius: 8 }}
                formatter={(v) => [`${v}%`]} />
              <Legend />
              {meta.members.map((m) => (
                <Area key={m.steamid} type="monotone" dataKey={m.name} stroke={m.color}
                  fill={m.color} fillOpacity={0.06} strokeWidth={2} connectNulls dot={false} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 8 }}>
            Each line = unlocked ÷ total achievements in the games that member owns. Days recorded before
            the library-scope update counted started games only, so lines may step once at the changeover
            — and buying more of the club's games makes your mountain (honestly) taller.
          </div>
        </div>
      ) : (
        <div className="panel" style={{ ...S.panel, fontSize: 12, color: "var(--muted)" }}>
          The %-over-time chart appears after a couple of nightly snapshots with totals
          (run supabase/migration-v8.sql, then let the cron work — existing snapshot days fill in retroactively).
        </div>
      )}

      <div className="panel" style={S.panel}>
        <div style={{ ...S.label, marginBottom: 12 }}>Cleanest shelf — % of your own library conquered</div>
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((r, i) => (
            <div key={r.sid} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
              <span style={{ width: 18, color: "var(--faint)", fontSize: 11, textAlign: "right" }}>{i + 1}.</span>
              <span style={{ width: 9, height: 9, borderRadius: 5, background: r.color, flexShrink: 0 }} />
              <span style={{ width: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                title={`${r.libSize} club games owned · ${r.untouched} untouched`}
                onClick={() => setSpot(r.sid)}>{r.name}</span>
              <div style={{ flex: 1, height: 12, background: "var(--chip)", borderRadius: 6, overflow: "hidden" }}>
                <div style={{ width: `${r.pct}%`, height: "100%",
                  background: r.color, opacity: 0.55, borderRadius: 6 }} />
              </div>
              <span style={{ width: 230, fontSize: 12, color: "var(--muted)", textAlign: "right" }}>
                <b style={{ color: "var(--ink)" }}>{r.pct}%</b> done · {r.remaining} ach left · {r.remainingPts.toLocaleString()} pts
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={S.panel}>
        <div style={{ ...S.label, marginBottom: 12 }}>Pace — last 30 days, and where it leads</div>
        <div style={{ display: "grid", gap: 6 }}>
          {[...rows].sort((a, b) => b.weekly - a.weekly).map((r) => (
            <div key={r.sid} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
              <span style={{ width: 9, height: 9, borderRadius: 5, background: r.color, flexShrink: 0 }} />
              <span style={{ width: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
              <span style={{ width: 130, color: "var(--muted)", fontSize: 12 }}>
                {r.weekly.toFixed(1)} / week
              </span>
              <span style={{ flex: 1, fontSize: 12, color: r.weekly > 0 ? "var(--ink)" : "var(--faint)" }}>
                library 100% {fmtEta(r.eta)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {s && (
        <div className="panel" style={S.panel}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <div style={S.label}>Spotlight</div>
            <select value={spot} onChange={(e) => setSpot(e.target.value)} style={{ ...S.input, width: "auto" }}>
              {meta.members.map((m) => <option key={m.steamid} value={m.steamid}>{m.name}</option>)}
            </select>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {s.unlocked}/{s.totalAch} ach across {s.libSize} owned club games · {s.untouched} untouched
              · {s.weekly.toFixed(1)}/week · burned {s.burnedThisMonth} this month
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Top offenders — cracked open, left unfinished</div>
              <div style={{ display: "grid", gap: 5 }}>
                {offenders.map((o) => (
                  <div key={o.appid} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                    <span style={{ width: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                      onClick={() => nav(`/game/${o.appid}`)}>{o.name}</span>
                    <div style={{ flex: 1, height: 9, background: "var(--chip)", borderRadius: 5, overflow: "hidden" }}>
                      <div style={{ width: `${(o.remaining / maxOffender) * 100}%`, height: "100%", background: "var(--err-border)", borderRadius: 5 }} />
                    </div>
                    <span style={{ width: 60, textAlign: "right", color: "var(--muted)" }}>{o.remaining} left</span>
                  </div>
                ))}
                {offenders.length === 0 && <span style={{ fontSize: 12, color: "var(--accent)" }}>Nothing half-eaten. Suspiciously tidy. 🧹</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>The Untouched Shelf — owned, zero achievements, dustiest first</div>
              <div style={{ display: "grid", gap: 5 }}>
                {shelf.slice(0, 8).map((g) => (
                  <div key={g.appid} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                    <span style={{ width: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                      onClick={() => nav(`/game/${g.appid}`)}>{g.name}</span>
                    <span style={{ flex: 1, color: "var(--faint)" }}>
                      {g.last === 0 && g.minutes === 0 ? "🧊 never launched"
                        : `${g.minutes ? fmtMin(g.minutes) + " played" : "barely touched"} · ${g.last ? ago(g.last) : "long ago"}`}
                    </span>
                    <span style={{ width: 60, textAlign: "right", color: "var(--muted)" }}>{g.ach} ach</span>
                  </div>
                ))}
                {shelf.length > 8 && (
                  <span style={{ fontSize: 11, color: "var(--faint)" }}>…and {shelf.length - 8} more gathering dust.</span>
                )}
                {shelf.length === 0 && <span style={{ fontSize: 12, color: "var(--accent)" }}>Shelf's clear — every owned game has at least one unlock. 🔥</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Quick wins — closest to the summit</div>
              <div style={{ display: "grid", gap: 5 }}>
                {quickWins.map((r) => {
                  const g = stats.games.find((x) => x.appid === r.appid);
                  const p = g?.players[spot];
                  return (
                    <div key={r.appid} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                      <span style={{ width: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                        onClick={() => nav(`/game/${r.appid}`)}>{r.name}</span>
                      <span style={{ flex: 1 }}><PctBar pct={p?.pct ?? 0} /></span>
                      <span style={{ width: 60, textAlign: "right", color: "var(--muted)" }}>{p?.pct ?? 0}%</span>
                    </div>
                  );
                })}
                {quickWins.length === 0 && <span style={{ fontSize: 12, color: "var(--muted)" }}>No recommendations — everything's either done or untouched.</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
