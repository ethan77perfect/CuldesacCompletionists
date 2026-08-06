import { tierOf } from "../lib/stats.js";

export const diffColor = (d) => (d <= 3 ? "#5CB8A6" : d <= 6 ? "#E8B84B" : d <= 8 ? "#E0824B" : "#E05B5B");

export const S = {
  page: { minHeight: "100vh", background: "#0E1420", color: "#D7DFEC", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 64 },
  wrap: { maxWidth: 1060, margin: "0 auto", padding: "0 20px" },
  panel: { background: "#18202F", border: "1px solid #232D40", borderRadius: 10, padding: 18 },
  label: { fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8FA3BF", fontWeight: 600 },
  display: { fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" },
  input: { background: "#0E1420", border: "1px solid #2C3852", borderRadius: 6, color: "#D7DFEC", padding: "9px 12px", fontSize: 14, width: "100%", boxSizing: "border-box" },
  btn: { background: "#E8B84B", color: "#1A1608", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  btnGhost: { background: "none", color: "#8FA3BF", border: "1px solid #2C3852", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer" },
  link: { color: "#E8B84B", cursor: "pointer", textDecoration: "none" },
};

export function Dial({ value, size = 44 }) {
  const notches = [];
  const cx = size / 2, cy = size / 2, rO = size / 2 - 2, rI = size / 2 - 9;
  for (let i = 0; i < 10; i++) {
    const a = Math.PI * (1.25 - (1.5 * i) / 9);
    notches.push(
      <line key={i}
        x1={cx + rI * Math.cos(a)} y1={cy - rI * Math.sin(a)}
        x2={cx + rO * Math.cos(a)} y2={cy - rO * Math.sin(a)}
        stroke={i < value ? diffColor(value) : "#2A3447"} strokeWidth="3" strokeLinecap="round" />
    );
  }
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }} aria-label={`Difficulty ${value} of 10`}>
      {notches}
      <text x={cx} y={cy + 5} textAnchor="middle" fill={diffColor(value)} fontSize="14"
        fontWeight="700" fontFamily="'Barlow Condensed', sans-serif">{value}</text>
    </svg>
  );
}

export function Slider({ label, value, min, max, step, onChange, fmt }) {
  return (
    <label style={{ display: "block", marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, color: "#E8B84B", fontWeight: 600 }}>{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "#E8B84B" }} />
    </label>
  );
}

export function TierChip({ pct }) {
  const t = tierOf(pct);
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: t.color, border: `1px solid ${t.color}44`,
      background: `${t.color}18`, borderRadius: 12, padding: "1px 7px", whiteSpace: "nowrap" }}>
      {t.name} · {pct.toFixed(pct < 1 ? 2 : 1)}%
    </span>
  );
}

export function Avatar({ url, color, size = 40 }) {
  return url ? (
    <img src={url} alt="" width={size} height={size}
      style={{ borderRadius: 8, border: `2px solid ${color}`, flexShrink: 0 }} />
  ) : (
    <span style={{ width: size, height: size, borderRadius: 8, background: color, display: "inline-block", flexShrink: 0 }} />
  );
}

export function PctBar({ pct, color }) {
  return (
    <div style={{ background: "#232D40", borderRadius: 3, height: 6, width: "100%" }}>
      <div style={{ width: `${pct}%`, background: color, height: 6, borderRadius: 3 }} />
    </div>
  );
}

export const fmtDate = (t) => new Date(t * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
export const fmtDays = (d) => (d < 1 ? "same day" : d < 60 ? `${Math.round(d)} days` : `${(d / 30.4).toFixed(1)} months`);
export const timeAgo = (t) => {
  const s = Date.now() / 1000 - t;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(t);
};
