// ---------------------------------------------------------------
// Burndown.jsx — "#/burndown": the backlog-burning page.
//
// The pitch: make the mountain visible, then make shrinking it a
// sport. Club-wide: % of the library conquered over time (from
// nightly snapshots), the mountain remaining per member, pace over
// the last 30 days, and an ETA at current pace — plus this month's
// biggest burner. Individual spotlight: top offenders (games owing
// the most achievements), quick wins (closest to done), and
// personal pace numbers.
//
// Points-remaining math mirrors scoring.js: each unearned
// achievement's per-value, plus the completion bonus (pool × bonus)
// for unfinished games.
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

export default function Burndown({ stats, meta, history = [], nav, cfg }) {
  const ink = chartInk();
  const [spot, setSpot] = useState(meta.members[0]?.steamid ?? "");
  const now = Date.now() / 1000;

  // ---- unlock-id sets per member per game (from the events stream) ----
  const unlockedIds = useMemo(() => {
    const m = new Map();
    for (const e of stats.events) {
      if (e.kind !== "unlock") continue;
      const k = `${e.sid}|${e.appid}`;
      if (!m.has(k)) m.set(k, new Set());
      m.get(k).add(e.achId);
    }
    return m;
  }, [stats]);

  // ---- per-member burndown numbers ----
  const rows = useMemo(() => meta.members.map((m) => {
    let totalAch = 0, unlocked = 0, remainingPts = 0;
    for (const g of stats.games) {
      totalAch += g.ach.length;
      const p = g.players[m.steamid];
      unlocked += p?.unlocked ?? 0;
      const ids = unlockedIds.get(`${m.steamid}|${g.appid}`) ?? new Set();
      for (const a of g.ach) if (!ids.has(a.id)) remainingPts += g.table.per.get(a.id) ?? 0;
      if (!p?.complete) remainingPts += g.pool * (cfg?.bonus ?? 0.4);
    }
    const recent = stats.events.filter((e) => e.kind === "unlock" && e.sid === m.steamid && e.t >= now - MONTH30).length;
    const weekly = recent / (MONTH30 / WEEK);
    const remaining = totalAch - unlocked;
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const burnedThisMonth = stats.events.filter((e) => e.kind === "unlock" && e.sid === m.steamid && e.t >= monthStart.getTime() / 1000).length;
    return {
      sid: m.steamid, name: m.name, color: m.color,
      totalAch, unlocked, remaining, pct: totalAch ? Math.round((unlocked / totalAch) * 100) : 0,
      remainingPts: Math.round(remainingPts), weekly, eta: remaining / (weekly || 0),
      burnedThisMonth,
    };
  }).sort((a, b) => a.remaining - b.remaining), [stats, meta, unlockedIds, cfg, now]);

  const burner = [...rows].sort((a, b) => b.burnedThisMonth - a.burnedThisMonth)[0];
  const maxRemaining = Math.max(...rows.map((r) => r.remaining), 1);

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
  const offenders = useMemo(() => stats.games
    .filter((g) => !g.players[spot]?.complete)
    .map((g) => ({ appid: g.appid, name: g.name, remaining: g.ach.length - (g.players[spot]?.unlocked ?? 0), total: g.ach.length }))
    .sort((a, b) => b.remaining - a.remaining).slice(0, 8), [stats, spot]);
  const quickWins = useMemo(() =>
    stats.recs.filter((r) => r.sid === spot).slice(0, 5), [stats, spot]);
  const maxOffender = Math.max(...offenders.map((o) => o.remaining), 1);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="panel" style={{ ...S.panel, display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={S.label}>Burndown</span>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          The backlog is a mountain. This page is the fire.
        </span>
        {burner && burner.burnedThisMonth > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--accent)" }}>
            🔥 Biggest burner this month: <b>{burner.name}</b> ({burner.burnedThisMonth} achievements)
          </span>
        )}
      </div>

      {chartRows.length > 1 ? (
        <div className="panel" style={S.panel}>
          <div style={{ ...S.label, marginBottom: 12 }}>% of the library conquered — every nightly snapshot</div>
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
        </div>
      ) : (
        <div className="panel" style={{ ...S.panel, fontSize: 12, color: "var(--muted)" }}>
          The %-over-time chart appears after a couple of nightly snapshots with totals
          (run supabase/migration-v8.sql, then let the cron work — existing snapshot days fill in retroactively).
        </div>
      )}

      <div className="panel" style={S.panel}>
        <div style={{ ...S.label, marginBottom: 12 }}>The mountain remaining — least left wins</div>
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((r, i) => (
            <div key={r.sid} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
              <span style={{ width: 18, color: "var(--faint)", fontSize: 11, textAlign: "right" }}>{i + 1}.</span>
              <span style={{ width: 9, height: 9, borderRadius: 5, background: r.color, flexShrink: 0 }} />
              <span style={{ width: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                onClick={() => setSpot(r.sid)}>{r.name}</span>
              <div style={{ flex: 1, height: 12, background: "var(--chip)", borderRadius: 6, overflow: "hidden" }}>
                <div style={{ width: `${(r.remaining / maxRemaining) * 100}%`, height: "100%",
                  background: r.color, opacity: 0.55, borderRadius: 6 }} />
              </div>
              <span style={{ width: 190, fontSize: 12, color: "var(--muted)", textAlign: "right" }}>
                <b style={{ color: "var(--ink)" }}>{r.remaining}</b> ach · {r.remainingPts.toLocaleString()} pts left · {r.pct}% done
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
              {s.unlocked}/{s.totalAch} achievements · {s.weekly.toFixed(1)}/week · burned {s.burnedThisMonth} this month
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Top offenders — the games owing the most</div>
              <div style={{ display: "grid", gap: 5 }}>
                {offenders.map((o) => (
                  <div key={o.appid} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                    <span style={{ width: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                      onClick={() => nav("game", { appid: o.appid })}>{o.name}</span>
                    <div style={{ flex: 1, height: 9, background: "var(--chip)", borderRadius: 5, overflow: "hidden" }}>
                      <div style={{ width: `${(o.remaining / maxOffender) * 100}%`, height: "100%", background: "var(--err-border)", borderRadius: 5 }} />
                    </div>
                    <span style={{ width: 60, textAlign: "right", color: "var(--muted)" }}>{o.remaining} left</span>
                  </div>
                ))}
                {offenders.length === 0 && <span style={{ fontSize: 12, color: "var(--accent)" }}>Nothing left. The mountain is ash. 🏔️🔥</span>}
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
                        onClick={() => nav("game", { appid: r.appid })}>{r.name}</span>
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
