// ── Workspace — header + tab switcher for Terminal / Install ────────────

import { Box, CircularProgress, LinearProgress, Tab, Tabs } from "@mui/material";
import { Download, Terminal } from "@mui/icons-material";
import Dashboard from "./Dashboard";
import DashboardHeader from "./DashboardHeader";
import InstallPage from "./InstallPage";
import type { RemoteInfo, SshConfig, WorkspaceTab } from "../types";

// ── Props ────────────────────────────────────────────────────────────────

interface WorkspaceProps {
  username: string;
  host: string;
  port: string;
  mhoPath: string;
  sshConfig: SshConfig;
  onDisconnect: () => void;

  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;

  remote: RemoteInfo | null;
  probing: boolean;
  probeError: string;
  onRefresh: () => void;
  /** Called with the installed binary path after a successful install. */
  onInstalled: (installedPath: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────

export default function Workspace({
  username,
  host,
  port,
  mhoPath,
  sshConfig,
  onDisconnect,
  activeTab,
  onTabChange,
  remote,
  probing,
  probeError,
  onRefresh,
  onInstalled,
}: WorkspaceProps) {
  const mhoMissing = remote !== null && !remote.mho_exists;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        pt: "var(--safe-area-top)",
        pb: "var(--safe-area-bottom)",
      }}
    >
      <DashboardHeader
        username={username}
        host={host}
        port={port}
        mhoPath={mhoPath}
        onDisconnect={onDisconnect}
      />

      <Tabs
        value={activeTab}
        onChange={(_event, value: WorkspaceTab) => onTabChange(value)}
        variant="fullWidth"
        sx={{
          minHeight: 40,
          borderBottom: 1,
          borderColor: "divider",
          "& .MuiTab-root": { minHeight: 40, textTransform: "none" },
        }}
      >
        <Tab
          value="terminal"
          label="Terminal"
          icon={<Terminal sx={{ fontSize: 18 }} />}
          iconPosition="start"
        />
        <Tab
          value="install"
          label={mhoMissing ? "Install (required)" : "Install"}
          icon={<Download sx={{ fontSize: 18 }} />}
          iconPosition="start"
          sx={mhoMissing ? { color: "warning.main" } : undefined}
        />
      </Tabs>

      {/* Thin progress bar while the remote state is being probed */}
      <Box sx={{ height: 2, flexShrink: 0 }}>
        {probing && <LinearProgress sx={{ height: 2 }} />}
      </Box>

      {probing && !remote ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CircularProgress size={28} />
        </Box>
      ) : activeTab === "terminal" ? (
        <Dashboard
          username={username}
          host={host}
          port={port}
          mhoPath={mhoPath}
          sshConfig={sshConfig}
        />
      ) : (
        <InstallPage
          sshConfig={sshConfig}
          mhoPath={mhoPath}
          remote={remote}
          probing={probing}
          probeError={probeError}
          onRefresh={onRefresh}
          onInstalled={onInstalled}
        />
      )}
    </Box>
  );
}
