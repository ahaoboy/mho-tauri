// ── Terminal / UI theme constants ───────────────────────────────────────

/** GitHub-dark-inspired color theme. */
export const TERMINAL_THEME_DARK = {
  background: "#0d1117",
  foreground: "#c9d1d9",
  cursor: "#58a6ff",
  cursorAccent: "#0d1117",
  selectionBackground: "#264f78",
  black: "#484f58",
  red: "#ff7b72",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#bc8cff",
  cyan: "#39c5cf",
  white: "#b1bac4",
  brightBlack: "#6e7681",
  brightRed: "#ffa198",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79c0ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#f0f6fc",
};

/** GitHub-light-inspired color theme. */
export const TERMINAL_THEME_LIGHT = {
  background: "#ffffff",
  foreground: "#24292f",
  cursor: "#0969da",
  cursorAccent: "#ffffff",
  selectionBackground: "#54aeff66",
  black: "#24292f",
  red: "#cf222e",
  green: "#1a7f37",
  yellow: "#9a6700",
  blue: "#0969da",
  magenta: "#8250df",
  cyan: "#1b7c83",
  white: "#6e7781",
  brightBlack: "#57606a",
  brightRed: "#a40e26",
  brightGreen: "#2da44e",
  brightYellow: "#bf8700",
  brightBlue: "#218bff",
  brightMagenta: "#a475f9",
  brightCyan: "#3192a0",
  brightWhite: "#8c959f",
};

/** Backward-compatible alias (dark theme). */
export const TERMINAL_THEME = TERMINAL_THEME_DARK;

/** Header / toolbar chrome colors for light and dark modes. */
export const CHROME_COLORS = {
  dark: {
    bg: "rgba(22, 27, 34, 0.95)",
    border: "rgba(255, 255, 255, 0.12)",
  },
  light: {
    bg: "rgba(255, 255, 255, 0.95)",
    border: "rgba(0, 0, 0, 0.12)",
  },
};
