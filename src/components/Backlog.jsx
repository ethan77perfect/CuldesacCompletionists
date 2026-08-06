import { useState } from "react";
import { S } from "./ui.jsx";

export default function Backlog({ meta, mutate, busy }) {
  const [proposal, setProposal] = useState("");
  const [voter, setVoter] = useState(meta.members[0]?.steamid ?? "");
  const sorted = [...meta.backlog].sort((a, b) => (b.votes?.length ?? 0) - (a.votes?.length ?? 0));

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 640 }}>
      <div style={S.panel}>
        <div style={{ ...S.label, marginBottom: 10 }}>Propose a game</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input style={{ ...S.input, flex: "1 1 260px" }} placeholder="Steam store URL or appid"
            value={proposal} onChange={(e) => setProposal(e.target.value)} />
          <button style={S.btn} disabled={busy || !proposal}
            onClick={() => mutate("proposeBacklog", { appidOrUrl: proposal, proposedBy: voter },
              (j) => `${j.name} proposed`).then(() => setProposal(""))}>
            Propose
          </button>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "#8FA3BF" }}>
          Voting as
          <select value={voter} onChange={(e) => setVoter(e.target.value)} style={{ ...S.input, width: "auto" }}>
            {meta.members.map((m) => <option key={m.steamid} value={m.steamid}>{m.name}</option>)}
          </select>
          <span>(honor system — this is a club, not an election)</span>
        </div>
      </div>

      <div style={S.panel}>
        <div style={{ ...S.label, marginBottom: 12 }}>The ballot ({sorted.length})</div>
        {sorted.length === 0 && <p style={{ color: "#8FA3BF", fontSize: 13 }}>No proposals yet. Start the argument.</p>}
        {sorted.map((b) => {
          const voted = (b.votes ?? []).includes(voter);
          const proposer = meta.members.find((m) => m.steamid === b.proposed_by);
          return (
            <div key={b.appid} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <button style={{ ...S.btnGhost, ...(voted ? { color: "#E8B84B", borderColor: "#4A3D18" } : {}) }}
                disabled={busy}
                onClick={() => mutate("voteBacklog", { appid: b.appid, steamid: voter }, (j) => `Vote ${voted ? "removed" : "cast"} (${j.votes})`)}>
                ▲ {(b.votes ?? []).length}
              </button>
              <span style={{ flex: 1, minWidth: 140, fontSize: 14, fontWeight: 600 }}>
                {b.name}
                {proposer && <span style={{ fontSize: 12, color: "#8FA3BF", fontWeight: 400 }}> · proposed by <span style={{ color: proposer.color }}>{proposer.name}</span></span>}
              </span>
              <button style={S.btn} disabled={busy}
                onClick={() => mutate("promoteBacklog", { appid: b.appid }, (j) => `${j.name ?? b.name} is now tracked!`)}>
                Track it
              </button>
              <button style={S.btnGhost} disabled={busy}
                onClick={() => mutate("removeBacklog", { appid: b.appid }, () => "Proposal removed")}>✕</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
