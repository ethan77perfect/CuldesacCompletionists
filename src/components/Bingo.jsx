// ---------------------------------------------------------------
// Bingo.jsx — "#/bingo": Achievement Bingo.
//
// Each member gets a personal 5×5 card (center FREE) drawn from just
// CARD_GAMES of their OWN owned club games — 24 achievements they
// haven't earned, so a card is chased in a handful of installs, not
// a dozen. Game pick is difficulty-balanced (≤1 bruiser, ≥1 comfort
// game when the library has one); rarity bands (2 rare / 6 mid /
// 16 common) shape the draw inside the chosen games; the two rarest
// land on corners. Unlocks mark squares automatically: the deal is
// stored in Supabase, marking is computed live from Steam data on
// every load — no honor system, no cron involvement.
// Members whose total eligible pool is under 24 sit the round out.
//
// Rounds ACCUMULATE now: dealing a new round keeps the old ones,
// and the Trophy Room derives each past round's first-line winner
// from unlock timestamps (deriveBingoWinners below). Deleting a
// round is the only way history is lost (cards cascade,
// migration-v9). Rounds are glory-only — bingo never touches the
// main leaderboard.
// ---------------------------------------------------------------
import { useMemo, useState } from "react";
import { S, fmtDate } from "./ui.jsx";
import { tierOf } from "../lib/stats.js";
import { LINES, keyOf, CARD_GAMES, dealCards } from "../lib/bingo.js";

export default function Bingo({ stats, meta, mutate, busy, nav }) {
  const monthLabel = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const [label, setLabel] = useState(monthLabel);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newRound, setNewRound] = useState(false);   // deal a fresh round; past rounds stay for the Trophy Room
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
    setNewRound(false);
  };
  const remove = async () => {
    setConfirmDelete(false);
    await mutate("deleteBingo", { roundId: round.id }, () => "Round deleted — the board forgets.");
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="panel" style={{ ...S.panel, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={S.label}>Bingo</span>
        {round && !newRound ? (
          <>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{round.label}</span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              dealt {fmtDate(Date.parse(round.created_at) / 1000)} · marks update live from Steam · past rounds hang in the Trophy Room
            </span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button style={S.btnGhost} disabled={busy} onClick={() => setNewRound(true)}>New round</button>
              {confirmDelete ? (
                <>
                  <button style={{ ...S.btnGhost, color: "var(--err-border)", borderColor: "var(--err-border)" }}
                    disabled={busy} onClick={remove}>Really delete round?</button>
                  <button style={S.btnGhost} onClick={() => setConfirmDelete(false)}>Keep it</button>
                </>
              ) : (
                <button style={{ ...S.btnGhost, color: "var(--faint)" }} disabled={busy} onClick={() => setConfirmDelete(true)}>Delete (erases its history)</button>
              )}
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              25 squares, center free. Each card draws from just {CARD_GAMES} of that member's own owned games —
              achievements they haven't earned, difficulty-balanced. Unlocks mark squares automatically. Lines are glory; blackout is legend.
            </span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
              <input style={{ ...S.input, width: 160 }} value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder={monthLabel} />
              <button style={S.btn} disabled={busy} onClick={deal}>Deal the cards</button>
              {round && <button style={S.btnGhost} onClick={() => setNewRound(false)}>Back</button>}
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
