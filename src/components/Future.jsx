// ---------------------------------------------------------------
// Future.jsx — the burndown calendar (v14).
//
// Each member drags their unfinished games into a desired completion
// order, sets a weekday/weekend play pace, and the page projects the
// whole queue forward: the active game's remaining POINTS burn at
// pool ÷ effectiveHours per hour ("points share of median" — earning
// points is what shrinks the estimate, not logging hours), hit zero,
// completions tick up one, and the line jumps to the next game's
// total. Rendered three ways: a sawtooth chart, a month calendar,
// and a per-game schedule with projected finish dates.
//
// The projection reacts LIVE to slider/queue edits (draft state);
// Save persists via the saveFuture op (queue rows + pace columns,
// migration-v14). Unrated games (⏱ no hours yet) and games finished
// since queuing are skipped, visibly, so the timeline never guesses.
// ---------------------------------------------------------------
import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { S, Slider } from "./ui.jsx";
import { chartInk } from "../lib/themes.js";
import { projectQueue } from "../lib/stats.js";

// fixed palette (theme-agnostic): queue slot i keeps color i across
// the chart, the calendar and the schedule, so all three read as one.
const PALETTE = ["#5CB8A6", "#E0824B", "#7A9CE0", "#E05B8B", "#9CCB5A", "#C77DDB",
  "#E0C356", "#56BEDB", "#E06B5B", "#6BD8A8", "#DB86B0", "#8E9FE8"];
const hexA = (hex, a) => `${hex}${a}`;

const fmtD = (t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtDY = (t) => {
  const d = new Date(t);
  const opts = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
};
const fmtH = (h) => (h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`);

function Thumb({ appid, override }) {
  const [i, setI] = useState(0);
  const urls = [
    ...(override ? [override] : []),
    `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/capsule_231x87.jpg`,
    `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/header.jpg`,
  ];
  if (i >= urls.length) return <div style={{ width: 56, height: 24, background: "var(--chip)", borderRadius: 4, flex: "0 0 auto" }} />;
  return <img src={urls[i]} alt="" loading="lazy" onError={() => setI(i + 1)}
    style={{ width: 56, height: 24, objectFit: "cover", borderRadius: 4, display: "block", flex: "0 0 auto" }} />;
}

const move = (arr, from, to) => {
  const out = [...arr];
  out.splice(to, 0, out.splice(from, 1)[0]);
  return out;
};

export default function Future({ stats, meta, mutate, busy, nav }) {
  const ink = chartInk();
  const members = meta.members ?? [];
  const [spot, setSpot] = useState(members[0]?.steamid ?? "");
  useEffect(() => {
    if (members.length && !members.some((m) => m.steamid === spot)) setSpot(members[0].steamid);
  }, [members, spot]);
  const member = members.find((m) => m.steamid === spot);

  const coverOf = useMemo(() =>
    Object.fromEntries((meta.covers ?? []).map((cv) => [Number(cv.appid), cv.url])), [meta.covers]);
  // stats.byId is MEMBERS by steamid — games need their own lookup
  const gameById = useMemo(() =>
    Object.fromEntries(stats.games.map((g) => [Number(g.appid), g])), [stats.games]);

  // ---- server truth vs. draft ----
  const serverQ = useMemo(() =>
    (meta.queue ?? []).filter((q) => q.steamid === spot)
      .sort((a, b) => a.position - b.position).map((q) => Number(q.appid)), [meta.queue, spot]);
  const qKey = serverQ.join(",");
  const serverWd = Number(member?.play_weekday ?? 2);
  const serverWe = Number(member?.play_weekend ?? 4);

  const [draft, setDraft] = useState(serverQ);
  const [wd, setWd] = useState(serverWd);
  const [we, setWe] = useState(serverWe);
  const [drag, setDrag] = useState(null);
  useEffect(() => { setDraft(serverQ); setWd(serverWd); setWe(serverWe); setDrag(null); },
    [spot, qKey, serverWd, serverWe]);   // reseed on member switch or external change
  const dirty = draft.join(",") !== qKey || wd !== serverWd || we !== serverWe;

  // ---- rows for everything drafted (editor shows all; projection filters) ----
  const qRows = draft.map((appid) => {
    const g = gameById[appid];
    const p = g?.players?.[spot];
    const ptsLeft = g && p ? Math.max(0, Math.round(g.pool - p.basePoints)) : 0;
    const skip = !g ? "gone" : !p ? "gone" : (p.complete || ptsLeft <= 0) ? "done" : g.unrated ? "unrated" : null;
    return { appid, g, p, ptsLeft, skip };
  });

  const proj = useMemo(() => {
    const entries = qRows.filter((r) => !r.skip).map((r) => ({
      appid: r.appid, name: r.g.name, ptsLeft: r.ptsLeft, pool: r.g.pool, effHours: r.g.hours,
    }));
    return projectQueue({ entries, weekday: wd, weekend: we });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.join(","), wd, we, spot, stats.games]);

  const colorOf = useMemo(() =>
    Object.fromEntries(draft.map((id, i) => [id, PALETTE[i % PALETTE.length]])), [draft.join(",")]);

  // ---- chart rows: per-game sawtooth segments + the completions step ----
  const chartRows = useMemo(() => {
    const rows = [];
    for (const g of proj.perGame)
      for (const pt of g.series) rows.push({ t: pt.t, [`g${g.appid}`]: Math.round(pt.pts) });
    if (proj.days.length) rows.push({ t: proj.days[0].t, done: 0 });
    for (const c of proj.completions) rows.push({ t: c.t, done: c.count });
    return rows.sort((a, b) => a.t - b.t);
  }, [proj]);

  // ---- calendar months (Monday-first), capped at 6 on screen ----
  const cal = useMemo(() => {
    if (!proj.days.length) return { months: [], hidden: 0 };
    const byT = Object.fromEntries(proj.days.map((d) => [d.t, d]));
    const first = new Date(proj.days[0].t);
    const last = new Date(proj.days[proj.days.length - 1].t);
    const total = (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth()) + 1;
    const months = [];
    for (let k = 0; k < Math.min(total, 6); k++) {
      const y = first.getFullYear(), m0 = first.getMonth() + k;
      const monthStart = new Date(y, m0, 1);
      const nDays = new Date(y, m0 + 1, 0).getDate();
      months.push({
        label: monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        lead: (monthStart.getDay() + 6) % 7,
        cells: Array.from({ length: nDays }, (_, i) => {
          const t = new Date(y, m0, i + 1).getTime();
          return byT[t] ?? { t, off: true };
        }),
      });
    }
    return { months, hidden: Math.max(0, total - 6) };
  }, [proj]);

  const todayT = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);

  // ---- the bench: owned, unfinished, not yet queued ----
  const bench = useMemo(() => stats.games
    .filter((g) => g.players[spot] && !g.players[spot].complete && !draft.includes(Number(g.appid)))
    .map((g) => {
      const ptsLeft = Math.max(0, Math.round(g.pool - g.players[spot].basePoints));
      return { appid: Number(g.appid), g, ptsLeft,
        estHours: g.unrated || ptsLeft <= 0 ? null : (g.hours * ptsLeft) / g.pool };
    })
    .filter((r) => r.ptsLeft > 0 || r.g.unrated)
    .sort((a, b) => (a.estHours ?? 1e9) - (b.estHours ?? 1e9)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stats.games, spot, draft.join(",")]);

  const finished = proj.perGame.filter((g) => g.endT);
  const lastT = finished.length ? finished[finished.length - 1].endT : null;
  const totalH = proj.perGame.reduce((s, g) => s + g.estHours, 0);
  const skipped = qRows.filter((r) => r.skip);

  async function save() {
    await mutate("saveFuture", { steamid: spot, appids: draft, weekday: wd, weekend: we },
      () => "Future locked in — the calendar is law 📅");
  }

  const miniBtn = { ...S.btnGhost, padding: "2px 8px", fontSize: 12, lineHeight: 1.4 };
  const gameLink = (appid, name, strike = false) => (
    <span style={{ ...S.link, color: "var(--ink)", fontWeight: 600, fontSize: 13,
      textDecoration: strike ? "line-through" : "none", opacity: strike ? 0.7 : 1 }}
      onClick={() => nav(`/game/${appid}`)}>{name}</span>
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* ---- header ---- */}
      <div className="panel" style={{ ...S.panel, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={S.label}>Future</span>
        <select value={spot} onChange={(e) => setSpot(e.target.value)} style={{ ...S.input, width: "auto" }}>
          {members.map((m) => <option key={m.steamid} value={m.steamid}>{m.name}</option>)}
        </select>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          {proj.perGame.length
            ? <>{proj.perGame.length} game{proj.perGame.length === 1 ? "" : "s"} queued · ~{fmtH(totalH)} of burning
              {lastT && !proj.truncated && <> · all done <b style={{ color: "var(--accent)" }}>{fmtDY(lastT)}</b></>}
              {proj.truncated && <> · runs past the 2-year horizon</>}</>
            : "Queue up some games below and watch the calendar fill in."}
        </span>
        {dirty && (
          <button style={{ ...S.btn, marginLeft: "auto" }} disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        )}
      </div>

      {/* ---- pace ---- */}
      <div className="panel" style={S.panel}>
        <div style={{ ...S.label, marginBottom: 12 }}>Play pace — the projection reacts live</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 24px" }}>
          <Slider label="Weekday hours" value={wd} min={0} max={12} step={0.5} onChange={setWd} fmt={(v) => `${v}h / day`} />
          <Slider label="Weekend hours" value={we} min={0} max={16} step={0.5} onChange={setWe} fmt={(v) => `${v}h / day`} />
        </div>
        {proj.idle && (
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Both paces are zero — at 0 hours a day, the future is a flat line. Give yourself some playtime.
          </div>
        )}
      </div>

      {/* ---- sawtooth ---- */}
      {proj.perGame.length > 0 && !proj.idle && (
        <div className="panel" style={S.panel}>
          <div style={{ ...S.label, marginBottom: 12 }}>The burndown — points left in the game you're on</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartRows}>
              <CartesianGrid stroke={ink.grid} vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="linear"
                stroke={ink.axis} fontSize={11} tickFormatter={fmtD} tickCount={7} />
              <YAxis yAxisId="pts" stroke={ink.axis} fontSize={11} tickFormatter={(v) => v.toLocaleString()} />
              <YAxis yAxisId="done" orientation="right" stroke={ink.axis} fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--header)", border: "1px solid var(--border)", borderRadius: 8 }}
                labelFormatter={fmtDY}
                formatter={(v, name) => [typeof v === "number" ? v.toLocaleString() : v, name]} />
              {proj.perGame.map((g) => (
                <Line key={g.appid} yAxisId="pts" type="linear" dataKey={`g${g.appid}`} name={g.name}
                  stroke={colorOf[g.appid]} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
              ))}
              <Line yAxisId="done" type="stepAfter" dataKey="done" name="Completed"
                stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="5 4" dot={false}
                connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 8 }}>
            Each colored run is one game burning to zero; the dashed step (right axis) is your completed
            count going up one at each 🏁. Flat stretches are rest days.
          </div>
        </div>
      )}

      {/* ---- calendar ---- */}
      {cal.months.length > 0 && !proj.idle && (
        <div className="panel" style={S.panel}>
          <div style={{ ...S.label, marginBottom: 12 }}>The calendar</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
            {cal.months.map((mo) => (
              <div key={mo.label}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{mo.label}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
                  {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
                    <div key={d} style={{ fontSize: 9, color: "var(--faint)", textAlign: "center" }}>{d}</div>
                  ))}
                  {Array.from({ length: mo.lead }, (_, i) => <div key={`b${i}`} />)}
                  {mo.cells.map((c) => {
                    const nDone = c.done?.length ?? 0;
                    const tint = !c.off && c.appid ? hexA(colorOf[c.appid] ?? "#888888", "2E")
                      : nDone ? hexA(colorOf[c.done[nDone - 1]] ?? "#888888", "2E") : "transparent";
                    return (
                      <div key={c.t} title={fmtDY(c.t)} style={{
                        minHeight: 44, borderRadius: 6, padding: "3px 4px", fontSize: 10,
                        background: tint,
                        border: c.t === todayT ? "1px solid var(--accent)" : "1px solid transparent",
                        opacity: c.off ? 0.35 : c.rest && !nDone ? 0.55 : 1,
                      }}>
                        <div style={{ color: "var(--muted)" }}>{new Date(c.t).getDate()}</div>
                        {nDone > 0
                          ? <div style={{ fontSize: 12 }}>🏁{nDone > 1 ? `×${nDone}` : ""}</div>
                          : !c.off && c.appid
                            ? <div style={{ color: "var(--ink)", fontWeight: 600 }}>{c.ptsEnd.toLocaleString()}</div>
                            : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 8 }}>
            Each day is tinted by the game you're burning, with the points left at day's end. 🏁 = a
            projected 100%. Dimmed days are rest days.
            {cal.hidden > 0 && <> Showing the first 6 months — the plan runs {cal.hidden} more.</>}
          </div>
        </div>
      )}

      {/* ---- schedule ---- */}
      {proj.perGame.length > 0 && !proj.idle && (
        <div className="panel" style={S.panel}>
          <div style={{ ...S.label, marginBottom: 12 }}>The schedule</div>
          <div style={{ display: "grid", gap: 8 }}>
            {proj.perGame.map((g, i) => (
              <div key={g.appid} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: colorOf[g.appid], flex: "0 0 auto" }} />
                <Thumb key={`t${g.appid}`} appid={g.appid} override={coverOf[g.appid]} />
                <span style={{ flex: "1 1 140px", minWidth: 0 }}>{gameLink(g.appid, g.name)}</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {g.ptsLeft.toLocaleString()} pts · ~{fmtH(g.estHours)}
                </span>
                <span style={{ fontSize: 12, color: "var(--muted)", width: 170, textAlign: "right" }}>
                  {fmtD(g.startT)} → {g.endT
                    ? <b style={{ color: "var(--accent)" }}>{fmtDY(g.endT)} 🏁</b>
                    : <span title="past the 2-year horizon">beyond the horizon</span>}
                </span>
              </div>
            ))}
            {skipped.map((r) => (
              <div key={r.appid} style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.6 }}>
                <span style={{ width: 10, height: 10, flex: "0 0 auto" }} />
                <Thumb key={`t${r.appid}`} appid={r.appid} override={coverOf[r.appid]} />
                <span style={{ flex: "1 1 140px" }}>{gameLink(r.appid, r.g?.name ?? `App ${r.appid}`, r.skip === "done")}</span>
                <span style={{ fontSize: 12, color: "var(--faint)" }}>
                  {r.skip === "done" ? "✓ already done — skipped"
                    : r.skip === "unrated" ? "⏱ needs hours (Settings) — skipped"
                    : "no longer in the library — skipped"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- queue editor + bench ---- */}
      <div className="panel" style={S.panel}>
        <div style={{ ...S.label, marginBottom: 4 }}>The queue — drag to reorder</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
          Top of the list burns first. Arrows work too (phones can't drag).
        </div>
        <div style={{ display: "grid", gap: 2 }}>
          {qRows.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Nothing queued yet — pull games up from the bench below.
            </div>
          )}
          {qRows.map((r, i) => (
            <div key={r.appid} draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => { e.preventDefault(); if (drag !== null && drag !== i) { setDraft(move(draft, drag, i)); setDrag(i); } }}
              onDragEnd={() => setDrag(null)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 8,
                background: drag === i ? "var(--chip)" : "transparent",
                opacity: r.skip ? 0.55 : 1, cursor: "grab" }}>
              <span style={{ color: "var(--faint)", cursor: "grab" }}>≡</span>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: r.skip ? "var(--chip)" : colorOf[r.appid], flex: "0 0 auto" }} />
              <Thumb key={`t${r.appid}`} appid={r.appid} override={coverOf[r.appid]} />
              <span style={{ flex: "1 1 120px", minWidth: 0 }}>
                {gameLink(r.appid, r.g?.name ?? `App ${r.appid}`, r.skip === "done")}
              </span>
              <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                {r.skip === "done" ? "✓ done" : r.skip === "unrated" ? "⏱ no hours" : r.skip === "gone" ? "gone"
                  : <>{r.ptsLeft.toLocaleString()} pts · ~{fmtH((r.g.hours * r.ptsLeft) / r.g.pool)}</>}
              </span>
              <button style={miniBtn} disabled={i === 0} onClick={() => setDraft(move(draft, i, i - 1))}>▲</button>
              <button style={miniBtn} disabled={i === qRows.length - 1} onClick={() => setDraft(move(draft, i, i + 1))}>▼</button>
              <button style={miniBtn} onClick={() => setDraft(draft.filter((a) => a !== r.appid))}>✕</button>
            </div>
          ))}
        </div>

        <div style={{ ...S.label, margin: "18px 0 4px" }}>The bench — quickest wins first</div>
        {bench.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Nothing on the bench — every unfinished game {member?.name ?? "this member"} owns is queued. 👑
          </div>
        )}
        <div style={{ display: "grid", gap: 2 }}>
          {bench.map((r) => (
            <div key={r.appid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px" }}>
              <button style={miniBtn} disabled={busy} onClick={() => setDraft([...draft, r.appid])}>+ queue</button>
              <Thumb key={`t${r.appid}`} appid={r.appid} override={coverOf[r.appid]} />
              <span style={{ flex: "1 1 120px", minWidth: 0 }}>{gameLink(r.appid, r.g.name)}</span>
              <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                {r.estHours == null
                  ? <span title="set median hours in Settings to project this one">⏱ no hours</span>
                  : <>{r.ptsLeft.toLocaleString()} pts · ~{fmtH(r.estHours)}</>}
              </span>
            </div>
          ))}
        </div>
        {dirty && (
          <button style={{ ...S.btn, marginTop: 14 }} disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        )}
      </div>
    </div>
  );
}
