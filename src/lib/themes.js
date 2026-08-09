// ---------------------------------------------------------------
// themes.js — the color system. Every UI color in the app is a CSS
// variable (see ui.jsx); a "theme" is just a set of values for
// those variables, applied to <html> at runtime. Add a theme by
// adding an entry here — nothing else needs to change.
//
// All themes are dark variants on purpose: charts, member colors,
// and rarity tiers use fixed colors that need a dark backdrop.
// (A true light theme means auditing all of those — future work.)
// ---------------------------------------------------------------

export const THEMES = {
  hades: {
    label: "House of Hades",       // the original navy + gold
    vars: {
      "--bg": "#0E1420", "--panel": "#18202F", "--header": "#111828",
      "--border": "#232D40", "--border2": "#2C3852",
      "--ink": "#D7DFEC", "--ink-strong": "#F2F5FA",
      "--muted": "#8FA3BF", "--faint": "#44506A",
      "--accent": "#E8B84B", "--accent-ink": "#1A1608",
      "--accent-bg": "#2A2410", "--accent-border": "#4A3D18",
      "--chip": "#1E2637",
      "--err-bg": "#241416", "--err-border": "#5A2B2B",
      "--ok-bg": "#1E1A0E",
    },
  },
  paleCourt: {
    label: "Pale Court",           // Hollow Knight: void black, bone white, pale silver
    vars: {
      "--bg": "#0B0C10", "--panel": "#15171C", "--header": "#101216",
      "--border": "#24272E", "--border2": "#32363F",
      "--ink": "#D8DBE0", "--ink-strong": "#F4F5F7",
      "--muted": "#9AA1AB", "--faint": "#4A4F58",
      "--accent": "#E9EDF2", "--accent-ink": "#101216",
      "--accent-bg": "#22262C", "--accent-border": "#3C424B",
      "--chip": "#1B1E24",
      "--err-bg": "#231416", "--err-border": "#57302F",
      "--ok-bg": "#191B20",
    },
  },
  goldenBerry: {
    label: "Golden Berry",         // Celeste: summit-night purple, berry pink, teal
    vars: {
      "--bg": "#151226", "--panel": "#1F1B33", "--header": "#191531",
      "--border": "#2E2949", "--border2": "#3B3560",
      "--ink": "#E2DEF2", "--ink-strong": "#F6F4FC",
      "--muted": "#A79FC9", "--faint": "#544D77",
      "--accent": "#F27BA5", "--accent-ink": "#2A0E18",
      "--accent-bg": "#301B2A", "--accent-border": "#5A3247",
      "--chip": "#272242",
      "--err-bg": "#2A1420", "--err-border": "#5E2B42",
      "--ok-bg": "#251B30",
    },
  },
  junimoGrove: {
    label: "Junimo Grove",         // Stardew: forest dusk, junimo green, harvest amber
    vars: {
      "--bg": "#101810", "--panel": "#18231A", "--header": "#131D14",
      "--border": "#25332A", "--border2": "#32443A",
      "--ink": "#DBE6DA", "--ink-strong": "#F2F8F1",
      "--muted": "#93AB94", "--faint": "#48584B",
      "--accent": "#7FD37B", "--accent-ink": "#0E1A0D",
      "--accent-bg": "#1B2E1D", "--accent-border": "#35513A",
      "--chip": "#1D2A20",
      "--err-bg": "#241614", "--err-border": "#553229",
      "--ok-bg": "#182415",
    },
  },
  aperture: {
    label: "Aperture",             // Portal: test-chamber grey, portal orange
    vars: {
      "--bg": "#14161A", "--panel": "#1D2026", "--header": "#181B20",
      "--border": "#2A2E36", "--border2": "#383D47",
      "--ink": "#DCDFE4", "--ink-strong": "#F5F6F8",
      "--muted": "#9BA3AF", "--faint": "#4C525C",
      "--accent": "#F08A3C", "--accent-ink": "#1F1206",
      "--accent-bg": "#2C2015", "--accent-border": "#553D24",
      "--chip": "#22262E",
      "--err-bg": "#251517", "--err-border": "#563132",
      "--ok-bg": "#231C13",
    },
  },
};

export const DEFAULT_THEME = "hades";

export function applyTheme(id) {
  const theme = THEMES[id] ?? THEMES[DEFAULT_THEME];
  for (const [k, v] of Object.entries(theme.vars)) {
    document.documentElement.style.setProperty(k, v);
  }
  localStorage.setItem("theme", id);
}
