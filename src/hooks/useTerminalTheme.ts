// ── Terminal theme hook — returns colors based on system prefers-color-scheme ──

import { useMemo } from "react";
import { useMediaQuery } from "@mui/material";
import { TERMINAL_THEME_DARK, TERMINAL_THEME_LIGHT, CHROME_COLORS } from "../constants/terminal";

export function useTerminalTheme() {
  const isDark = useMediaQuery("(prefers-color-scheme: dark)");

  return useMemo(
    () => ({
      xterm: isDark ? TERMINAL_THEME_DARK : TERMINAL_THEME_LIGHT,
      chrome: isDark ? CHROME_COLORS.dark : CHROME_COLORS.light,
      /** Page background for the terminal view. */
      pageBg: isDark ? "#0d1117" : "#ffffff",
    }),
    [isDark],
  );
}
