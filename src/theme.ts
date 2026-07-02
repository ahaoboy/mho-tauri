// ── MUI theme with automatic dark / light mode support ────────────────────

import { createTheme } from "@mui/material/styles";

/**
 * Create an MUI theme that adapts to the user's system preference.
 * Uses CSS media query `prefers-color-scheme` for automatic detection.
 */
export function createAppTheme(prefersDark: boolean) {
  return createTheme({
    palette: {
      mode: prefersDark ? "dark" : "light",
    },
    typography: {
      fontFamily: [
        "-apple-system",
        "BlinkMacSystemFont",
        '"Segoe UI"',
        "Roboto",
        '"Helvetica Neue"',
        "Arial",
        "sans-serif",
      ].join(","),
    },
    components: {
      MuiTextField: {
        defaultProps: {
          size: "small",
          fullWidth: true,
        },
      },
      MuiButton: {
        defaultProps: {
          size: "medium",
        },
      },
      MuiSelect: {
        defaultProps: {
          size: "small",
        },
      },
      MuiDialog: {
        defaultProps: {
          fullWidth: true,
        },
      },
    },
  });
}
