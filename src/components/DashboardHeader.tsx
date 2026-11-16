// ── Dashboard header bar ────────────────────────────────────────────────

import { useState, useCallback } from "react";
import { AppBar, IconButton, Toolbar, Typography } from "@mui/material";
import { Terminal, Logout } from "@mui/icons-material";
import { useTerminalTheme } from "../hooks/useTerminalTheme";
import { useStore } from "../store";

// ── Component ────────────────────────────────────────────────────────────

export default function DashboardHeader() {
  const username = useStore((s) => s.username);
  const host = useStore((s) => s.host);
  const port = useStore((s) => s.port);
  const mhoPath = useStore((s) => s.mhoPath);
  const disconnect = useStore((s) => s.disconnect);

  const [copied, setCopied] = useState(false);
  const { chrome } = useTerminalTheme();

  const connectionString = `${username}@${host}:${port}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(connectionString);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [connectionString]);

  return (
    <AppBar
      position="static"
      color="transparent"
      elevation={0}
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: chrome.bg,
        backdropFilter: "blur(8px)",
      }}
    >
      <Toolbar variant="dense" sx={{ gap: 0.5 }}>
        <Terminal sx={{ fontSize: 18, color: "primary.main" }} />
        <Typography
          variant="body2"
          color="text.secondary"
          noWrap
          onClick={handleCopy}
          title={`${connectionString} — ${mhoPath} — click to copy`}
          sx={{
            flex: 1,
            fontFamily: "monospace",
            ml: 0.5,
            cursor: "pointer",
            userSelect: "none",
            "&:hover": { color: "text.primary" },
          }}
        >
          {copied ? "Copied!" : `${connectionString}  ·  ${mhoPath}`}
        </Typography>

        <IconButton size="small" color="error" onClick={disconnect} title="Disconnect">
          <Logout sx={{ fontSize: 18 }} />
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}
