// ── Workspace — header + tab switcher for Terminal / Install ────────────

import { Box, CircularProgress, LinearProgress, Tab, Tabs } from "@mui/material";
import { Download, Terminal } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import Dashboard from "./Dashboard";
import DashboardHeader from "./DashboardHeader";
import InstallPage from "./InstallPage";
import { useStore } from "../store";
import type { WorkspaceTab } from "../types";

// ── Component ────────────────────────────────────────────────────────────

export default function Workspace() {
  const { t } = useTranslation();
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const remote = useStore((s) => s.remote);
  const probing = useStore((s) => s.probing);

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
      <DashboardHeader />

      <Tabs
        value={activeTab}
        onChange={(_event, value: WorkspaceTab) => setActiveTab(value)}
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
          label={t("workspace.terminal")}
          icon={<Terminal sx={{ fontSize: 18 }} />}
          iconPosition="start"
        />
        <Tab
          value="install"
          label={mhoMissing ? t("workspace.installRequired") : t("workspace.install")}
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
        <Dashboard />
      ) : (
        <InstallPage />
      )}
    </Box>
  );
}
