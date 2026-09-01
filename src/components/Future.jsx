// ---------------------------------------------------------------
// Future.jsx — the burndown calendar (v14, tweaked v15).
//
// Each member drags their unfinished games into a desired completion
// order, sets a weekday/weekend play pace, and the page projects the
// whole queue forward: the active game's remaining POINTS burn at
// pool ÷ effectiveHours per hour ("points share of median" — earning
// points is what shrinks the estimate, not logging hours), hit zero,
// completions tick up one, and the line jumps to the next game's
// total. Rendered three ways: a sawtooth chart (split into half-year
// panels when the plan runs long, each game planting its poster at
// the top of its run, completions stepping up from the member's
// CURRENT perfect count), a month calendar (cells tinted by game,
// points left + a draining progress bar, denominators in tooltips),
// and a per-game schedule with X / pool pts · N of M achievements.
//
// The projection re-anchors to TODAY on every load — it's a rolling
// forecast from live data, not a schedule that remembers itself.
// Colors are pickable per game (queue.color, v15; null = palette).
// ---------------------------------------------------------------
import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Customized } from "recharts";
import { S, Slider } from "./ui.jsx";
import { chartInk } from "../lib/themes.js";
import { projectQueue, chartChunks } from "../lib/stats.js";

// default palette: queue slot i keeps color i unless the game has a
// picked color — chart, calendar, and schedule all read colorOf.
const PALETTE = ["#5CB8A6", "#E0824B", "#7A9CE0", "#E05B8B", "#9CCB5A", "#C77DDB",
  "#E0C356", "#56BEDB", "#E06B5B", "#6BD8A8", "#DB86B0", "#8E9FE8"];
const hexA = (hex, a) => `${hex}${a}`;
const hexOk = (c) => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);

const DAY = 86400000;
const fmtD = (t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtDY = (t) => {
  const d = new Date(t);
  const opts = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
};
const fmtMY = (t) => new Date(t).toLocaleDateString(undefined, { month: "short", year: "numeric" });
const fmtH = (h) => (h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`);
const addMonths = (t, n) => { const d = new Date(t); d.setMonth(d.getMonth() + n); return d.getTime(); };
// ≈ achievements left when v of ptsLeft0 points remain (points burn
// linearly; WHICH achievements land when is unknowable — hence the ≈)
const achApprox = (v, ptsLeft0, achLeft0) =>
  v <= 0 ? 0 : Math.max(1, Math.round((achLeft0 * v) / ptsLeft0));

const POSTER = { w: 26, h: 39 };
const posterUrls = (appid, override) => [
  ...(override ? [override] : []),
  `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/library_600x900.jpg`,
  `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/header.jpg`,
];

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

// SVG poster planted on the chart (fallback chain like Thumb)
function SvgPoster({ x, y, urls, stroke, title }) {
  const [i, setI] = useState(0);
  if (i >= urls.length) return null;
  return (
    <g>
      <image href={urls[i]} x={x} y={y} width={POSTER.w} height={POSTER.h}
        preserveAspectRatio="xMidYMid slice" onError={() => setI(i + 1)}>
        {title ? <title>{title}</title> : null}
      </image>
      <rect x={x} y={y} width={POSTER.w} height={POSTER.h} fill="none" stroke={stroke} strokeWidth={1.5} rx={3} />
    </g>
  );
}

// Customized layer: one poster at each game's segment start (or at the
// panel's left edge for a game carried over a panel boundary).
function PostersLayer({ posters, coverOf, colorOf, xAxisMap, yAxisMap, offset }) {
  const xs = Object.values(xAxisMap ?? {})[0]?.scale;
  const yAx = (yAxisMap ?? {})["pts"] ?? Object.values(yAxisMap ?? {})[0];
  const ys = yAx?.scale;
  if (!xs || !ys || !offset) return null;
  return (
    <g>
      {posters.map((p) => {
        let px = xs(p.t) + 4;
        px = Math.max(offset.left + 2, Math.min(px, offset.left + offset.width - POSTER.w - 2));
        let py = ys(p.pts) - POSTER.h - 6;
        py = Math.max(offset.top + 2, py);
        return <SvgPoster key={`${p.appid}-${p.t}`} x={px} y={py}
          urls={posterUrls(p.appid, coverOf[p.appid])} stroke={colorOf[p.appid] ?? "#888"} title={p.name} />;
      })}
    </g>
  );
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
  const serverRows = useMemo(() =>
    (meta.queue ?? []).filter((q) => q.steamid === spot).sort((a, b) => a.position - b.position),
    [meta.queue, spot]);
  const serverQ = useMemo(() => serverRows.map((q) => Number(q.appid)), [serverRows]);
  const serverColors = useMemo(() =>
    Object.fromEntries(serverRows.filter((q) => hexOk(q.color)).map((q) => [Number(q.appid), q.color])),
    [serverRows]);
  const qKey = serverQ.join(",");
  const colorKeyOf = (ids, m) => ids.map((id) => (hexOk(m[id]) ? m[id].toLowerCase() : "")).join(",");
  const serverWd = Number(member?.play_weekday ?? 2);
  const serverWe = Number(member?.play_weekend ?? 4);

  const [draft, setDraft] = useState(serverQ);
  const [colors, setColors] = useState(serverColors);
  const [wd, setWd] = useState(serverWd);
  const [we, setWe] = useState(serverWe);
  const [drag, setDrag] = useState(null);
  const serverColorKey = colorKeyOf(serverQ, serverColors);
  useEffect(() => { setDraft(serverQ); setColors(serverColors); setWd(serverWd); setWe(serverWe); setDrag(null); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spot, qKey, serverColorKey, serverWd, serverWe]);   // reseed on member switch or external change
  const dirty = draft.join(",") !== qKey || colorKeyOf(draft, colors) !== colorKeyOf(draft, serverColors)
    || wd !== serverWd || we !== serverWe;

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
      achLeft: r.p.missing.length, achTotal: r.g.ach.length,
    }));
    return projectQueue({ entries, weekday: wd, weekend: we });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.join(","), wd, we, spot, stats.games]);

  const colorOf = useMemo(() =>
    Object.fromEntries(draft.map((id, i) => [id, hexOk(colors[id]) ? colors[id] : PALETTE[i % PALETTE.length]])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft.join(","), colors]);

  // the completions step starts at the member's CURRENT perfect count
  const basePerfects = useMemo(() =>
    stats.games.filter((g) => g.players[spot]?.complete).length, [stats.games, spot]);

  const byKey = useMemo(() =>
    Object.fromEntries(proj.perGame.map((g) => [`g${g.appid}`, g])), [proj]);

  // ---- chart panels: one chart <= ~7 months, else half-year splits ----
  const chunks = useMemo(() =>
    chartChunks(proj, basePerfects).map((c) => ({ ...c, label: `${fmtMY(c.a)} \u2014 ${fmtMY(c.b)}` })),
    [proj, basePerfects]);

  const yMax = useMemo(() => {
    const m = Math.max(10, ...proj.perGame.map((g) => g.ptsLeft));
    return m > 200 ? Math.ceil(m / 100) * 100 : Math.ceil(m / 20) * 20;
  }, [proj]);
  const doneMax = basePerfects + proj.completions.length;

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
  // start-of-projection facts per queued game, for tooltips/denominators
  const infoOf = useMemo(() => Object.fromEntries(proj.perGame.map((g) => [g.appid, g])), [proj]);

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
    await mutate("saveFuture", {
      steamid: spot, appids: draft, weekday: wd, weekend: we,
      colors: Object.fromEntries(draft.map((id) => [id, hexOk(colors[id]) ? colors[id] : null])),
    }, () => "Future locked in — the calendar is law 📅");
  }

  const miniBtn = { ...S.btnGhost, padding: "2px 8px", fontSize: 12, lineHeight: 1.4 };
  const gameLink = (appid, name, strike = false) => (
    <span style={{ ...S.link, color: "var(--ink)", fontWeight: 600, fontSize: 13,
      textDecoration: strike ? "line-through" : "none", opacity: strike ? 0.7 : 1 }}
      onClick={() => nav(`/game/${appid}`)}>{name}</span>
  );
  const tooltipFmt = (v, name, item) => {
    const g = byKey[item?.dataKey];
    if (g) return [`${v.toLocaleString()} / ${g.pool.toLocaleString()} pts · ≈${achApprox(v, g.ptsLeft, g.achLeft)} of ${g.achTotal} ach`, g.name];
    if (item?.dataKey === "done") return [v, "Total 100%s"];
    return [v, name];
  };

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
              {lastT && !proj.truncated && <> · all done <b style={{ color: "var(--accent)" }}>{fmtDY(lastT)}</b> ({basePerfects} → {doneMax} perfects)</>}
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

      {/* ---- sawtooth (one panel, or half-year panels for long plans) ---- */}
      {chunks.length > 0 && !proj.idle && (
        <div className="panel" style={S.panel}>
          <div style={{ ...S.label, marginBottom: 12 }}>The burndown — points left in the game you're on</div>
          <div style={{ display: "grid", gap: 18 }}>
            {chunks.map((ch) => (
              <div key={ch.a}>
                {chunks.length > 1 && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 4 }}>{ch.label}</div>
                )}
                <ResponsiveContainer width="100%" height={chunks.length > 1 ? 230 : 280}>
                  <LineChart data={ch.rows}>
                    <CartesianGrid stroke={ink.grid} vertical={false} />
                    <XAxis dataKey="t" type="number" domain={[ch.a, ch.b]} scale="linear"
                      ticks={ch.ticks} stroke={ink.axis} fontSize={11} tickFormatter={fmtD} />
                    <YAxis yAxisId="pts" domain={[0, yMax]} stroke={ink.axis} fontSize={11}
                      tickFormatter={(v) => v.toLocaleString()} />
                    <YAxis yAxisId="done" orientation="right" domain={[basePerfects, Math.max(doneMax, basePerfects + 1)]}
                      stroke={ink.axis} fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "var(--header)", border: "1px solid var(--border)", borderRadius: 8 }}
                      labelFormatter={fmtDY} formatter={tooltipFmt} />
                    {proj.perGame.map((g) => (
                      <Line key={g.appid} yAxisId="pts" type="linear" dataKey={`g${g.appid}`} name={g.name}
                        stroke={colorOf[g.appid]} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                    ))}
                    <Line yAxisId="done" type="stepAfter" dataKey="done" name="Total 100%s"
                      stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="5 4" dot={false}
                      connectNulls isAnimationActive={false} />
                    <Customized component={(cp) => (
                      <PostersLayer {...cp} posters={ch.posters} coverOf={coverOf} colorOf={colorOf} />
                    )} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 8 }}>
            Each colored run is one game burning to zero, its poster planted at the top. The dashed step
            (right axis) is your <b>total</b> 100% count — it starts at today's {basePerfects} and climbs at
            each 🏁. Flat stretches are rest days.{chunks.length > 1 && <> Long plan → one panel per half-year,
            same scale on every panel.</>}
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
                    const info = !c.off && c.appid ? infoOf[c.appid] : null;
                    const lastDone = nDone ? infoOf[c.done[nDone - 1]] : null;
                    const tint = info ? hexA(colorOf[c.appid] ?? "#888888", "2E")
                      : lastDone ? hexA(colorOf[lastDone.appid] ?? "#888888", "2E") : "transparent";
                    const title = c.off ? fmtDY(c.t)
                      : nDone ? `${fmtDY(c.t)} — 🏁 ${c.done.map((a) => infoOf[a]?.name ?? a).join(" + ")} done!`
                      : info ? `${fmtDY(c.t)} — ${info.name}: ${c.ptsEnd.toLocaleString()} of ${info.pool.toLocaleString()} pts left (≈${achApprox(c.ptsEnd, info.ptsLeft, info.achLeft)} of ${info.achTotal} ach)`
                      : fmtDY(c.t);
                    return (
                      <div key={c.t} title={title} style={{
                        minHeight: 48, borderRadius: 6, padding: "3px 4px", fontSize: 10,
                        background: tint,
                        border: c.t === todayT ? "1px solid var(--accent)" : "1px solid transparent",
                        opacity: c.off ? 0.35 : c.rest && !nDone ? 0.55 : 1,
                        display: "flex", flexDirection: "column",
                      }}>
                        <div style={{ color: "var(--muted)" }}>{new Date(c.t).getDate()}</div>
                        {nDone > 0
                          ? <div style={{ fontSize: 12 }}>🏁{nDone > 1 ? `×${nDone}` : ""}</div>
                          : info
                            ? <div style={{ color: "var(--ink)", fontWeight: 600 }}>{c.ptsEnd.toLocaleString()}</div>
                            : null}
                        {info && (
                          <div style={{ marginTop: "auto", height: 3, background: "var(--chip)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: `${Math.max(2, Math.round((c.ptsEnd / info.pool) * 100))}%`,
                              height: 3, background: colorOf[c.appid], borderRadius: 2 }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 8 }}>
            Each day is tinted by the game you're burning: the number is points left at day's end, the little
            bar is how much of that game's whole pool remains, and hovering a day gives the full
            "X of Y pts · ≈N of M achievements" story. 🏁 = a projected 100%. Dimmed days are rest days.
            {cal.hidden > 0 && <> Showing the first 6 months — the plan runs {cal.hidden} more.</>}
          </div>
        </div>
      )}

      {/* ---- schedule ---- */}
      {proj.perGame.length > 0 && !proj.idle && (
        <div className="panel" style={S.panel}>
          <div style={{ ...S.label, marginBottom: 12 }}>The schedule</div>
          <div style={{ display: "grid", gap: 8 }}>
            {proj.perGame.map((g) => (
              <div key={g.appid} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: colorOf[g.appid], flex: "0 0 auto" }} />
                <Thumb key={`t${g.appid}`} appid={g.appid} override={coverOf[g.appid]} />
                <span style={{ flex: "1 1 140px", minWidth: 0 }}>{gameLink(g.appid, g.name)}</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {g.ptsLeft.toLocaleString()} / {g.pool.toLocaleString()} pts · {g.achLeft} of {g.achTotal} ach · ~{fmtH(g.estHours)}
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
          Top of the list burns first. Arrows work too (phones can't drag). Tap a game's swatch to pick its color.
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
              <input type="color" value={colorOf[r.appid]} title="Pick this game's color"
                onChange={(e) => setColors({ ...colors, [r.appid]: e.target.value })}
                style={{ width: 24, height: 24, padding: 0, border: "1px solid var(--border2)",
                  borderRadius: 6, background: "none", cursor: "pointer", flex: "0 0 auto" }} />
              <Thumb key={`t${r.appid}`} appid={r.appid} override={coverOf[r.appid]} />
              <span style={{ flex: "1 1 120px", minWidth: 0 }}>
                {gameLink(r.appid, r.g?.name ?? `App ${r.appid}`, r.skip === "done")}
              </span>
              <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                {r.skip === "done" ? "✓ done" : r.skip === "unrated" ? "⏱ no hours" : r.skip === "gone" ? "gone"
                  : <>{r.ptsLeft.toLocaleString()} / {r.g.pool.toLocaleString()} pts · ~{fmtH((r.g.hours * r.ptsLeft) / r.g.pool)}</>}
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
                  : <>{r.ptsLeft.toLocaleString()} / {r.g.pool.toLocaleString()} pts · ~{fmtH(r.estHours)}</>}
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
