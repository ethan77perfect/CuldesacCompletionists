// ---------------------------------------------------------------
// ui.jsx — shared building blocks used by every page.
//
// S is the "design system": one object of reusable inline styles.
// Change a color/font here and it changes everywhere. (Inline
// styles instead of a CSS file = everything for a component lives
// in one place; the tradeoff is no pseudo-selectors like :hover,
// which is why App.jsx has a tiny <style> block for those.)
//
// Components here follow the standard React shape: a function
// taking a single "props" object (destructured in the signature)
// and returning JSX — the HTML-looking syntax that compiles to
// DOM elements. {curly braces} inside JSX switch back to JS.
//
// Dial      — the 10-notch difficulty gauge (hand-built SVG)
// Slider    — labeled range input used by the settings page
// TierChip  — colored rarity pill (Common → Mythic)
// Avatar    — Steam avatar with member-color border
// PctBar    — thin progress bar
// fmtDate / fmtDays / timeAgo — date formatting helpers
// ---------------------------------------------------------------
import { tierOf } from "../lib/stats.js";

export const diffColor = (d) => (d <= 3 ? "#5CB8A6" : d <= 6 ? "var(--accent)" : d <= 8 ? "#E0824B" : "#E05B5B");

export const S = {
  page: { minHeight: "100vh", background: "var(--bg)", color: "var(--ink)", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 64 },
  wrap: { maxWidth: 1060, margin: "0 auto", padding: "0 20px" },
  panel: { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, padding: 18 },
  label: { fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--label, var(--muted))", fontWeight: 600 },
  display: { fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" },
  input: { background: "var(--bg)", border: "1px solid var(--border2)", borderRadius: 6, color: "var(--ink)", padding: "9px 12px", fontSize: 14, width: "100%", boxSizing: "border-box" },
  btn: { background: "var(--accent)", color: "var(--accent-ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  btnGhost: { background: "none", color: "var(--muted)", border: "1px solid var(--border2)", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer" },
  link: { color: "var(--accent)", cursor: "pointer", textDecoration: "none" },
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
        style={{ stroke: i < value ? `color-mix(in srgb, ${diffColor(value)} calc(100% - var(--sem-darken, 0%)), #1A1A1A)` : "var(--border2)" }}
        strokeWidth="3" strokeLinecap="round" />
    );
  }
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }} aria-label={`Difficulty ${value} of 10`}>
      {notches}
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="14"
        style={{ fill: `color-mix(in srgb, ${diffColor(value)} calc(100% - var(--sem-darken, 0%)), #1A1A1A)` }}
        fontWeight="700" fontFamily="'Barlow Condensed', sans-serif">{value}</text>
    </svg>
  );
}

export function Slider({ label, value, min, max, step, onChange, fmt }) {
  return (
    <label style={{ display: "block", marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600 }}>{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "var(--accent)" }} />
    </label>
  );
}

export function TierChip({ pct }) {
  const t = tierOf(pct);
  if (pct == null || pct <= 0) return (
    <span title="Steam hasn't computed global stats for this achievement yet"
      style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", border: "1px dashed var(--border2)",
        background: "var(--chip)", borderRadius: 12, padding: "1px 7px", whiteSpace: "nowrap" }}>
      ⏳ Unrated
    </span>
  );
  return (
    <span style={{ fontSize: 10, fontWeight: 700,
      color: `color-mix(in srgb, ${t.color} calc(100% - var(--sem-darken, 0%)), #1A1A1A)`,
      border: `1px solid ${t.color}55`, background: `${t.color}1E`,
      borderRadius: 12, padding: "1px 7px", whiteSpace: "nowrap" }}>
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
    <div style={{ background: "var(--border)", borderRadius: 3, height: 6, width: "100%" }}>
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
