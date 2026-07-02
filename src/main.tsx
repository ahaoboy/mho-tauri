// ── Application entry point ───────────────────────────────────────────────

import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { useMediaQuery } from "@mui/material";
import { createAppTheme } from "./theme";
import App from "./App";

/**
 * Root component that detects system color-scheme preference
 * and provides the MUI theme to the entire app.
 */
function Root() {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const theme = useMemo(() => createAppTheme(prefersDark), [prefersDark]);

  return (
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
