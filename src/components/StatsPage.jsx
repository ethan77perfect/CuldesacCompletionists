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
import { useEffect, useRef, useState } from "react";
import { AreaChart, Area, BarChart, Bar, Cell, Legend, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { diffColor } from "./ui.jsx";
import { chartInk } from "../lib/themes.js";
import { S, TierChip, fmtDays, fmtDate } from "./ui.jsx";

export default function StatsPage({ stats, nav, members, history = [] }) {
  // snapshot history → one row per day with each member's perfect count
  const historyRows = (() => {
    if (!history.length) return [];
    const byDay = new Map();
    const nameOf = Object.fromEntries(members.map((m) => [m.steamid, m.name]));
    for (const r of history) {
      if (!byDay.has(r.day)) byDay.set(r.day, { day: r.day.slice(5) });
      byDay.get(r.day)[nameOf[r.steamid] ?? r.steamid] = r.perfects;
    }
    return [...byDay.values()];
  })();
  const { records, hallOfFame, graveyard, byId, scatter, board } = stats;
  const [range, setRange] = useState("12");
  const ink = chartInk();   // live theme colors for SVG chart attributes
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
              <CartesianGrid stroke={ink.grid} vertical={false} />
              <XAxis dataKey="month" stroke={ink.axis} fontSize={11} />
              <YAxis stroke={ink.axis} fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--header)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Legend />
              {members.map((m) => (
                <Area key={m.steamid} type="monotone" dataKey={m.name} stroke={m.color} fill={m.color} fillOpacity={0.12} strokeWidth={2} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : <p style={{ color: "var(--muted)", fontSize: 13 }}>Unlock some achievements and the race chart appears here.</p>}
      </div>

      {historyRows.length > 1 && (
        <div className="panel" style={S.panel}>
          <div style={{ ...S.label, marginBottom: 12 }}>Perfect games over time — from nightly snapshots</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={historyRows}>
              <CartesianGrid stroke={ink.grid} vertical={false} />
              <XAxis dataKey="day" stroke={ink.axis} fontSize={11} />
              <YAxis allowDecimals={false} stroke={ink.axis} fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--header)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Legend />
              {members.map((m) => (
                <Area key={m.steamid} type="stepAfter" dataKey={m.name} stroke={m.color}
                  fill={m.color} fillOpacity={0.08} strokeWidth={2} connectNulls />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="panel" style={S.panel}>
        <div style={{ ...S.label, marginBottom: 12 }}>Library by difficulty</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={stats.histogram}>
            <CartesianGrid stroke={ink.grid} vertical={false} />
            <XAxis dataKey="diff" stroke={ink.axis} fontSize={11} />
            <YAxis allowDecimals={false} stroke={ink.axis} fontSize={11} />
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

      <RarityScatter scatter={scatter} board={board} ink={ink} />

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


// ---------------------------------------------------------------
// RarityScatter — "every unlock, by date and rarity" with a time
// window. "All" fits everything responsively; 1y / 6mo / 1mo keep
// ALL the data but scale the chart so only the chosen window fits
// the panel — the rest lives behind a horizontal scroll (opens
// scrolled to the newest unlocks; drag left to travel back in time).
// ---------------------------------------------------------------
const WINDOWS = { all: ["All", null], y1: ["1y", 365], m6: ["6mo", 182], m1: ["1mo", 30] };

function RarityScatter({ scatter, board, ink }) {
  const [win, setWin] = useState("all");
  const wrapRef = useRef(null);
  const scrollRef = useRef(null);
  const [viewW, setViewW] = useState(900);

  useEffect(() => {
    const measure = () => wrapRef.current && setViewW(wrapRef.current.clientWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const windowDays = WINDOWS[win][1];
  const ts = scatter.map((s) => s.t);
  const spanDays = ts.length ? Math.max(1, (Math.max(...ts) - Math.min(...ts)) / 86400) : 1;
  // chart width so that exactly `windowDays` fits the visible panel
  const chartW = windowDays ? Math.max(viewW, Math.round(viewW * (spanDays / windowDays))) : viewW;

  // windowed modes open at the newest data
  useEffect(() => {
    if (windowDays && scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [win, chartW]);

  const chart = (
    <ScatterChart width={chartW} height={300} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
      <CartesianGrid stroke={ink.grid} />
      <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} stroke={ink.axis} fontSize={11}
        tickCount={windowDays ? Math.max(6, Math.round(spanDays / (windowDays / 6))) : undefined}
        tickFormatter={(t) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", year: "2-digit" })} />
      <YAxis dataKey="pct" type="number" scale="log" domain={[0.05, 100]} stroke={ink.axis} fontSize={11}
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
  );

  return (
    <div className="panel" style={S.panel} ref={wrapRef}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={S.label}>Every unlock, by date and rarity — hard-earned sinks lower</div>
        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {Object.entries(WINDOWS).map(([k, [label]]) => (
            <button key={k} onClick={() => setWin(k)}
              style={{ ...S.btnGhost, padding: "2px 10px", fontSize: 12,
                ...(win === k ? { color: "var(--accent)", borderColor: "var(--accent-border)" } : {}) }}>
              {label}
            </button>
          ))}
        </span>
      </div>
      {windowDays ? (
        <div ref={scrollRef} style={{ overflowX: "auto", overflowY: "hidden", paddingBottom: 4 }}>
          {chart}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>{chart}</ResponsiveContainer>
      )}
      {windowDays && spanDays > windowDays && (
        <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 4 }}>← scroll left to travel back in time</div>
      )}
    </div>
  );
}