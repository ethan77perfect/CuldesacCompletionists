import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { S, TierChip, fmtDays, fmtDate } from "./ui.jsx";

export default function StatsPage({ stats, nav }) {
  const { records, hallOfFame, graveyard, byId, scatter, board } = stats;
  const name = (sid) => byId[sid]?.name ?? "?";
  const color = (sid) => byId[sid]?.color ?? "#8FA3BF";

  const recordRows = [
    records.fastest && ["Fastest 100%", `${name(records.fastest.sid)} — ${records.fastest.name} in ${fmtDays(records.fastest.days)}`],
    records.longest && ["Longest journey", `${name(records.longest.sid)} — ${records.longest.name} over ${fmtDays(records.longest.days)}`],
    records.bestDay && ["Most unlocks in a day", `${name(records.bestDay.sid)} — ${records.bestDay.count} on ${records.bestDay.date}`],
    records.firstPerfect && ["First perfect in club history", `${name(records.firstPerfect.sid)} — ${records.firstPerfect.gameName}, ${fmtDate(records.firstPerfect.t)}`],
    records.biggestUnlock && ["Biggest single haul", `${name(records.biggestUnlock.sid)} — ${records.biggestUnlock.achName} (+${Math.round(records.biggestUnlock.pts)} pts)`],
  ].filter(Boolean);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 12 }}>Club records</div>
          {recordRows.length === 0 && <p style={{ color: "#8FA3BF", fontSize: 13 }}>Records are earned, not given.</p>}
          {recordRows.map(([l, v]) => (
            <div key={l} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "#8FA3BF" }}>{l}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 12 }}>Hall of fame — rarest unlocks</div>
          <div style={{ display: "grid", gap: 8, maxHeight: 300, overflowY: "auto", paddingRight: 4 }}>
            {hallOfFame.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                <span style={{ color: "#44506A", width: 20 }}>{i + 1}.</span>
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

      <div style={S.panel}>
        <div style={{ ...S.label, marginBottom: 12 }}>Every unlock, by date and rarity — hard-earned sinks lower</div>
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="#232D40" />
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} stroke="#8FA3BF" fontSize={11}
              tickFormatter={(t) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", year: "2-digit" })} />
            <YAxis dataKey="pct" type="number" scale="log" domain={[0.05, 100]} stroke="#8FA3BF" fontSize={11}
              tickFormatter={(v) => `${v}%`} reversed />
            <ZAxis range={[24, 24]} />
            <Tooltip contentStyle={{ background: "#111828", border: "1px solid #232D40", borderRadius: 8 }}
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
        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 12 }}>Completion velocity</div>
          {board.map((p) => (
            <div key={p.steamid} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
              <b style={{ color: p.color }}>{p.name}</b>
              <span style={{ color: "#8FA3BF" }}>
                {p.avgSpanDays != null ? `avg ${fmtDays(p.avgSpanDays)} to 100%` : "no completions yet"} · closes {Math.round(p.closerRate * 100)}% of what they start
              </span>
            </div>
          ))}
        </div>

        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 12 }}>The graveyard 🪦 — untouched 6+ months</div>
          {graveyard.length === 0 && <p style={{ color: "#8FA3BF", fontSize: 13 }}>Empty. The club leaves no game behind.</p>}
          <div style={{ display: "grid", gap: 8, maxHeight: 260, overflowY: "auto", paddingRight: 4 }}>
            {graveyard.map((g, i) => (
              <div key={i} style={{ fontSize: 13 }}>
                <b style={{ color: color(g.sid) }}>{name(g.sid)}</b> abandoned{" "}
                <a style={S.link} onClick={() => nav(`/game/${g.appid}`)}>{g.name}</a>{" "}
                <span style={{ color: "#8FA3BF" }}>at {g.pct}%, {g.daysDead} days ago</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
