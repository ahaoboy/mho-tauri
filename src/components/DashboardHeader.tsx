// ── Dashboard header bar ────────────────────────────────────────────────

import { useState, useCallback } from "react";
import { AppBar, IconButton, Toolbar, Typography } from "@mui/material";
import { Terminal, Logout } from "@mui/icons-material";
import { useTerminalTheme } from "../hooks/useTerminalTheme";

// ── Props ────────────────────────────────────────────────────────────────

interface DashboardHeaderProps {
  username: string;
  host: string;
  port: string;
  crashPath: string;
  onDisconnect: () => void;
}

// ── Component ────────────────────────────────────────────────────────────

export default function DashboardHeader({
  username,
  host,
  port,
  crashPath,
  onDisconnect,
}: DashboardHeaderProps) {
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
          title={`${connectionString} — ${crashPath} — click to copy`}
          sx={{
            flex: 1,
            fontFamily: "monospace",
            ml: 0.5,
            cursor: "pointer",
            userSelect: "none",
            "&:hover": { color: "text.primary" },
          }}
        >
          {copied ? "Copied!" : `${connectionString}  ·  ${crashPath}`}
        </Typography>

        <IconButton size="small" color="error" onClick={onDisconnect} title="Disconnect">
          <Logout sx={{ fontSize: 18 }} />
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}
