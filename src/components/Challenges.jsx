// ---------------------------------------------------------------
// Challenges.jsx — honor-system custom challenges ("#/challenges").
//
// For everything Steam can't see: Celeste mod maps, self-imposed
// runs, community goals. A challenge = title + category + 1–10
// difficulty; claiming one earns difficulty × 100 points (first
// claim gets the first-blood bonus). Claims are on your honor —
// the proof link is for glory, not enforcement.
// Points flow into the MAIN leaderboard (toggleable in settings
// via countChallenges) and show with 🎯 in the feed.
// ---------------------------------------------------------------
import { useState } from "react";
import { S, Dial, fmtDate } from "./ui.jsx";

export default function Challenges({ stats, meta, mutate, busy }) {
  const [me, setMe] = useState(meta.members[0]?.steamid ?? "");
  const [form, setForm] = useState({ title: "", category: "", difficulty: 5, description: "" });
  const [proofDraft, setProofDraft] = useState({});
  const claims = meta.claims ?? [];
  const byCategory = {};
  for (const c of meta.challenges ?? []) (byCategory[c.category] ??= []).push(c);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ ...S.panel, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
        <span style={{ color: "var(--muted)" }}>Claiming as</span>
        <select value={me} onChange={(e) => setMe(e.target.value)} style={{ ...S.input, width: "auto" }}>
          {meta.members.map((m) => <option key={m.steamid} value={m.steamid}>{m.name}</option>)}
        </select>
        <span style={{ color: "var(--faint)" }}>Honor system. Proof links are for bragging, not bureaucracy.</span>
      </div>

      {Object.keys(byCategory).length === 0 && (
        <div style={{ ...S.panel, textAlign: "center", padding: 32, color: "var(--muted)", fontSize: 14 }}>
          No challenges yet. Celeste's Strawberry Jam lobbies are begging to be the first —
          try "Clear the Beginner Lobby heartside" at difficulty 4, and climb from there.
        </div>
      )}

      {Object.entries(byCategory).map(([cat, list]) => (
        <div key={cat} style={S.panel}>
          <div style={{ ...S.label, marginBottom: 12 }}>{cat}</div>
          <div style={{ display: "grid", gap: 12 }}>
            {list.map((ch) => {
              const chClaims = claims.filter((c) => c.challenge_id === ch.id)
                .sort((a, b) => Date.parse(a.claimed_at) - Date.parse(b.claimed_at));
              const mine = chClaims.find((c) => c.steamid === me);
              return (
                <div key={ch.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <Dial value={ch.difficulty} size={38} />
                  <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>
                      🎯 {ch.title} <span style={{ color: "var(--accent)", fontWeight: 700 }}>· {ch.difficulty * 100} pts</span>
                    </div>
                    {ch.description && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{ch.description}</div>}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {chClaims.map((c, i) => {
                        const m = stats.byId[c.steamid];
                        return (
                          <span key={c.steamid} title={fmtDate(Date.parse(c.claimed_at) / 1000)}
                            style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
                              background: "var(--accent-bg)", border: "1px solid var(--accent-border)", color: m?.color }}>
                            {i === 0 && "🩸 "}{m?.name}
                            {c.proof && <> · <a href={c.proof} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>proof</a></>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {!mine ? (
                      <>
                        <input style={{ ...S.input, width: 170 }} placeholder="Proof URL (optional)"
                          value={proofDraft[ch.id] ?? ""} onChange={(e) => setProofDraft({ ...proofDraft, [ch.id]: e.target.value })} />
                        <button style={S.btn} disabled={busy}
                          onClick={() => mutate("claimChallenge", { id: ch.id, steamid: me, proof: proofDraft[ch.id] },
                            () => `Claimed! +${ch.difficulty * 100} pts 🎯`)}>
                          I did it
                        </button>
                      </>
                    ) : (
                      <button style={S.btnGhost} disabled={busy}
                        onClick={() => mutate("unclaimChallenge", { id: ch.id, steamid: me }, () => "Claim withdrawn")}>
                        Un-claim
                      </button>
                    )}
                    <button style={S.btnGhost} disabled={busy} title="Delete challenge"
                      onClick={() => mutate("removeChallenge", { id: ch.id }, () => "Challenge removed")}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div style={S.panel}>
        <div style={{ ...S.label, marginBottom: 12 }}>Propose a challenge</div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr", alignItems: "center" }}>
          <input style={S.input} placeholder='Title — e.g. "Clear Strawberry Jam: Advanced heartside"'
            value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input style={S.input} placeholder="Category — e.g. Celeste Mods"
            value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </div>
        <input style={{ ...S.input, marginTop: 8 }} placeholder="Description / rules (optional)"
          value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Difficulty</span>
          <input type="range" min={1} max={10} value={form.difficulty} style={{ accentColor: "var(--accent)", width: 160 }}
            onChange={(e) => setForm({ ...form, difficulty: parseInt(e.target.value, 10) })} />
          <Dial value={form.difficulty} size={36} />
          <button style={{ ...S.btn, marginLeft: "auto" }} disabled={busy || !form.title}
            onClick={() => mutate("addChallenge", { ...form, proposedBy: me }, () => "Challenge posted — worth " + form.difficulty * 100 + " pts")
              .then(() => setForm({ title: "", category: form.category, difficulty: 5, description: "" }))}>
            Post it
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--faint)", marginTop: 10 }}>
          Set difficulty like the club dial: Strawberry Jam lobbies map nicely — Beginner ≈ 3, Intermediate ≈ 5, Advanced ≈ 7, Expert ≈ 8, Grandmaster heartside ≈ 10.
        </p>
      </div>
    </div>
  );
}
