// ---------------------------------------------------------------
// Bingo.jsx — "#/bingo": Achievement Bingo.
//
// Each member gets a personal 5×5 card (center FREE) drawn from
// their OWN owned club games — 24 achievements they haven't earned,
// library-scoped like Burndown, so every card is fair by
// construction. Unlocks mark squares automatically: the deal is
// stored in Supabase, but marking is computed live from Steam data
// on every load — no honor system, no cron involvement.
//
// Deal composition per card: 2 rare (<2%), 6 mid (2–8%), 16 common
// (≥8%), shortfalls backfilled from whatever the pool has; max 4
// squares per game so one title can't own the card; the two rarest
// draws land on corners (drama). Provisional (⏳ 0.0%) achievements
// are excluded, consistent with hunts and the hall of fame.
// Members whose eligible pool is under 24 sit the round out — with
// a card too small to bingo, the only move left is to flex. 🏆
//
// One round lives at a time. Deleting a round cascades its cards
// (see migration-v9.sql). Rounds are glory-only for now — bingo
// does not touch the main leaderboard.
// ---------------------------------------------------------------
import { useMemo, useState } from "react";
import { S, fmtDate } from "./ui.jsx";
import { tierOf } from "../lib/stats.js";

// 12 possible lines on a 5×5 board (slot 12 = FREE center)
const LINES = [];
for (let r = 0; r < 5; r++) LINES.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
for (let c = 0; c < 5; c++) LINES.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
LINES.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);

const keyOf = (c) => `${c.appid}|${c.achid}`;
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// ---- the deal: 24 uncompleted achievements from games YOU own ----
export function dealCards(stats, meta) {
  const cards = [], benched = [];
  for (const m of meta.members) {
    const pt = stats.profilesPlaytime?.[m.steamid] ?? {};
    const known = Object.keys(pt).length > 0;   // empty map = fetch failed, not "owns nothing"
    const pool = [];
    for (const g of stats.games) {
      const mine = g.players[m.steamid] || (known && pt[g.appid] !== undefined);
      if (!mine) continue;
      const p = g.players[m.steamid];
      if (p?.complete) continue;
      const have = new Set((p?.unlocks ?? []).map((u) => u.id));
      for (const a of g.ach) {
        if (a.pct <= 0 || have.has(a.id)) continue;   // provisional or already earned
        pool.push({ appid: g.appid, achid: a.id, ach: a.name, game: g.name, pct: a.pct });
      }
    }
    if (pool.length < 24) { benched.push(m.steamid); continue; }

    const rare = shuffle(pool.filter((c) => c.pct < 2));
    const mid = shuffle(pool.filter((c) => c.pct >= 2 && c.pct < 8));
    const common = shuffle(pool.filter((c) => c.pct >= 8));
    const picked = [], counts = new Map();
    const take = (bucket, n, cap = 4) => {
      for (const c of bucket) {
        if (picked.length >= 24 || n <= 0) return;
        if (picked.includes(c) || (counts.get(c.appid) ?? 0) >= cap) continue;
        picked.push(c); counts.set(c.appid, (counts.get(c.appid) ?? 0) + 1); n--;
      }
    };
    take(rare, 2); take(mid, 6); take(common, 16);
    take(shuffle([...pool]), 24 - picked.length);        // backfill, cap held
    take(shuffle([...pool]), 24 - picked.length, 99);    // last resort: cap can make 24 unreachable
    if (picked.length < 24) { benched.push(m.steamid); continue; }

    // rarest two on corners; everything else shuffled into the rest
    picked.sort((a, b) => a.pct - b.pct);
    const [r1, r2, ...rest] = picked;
    const cells = new Array(24);
    const corners = shuffle([0, 4, 19, 23]);             // cell indices of the grid corners
    cells[corners[0]] = r1; cells[corners[1]] = r2;
    const open = shuffle([...Array(24).keys()].filter((i) => cells[i] === undefined));
    shuffle(rest).forEach((c, k) => { cells[open[k]] = c; });
    cards.push({ steamid: m.steamid, cells });
  }
  return { cards, benched };
}

export default function Bingo({ stats, meta, mutate, busy, nav }) {
  const monthLabel = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const [label, setLabel] = useState(monthLabel);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const round = (meta.bingoRounds ?? [])[Math.max(0, (meta.bingoRounds ?? []).length - 1)] ?? null;
  const cards = useMemo(() =>
    (meta.bingoCards ?? []).filter((c) => c.round_id === round?.id), [meta, round]);

  const [spot, setSpot] = useState(meta.members[0]?.steamid ?? "");

  // live marks: sid -> Set("appid|achid") from current Steam data
  const markedOf = useMemo(() => {
    const m = new Map();
    for (const g of stats.games) {
      for (const [sid, r] of Object.entries(g.players)) {
        if (!m.has(sid)) m.set(sid, new Set());
        const s = m.get(sid);
        for (const u of r.unlocks) s.add(`${g.appid}|${u.id}`);
      }
    }
    return m;
  }, [stats]);

  const cardStats = (card) => {
    const s = markedOf.get(card.steamid) ?? new Set();
    const hit = (slot) => slot === 12 || s.has(keyOf(card.cells[slot < 12 ? slot : slot - 1]));
    return {
      lines: LINES.filter((L) => L.every(hit)).length,
      marked: card.cells.filter((c) => s.has(keyOf(c))).length,
    };
  };

  const standings = useMemo(() => cards
    .map((c) => ({ sid: c.steamid, ...cardStats(c) }))
    .map((r) => ({ ...r, blackout: r.marked === 24 }))
    .sort((a, b) => b.lines - a.lines || b.marked - a.marked),
    [cards, markedOf]);   // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = Object.fromEntries(meta.members.map((m) => [m.steamid, m.name]));
  const colorOf = Object.fromEntries(meta.members.map((m) => [m.steamid, m.color]));
  const benchedNow = meta.members.filter((m) => round && !cards.some((c) => c.steamid === m.steamid));
  const card = cards.find((c) => c.steamid === spot);
  const marks = markedOf.get(spot) ?? new Set();

  const deal = async () => {
    const { cards: dealt } = dealCards(stats, meta);
    if (!dealt.length) return;   // mutate's error surface handles server-side; nothing to deal is visible below
    await mutate("dealBingo", { label, cards: dealt },
      (j) => `Dealt ${j.dealt} card${j.dealt > 1 ? "s" : ""} — ${label}. Marks update themselves.`);
  };
  const remove = async () => {
    setConfirmDelete(false);
    await mutate("deleteBingo", { roundId: round.id }, () => "Round deleted — the board forgets.");
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="panel" style={{ ...S.panel, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={S.label}>Bingo</span>
        {round ? (
          <>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{round.label}</span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              dealt {fmtDate(Date.parse(round.created_at) / 1000)} · marks update live from Steam
            </span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {confirmDelete ? (
                <>
                  <button style={{ ...S.btnGhost, color: "var(--err-border)", borderColor: "var(--err-border)" }}
                    disabled={busy} onClick={remove}>Really delete round?</button>
                  <button style={S.btnGhost} onClick={() => setConfirmDelete(false)}>Keep it</button>
                </>
              ) : (
                <button style={S.btnGhost} disabled={busy} onClick={() => setConfirmDelete(true)}>Delete round</button>
              )}
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              25 squares, center free. Every card is drawn from that member's own owned games —
              achievements they haven't earned. Unlocks mark squares automatically. Lines are glory; blackout is legend.
            </span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
              <input style={{ ...S.input, width: 160 }} value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder={monthLabel} />
              <button style={S.btn} disabled={busy} onClick={deal}>Deal the cards</button>
            </span>
          </>
        )}
      </div>

      {round && (
        <div className="panel" style={{ ...S.panel, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <span style={S.label}>Standings</span>
          {standings.map((r, i) => (
            <span key={r.sid} style={{ fontSize: 13, cursor: "pointer" }} onClick={() => setSpot(r.sid)}>
              <span style={{ color: "var(--faint)", fontSize: 11 }}>{i + 1}.</span>{" "}
              <b style={{ color: colorOf[r.sid] }}>{nameOf[r.sid] ?? r.sid}</b>{" "}
              <span style={{ color: "var(--muted)" }}>
                {r.blackout ? "BLACKOUT 🏴" : `${r.lines} line${r.lines === 1 ? "" : "s"} · ${r.marked}/24`}
              </span>
            </span>
          ))}
          {benchedNow.map((m) => (
            <span key={m.steamid} style={{ fontSize: 12, color: "var(--faint)" }}>
              {m.name}: no card — backlog too small to bingo 🏆
            </span>
          ))}
        </div>
      )}

      {round && (
        <div className="panel" style={S.panel}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <div style={S.label}>Card</div>
            <select value={spot} onChange={(e) => setSpot(e.target.value)} style={{ ...S.input, width: "auto" }}>
              {meta.members.map((m) => <option key={m.steamid} value={m.steamid}>{m.name}</option>)}
            </select>
            {card && (() => { const cs = cardStats(card); return (
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {cs.marked}/24 marked · {cs.lines} of 12 lines{cs.marked === 24 ? " · BLACKOUT 🏴" : ""}
              </span>
            ); })()}
          </div>
          {!card ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              No card this round — their eligible backlog was under 24 achievements when the cards were dealt.
              The only move left is to flex. 🏆
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
              {[...Array(25).keys()].map((slot) => {
                if (slot === 12) return (
                  <div key="free" style={{ minHeight: 76, borderRadius: 8, display: "flex", alignItems: "center",
                    justifyContent: "center", background: "var(--header)", border: "1px solid var(--accent-border)",
                    color: "var(--accent)", fontWeight: 700, letterSpacing: 1 }}>★ FREE</div>
                );
                const c = card.cells[slot < 12 ? slot : slot - 1];
                const hit = marks.has(keyOf(c));
                const tier = tierOf(c.pct);
                return (
                  <div key={slot} onClick={() => nav(`/game/${c.appid}`)}
                    title={`${c.ach} — ${c.game} (${c.pct.toFixed(1)}% of players)`}
                    style={{ minHeight: 76, borderRadius: 8, padding: "6px 8px", cursor: "pointer",
                      background: hit ? "var(--header)" : "var(--chip)",
                      border: `1px solid ${hit ? "var(--accent-border)" : "var(--border)"}`,
                      opacity: hit ? 1 : 0.9, overflow: "hidden" }}>
                    <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 10, color: "var(--faint)" }}>
                      <span style={{ width: 7, height: 7, borderRadius: 4, background: tier.color, flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.game}</span>
                    </div>
                    <div style={{ fontSize: 12, marginTop: 3, lineHeight: 1.25,
                      color: hit ? "var(--accent)" : "var(--ink)", fontWeight: hit ? 600 : 400 }}>
                      {hit ? "✓ " : ""}{c.ach}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 10 }}>
            Bingo is glory-only for now — it doesn't touch the main leaderboard. Squares link to their game.
          </div>
        </div>
      )}
    </div>
  );
}
