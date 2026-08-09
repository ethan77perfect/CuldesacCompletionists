// ---------------------------------------------------------------
// StatsPage.jsx — deep-cuts page ("#/stats"): records, hall of
// fame, the rarity scatter plot, velocity, and the graveyard.
//
// The scatter is recharts with two notable settings: the Y axis
// is log-scale (rarity spans 100% down to 0.05%, linear would
// squash everything) and reversed (rare = LOW on the chart, so
// hard-earned unlocks visually "sink"). One <Scatter> series per
// member gives each their color.
// ---------------------------------------------------------------
import { useState } from "react";
import { AreaChart, Area, BarChart, Bar, Cell, Legend, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { diffColor } from "./ui.jsx";
import { S, TierChip, fmtDays, fmtDate } from "./ui.jsx";

export default function StatsPage({ stats, nav, members }) {
  const { records, hallOfFame, graveyard, byId, scatter, board } = stats;
  const [range, setRange] = useState("12");
  const name = (sid) => byId[sid]?.name ?? "?";
  const color = (sid) => byId[sid]?.color ?? "var(--muted)";

  const recordRows = [
    records.fastest && ["Fastest 100%", `${name(records.fastest.sid)} — ${records.fastest.name} in ${fmtDays(records.fastest.days)}`],
    records.longest && ["Longest journey", `${name(records.longest.sid)} — ${records.longest.name} over ${fmtDays(records.longest.days)}`],
    records.bestDay && ["Most unlocks in a day", `${name(records.bestDay.sid)} — ${records.bestDay.count} on ${records.bestDay.date}`],
    records.firstPerfect && ["First perfect in club history", `${name(records.firstPerfect.sid)} — ${records.firstPerfect.gameName}, ${fmtDate(records.firstPerfect.t)}`],
    records.biggestUnlock && ["Biggest single haul", `${name(records.biggestUnlock.sid)} — ${records.biggestUnlock.achName} (+${Math.round(records.biggestUnlock.pts)} pts)`],
  ].filter(Boolean);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="panel" style={S.panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={S.label}>Club points over time</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[["6", "6 months"], ["12", "Past year"], ["all", "All time"]].map(([k, l]) => (
              <button key={k} onClick={() => setRange(k)}
                style={{ ...S.btnGhost, ...(range === k ? { color: "var(--accent)", borderColor: "var(--accent-border)" } : {}) }}>{l}</button>
            ))}
          </div>
        </div>
        {stats.timeline.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={range === "all" ? stats.timeline : stats.timeline.slice(-parseInt(range, 10))}>
              <CartesianGrid stroke="#232D40" vertical={false} />
              <XAxis dataKey="month" stroke="#8FA3BF" fontSize={11} />
              <YAxis stroke="#8FA3BF" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--header)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Legend />
              {members.map((m) => (
                <Area key={m.steamid} type="monotone" dataKey={m.name} stroke={m.color} fill={m.color} fillOpacity={0.12} strokeWidth={2} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : <p style={{ color: "var(--muted)", fontSize: 13 }}>Unlock some achievements and the race chart appears here.</p>}
      </div>

      <div className="panel" style={S.panel}>
        <div style={{ ...S.label, marginBottom: 12 }}>Library by difficulty</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={stats.histogram}>
            <CartesianGrid stroke="#232D40" vertical={false} />
            <XAxis dataKey="diff" stroke="#8FA3BF" fontSize={11} />
            <YAxis allowDecimals={false} stroke="#8FA3BF" fontSize={11} />
            <Tooltip contentStyle={{ background: "var(--header)", border: "1px solid var(--border)", borderRadius: 8 }} />
            <Bar dataKey="games" radius={[4, 4, 0, 0]}>
              {stats.histogram.map((h) => <Cell key={h.diff} fill={diffColor(h.diff)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="panel" style={S.panel}>
          <div style={{ ...S.label, marginBottom: 12 }}>Club records</div>
          {recordRows.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>Records are earned, not given.</p>}
          {recordRows.map(([l, v]) => (
            <div key={l} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{l}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>

        <div className="panel" style={S.panel}>
          <div style={{ ...S.label, marginBottom: 12 }}>Hall of fame — rarest unlocks</div>
          <div style={{ display: "grid", gap: 8, maxHeight: 300, overflowY: "auto", paddingRight: 4 }}>
            {hallOfFame.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                <span style={{ color: "var(--faint)", width: 20 }}>{i + 1}.</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <b style={{ color: color(e.sid) }}>{name(e.sid)}</b> — <i>{e.achName}</i>{" "}
                  <a style={S.link} onClick={() => nav(`/game/${e.appid}`)}>({e.gameName})</a>
                </span>
                <TierChip pct={e.pct} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel" style={S.panel}>
        <div style={{ ...S.label, marginBottom: 12 }}>Every unlock, by date and rarity — hard-earned sinks lower</div>
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="#232D40" />
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} stroke="#8FA3BF" fontSize={11}
              tickFormatter={(t) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", year: "2-digit" })} />
            <YAxis dataKey="pct" type="number" scale="log" domain={[0.05, 100]} stroke="#8FA3BF" fontSize={11}
              tickFormatter={(v) => `${v}%`} reversed />
            <ZAxis range={[24, 24]} />
            <Tooltip contentStyle={{ background: "var(--header)", border: "1px solid var(--border)", borderRadius: 8 }}
              formatter={(v, k) => k === "pct" ? [`${v.toFixed(2)}%`, "rarity"] : [fmtDate(v), "date"]}
              labelFormatter={() => ""} />
            {board.map((p) => (
              <Scatter key={p.steamid} data={scatter.filter((s) => s.sid === p.steamid)}
                fill={p.color} fillOpacity={0.7} name={p.name} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="panel" style={S.panel}>
          <div style={{ ...S.label, marginBottom: 12 }}>Completion velocity</div>
          {board.map((p) => (
            <div key={p.steamid} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
              <b style={{ color: p.color }}>{p.name}</b>
              <span style={{ color: "var(--muted)" }}>
                {p.avgSpanDays != null ? `avg ${fmtDays(p.avgSpanDays)} to 100%` : "no completions yet"} · closes {Math.round(p.closerRate * 100)}% of what they start
              </span>
            </div>
          ))}
        </div>

        <div className="panel" style={S.panel}>
          <div style={{ ...S.label, marginBottom: 12 }}>The graveyard 🪦 — untouched 6+ months</div>
          {graveyard.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>Empty. The club leaves no game behind.</p>}
          <div style={{ display: "grid", gap: 8, maxHeight: 260, overflowY: "auto", paddingRight: 4 }}>
            {graveyard.map((g, i) => (
              <div key={i} style={{ fontSize: 13 }}>
                <b style={{ color: color(g.sid) }}>{name(g.sid)}</b> abandoned{" "}
                <a style={S.link} onClick={() => nav(`/game/${g.appid}`)}>{g.name}</a>{" "}
                <span style={{ color: "var(--muted)" }}>at {g.pct}%, {g.daysDead} days ago</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
