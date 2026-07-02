// ── Crash Tauri dashboard — command execution UI ─────────────────────────

import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  PlayArrow,
  Stop,
  Info,
  Link,
  Settings,
  ContentCopy,
  CheckCircle,
  Error as ErrorIcon,
} from "@mui/icons-material";
import DashboardHeader from "./DashboardHeader";
import type { CommandOutput, CrashCommandDef, CommandState, SshConfig } from "../types";

// ── Command definitions (extensible) ────────────────────────────────────

const CRASH_COMMANDS: CrashCommandDef[] = [
  {
    id: "start",
    label: "Start",
    description: "Force start the crash service",
    args: ["start", "-f"],
  },
  {
    id: "stop",
    label: "Stop",
    description: "Force stop the crash service",
    args: ["stop", "-f"],
  },
  {
    id: "status",
    label: "Status",
    description: "Show crash service status",
    args: ["status"],
  },
  {
    id: "update-url",
    label: "Update URL",
    description: "Force update the crash URL",
    args: ["update-url", "-f"],
  },
  {
    id: "config-url",
    label: "Config URL",
    description: "Set crash config URL",
    args: ["config", "url"],
    needsUrl: true,
  },
];

/** Icon per command id (used in Run button). */
const CMD_ICONS: Record<string, React.ReactNode> = {
  start: <PlayArrow />,
  stop: <Stop />,
  status: <Info />,
  "update-url": <Link />,
  "config-url": <Settings />,
};

// ── Props ────────────────────────────────────────────────────────────────

interface DashboardProps {
  username: string;
  host: string;
  port: string;
  crashPath: string;
  sshConfig: SshConfig;
  onDisconnect: () => void;
}

// ── Component ────────────────────────────────────────────────────────────

export default function Dashboard({
  username,
  host,
  port,
  crashPath,
  sshConfig,
  onDisconnect,
}: DashboardProps) {
  const [selectedCmdId, setSelectedCmdId] = useState(CRASH_COMMANDS[0].id);
  const [urlInput, setUrlInput] = useState("");
  const [commandStates, setCommandStates] = useState<Record<string, CommandState>>({});
  const outputRef = useRef<HTMLDivElement>(null);

  const selectedCmd = CRASH_COMMANDS.find((c) => c.id === selectedCmdId) ?? CRASH_COMMANDS[0];

  // ── Execute a crash command via SSH ────────────────────────────
  const executeCommand = useCallback(
    async (cmd: CrashCommandDef, extraArg?: string) => {
      const cmdId = cmd.id;

      setCommandStates((prev) => ({
        ...prev,
        [cmdId]: { status: "running", output: null, error: null },
      }));

      try {
        const args = extraArg ? [...cmd.args, extraArg] : [...cmd.args];
        const output: CommandOutput = await invoke("execute_crash", {
          sshConfig,
          crashPath,
          args,
        });

        setCommandStates((prev) => ({
          ...prev,
          [cmdId]: {
            status: output.exit_code === 0 ? "success" : "error",
            output,
            error: null,
          },
        }));
      } catch (e) {
        const errMsg = String(e);
        setCommandStates((prev) => ({
          ...prev,
          [cmdId]: {
            status: "error",
            output: null,
            error: errMsg,
          },
        }));
      }
    },
    [host, port, username, crashPath, sshConfig],
  );

  // ── Copy output to clipboard ──────────────────────────────────
  const handleCopyOutput = useCallback(async () => {
    const lines: string[] = [];
    for (const cmd of CRASH_COMMANDS) {
      const state = commandStates[cmd.id];
      if (state?.output) {
        lines.push(`$ crash ${cmd.args.join(" ")}`);
        if (state.output.stdout) lines.push(state.output.stdout.trimEnd());
        if (state.output.stderr) lines.push(`[stderr] ${state.output.stderr.trimEnd()}`);
        lines.push(`[exit: ${state.output.exit_code}]`);
        lines.push("");
      }
    }
    if (lines.length > 0) {
      try {
        await navigator.clipboard.writeText(lines.join("\n"));
      } catch {
        // ignore
      }
    }
  }, [commandStates]);

  // ── Auto-scroll output ────────────────────────────────────────
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [commandStates]);

  // ── Status chip for each command ──────────────────────────────
  const renderStatusChip = (cmdId: string) => {
    const state = commandStates[cmdId];
    if (!state || state.status === "idle") return null;
    if (state.status === "running") {
      return <CircularProgress size={16} sx={{ ml: 1 }} />;
    }
    if (state.status === "success") {
      return <CheckCircle sx={{ fontSize: 16, ml: 1, color: "success.main" }} />;
    }
    return <ErrorIcon sx={{ fontSize: 16, ml: 1, color: "error.main" }} />;
  };

  // ── Check if any command has output ───────────────────────────
  const hasOutput = Object.values(commandStates).some((s) => s.output || s.error);

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
        crashPath={crashPath}
        onDisconnect={onDisconnect}
      />

      {/* ── Command selector ────────────────────────── */}
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Command</InputLabel>
            <Select
              value={selectedCmdId}
              label="Command"
              onChange={(e) => setSelectedCmdId(e.target.value)}
            >
              {CRASH_COMMANDS.map((cmd) => (
                <MenuItem key={cmd.id} value={cmd.id} dense>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                    <Typography variant="body2" sx={{ fontFamily: "monospace", flex: 1 }}>
                      crash {cmd.args.join(" ")}
                    </Typography>
                    {renderStatusChip(cmd.id)}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            size="small"
            onClick={() => {
              if (selectedCmd.needsUrl && urlInput.trim()) {
                executeCommand(selectedCmd, urlInput.trim());
                setUrlInput("");
              } else if (!selectedCmd.needsUrl) {
                executeCommand(selectedCmd);
              }
            }}
            disabled={
              commandStates[selectedCmdId]?.status === "running" ||
              (selectedCmd.needsUrl && !urlInput.trim())
            }
            startIcon={CMD_ICONS[selectedCmdId] ?? <Settings />}
            sx={{ textTransform: "none", fontFamily: "monospace" }}
          >
            Run
          </Button>
        </Stack>

        {/* URL input for config-url command */}
        {selectedCmd.needsUrl && (
          <TextField
            size="small"
            placeholder="https://example.com"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            sx={{ mt: 1 }}
            slotProps={{
              htmlInput: { style: { fontFamily: "monospace", fontSize: 13 } },
            }}
          />
        )}
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* ── Output display ───────────────────────────── */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          px: 2,
          pb: 2,
          minHeight: 0,
        }}
      >
        <Stack direction="row" sx={{ alignItems: "center", mb: 1 }}>
          <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
            Output
          </Typography>
          {hasOutput && (
            <Tooltip title="Copy all output">
              <IconButton size="small" onClick={handleCopyOutput}>
                <ContentCopy sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>

        <Paper
          ref={outputRef}
          variant="outlined"
          sx={{
            flex: 1,
            p: 1.5,
            overflow: "auto",
            fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
            fontSize: 13,
            lineHeight: 1.5,
            bgcolor: "background.default",
            borderRadius: 1,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {!hasOutput ? (
            <Typography variant="body2" color="text.disabled" sx={{ fontFamily: "inherit" }}>
              Click a command above to execute it. Output will appear here.
            </Typography>
          ) : (
            CRASH_COMMANDS.map((cmd) => {
              const state = commandStates[cmd.id];
              if (!state || (state.status === "idle" && !state.output && !state.error)) {
                return null;
              }
              return (
                <Box key={cmd.id} sx={{ mb: 1.5 }}>
                  <Typography
                    component="span"
                    sx={{
                      color: "primary.main",
                      fontWeight: 600,
                      fontFamily: "inherit",
                    }}
                  >
                    $ crash {cmd.args.join(" ")}
                  </Typography>
                  {state.status === "running" && (
                    <Typography
                      component="div"
                      sx={{ color: "text.secondary", fontStyle: "italic", fontFamily: "inherit" }}
                    >
                      Executing...
                    </Typography>
                  )}
                  {state.output && (
                    <>
                      {state.output.stdout && (
                        <Typography
                          component="div"
                          sx={{ color: "text.primary", fontFamily: "inherit", mt: 0.25 }}
                        >
                          {state.output.stdout.trimEnd()}
                        </Typography>
                      )}
                      {state.output.stderr && (
                        <Typography
                          component="div"
                          sx={{ color: "warning.main", fontFamily: "inherit", mt: 0.25 }}
                        >
                          {state.output.stderr.trimEnd()}
                        </Typography>
                      )}
                      <Typography
                        component="div"
                        sx={{
                          color: state.output.exit_code === 0 ? "success.main" : "error.main",
                          fontSize: 11,
                          fontFamily: "inherit",
                          mt: 0.25,
                        }}
                      >
                        [exit: {state.output.exit_code}]
                      </Typography>
                    </>
                  )}
                  {state.error && (
                    <Typography
                      component="div"
                      sx={{ color: "error.main", fontFamily: "inherit", mt: 0.25 }}
                    >
                      Error: {state.error}
                    </Typography>
                  )}
                </Box>
              );
            })
          )}
        </Paper>
      </Box>
    </Box>
  );
}
