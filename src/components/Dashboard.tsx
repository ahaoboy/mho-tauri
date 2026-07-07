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
  CloudUpload,
  Error as ErrorIcon,
} from "@mui/icons-material";
import DashboardHeader from "./DashboardHeader";
import type { CommandOutput, CrashCommandDef, CommandState, SshConfig } from "../types";

// ── Command definitions (extensible) ────────────────────────────────────

const CRASH_COMMANDS: CrashCommandDef[] = [
  { id: "status", label: "Status", args: ["status"] },
  { id: "start", label: "Start", args: ["start", "-f"] },
  { id: "stop", label: "Stop", args: ["stop", "-f"] },
  { id: "update", label: "Update", args: ["update-url", "-f"] },
  { id: "config", label: "Config", args: ["config", "url"], needsUrl: true },
  { id: "upgrade", label: "Upgrade", args: ["upgrade", "crash-assets"] },
];

/** Icon per command id (used in Run button). */
const CMD_ICONS: Record<string, React.ReactNode> = {
  start: <PlayArrow />,
  stop: <Stop />,
  status: <Info />,
  update: <Link />,
  config: <Settings />,
  upgrade: <CloudUpload />,
};

// ── URL detection regex ──────────────────────────────────────────────────
const URL_RE = /https?:\/\/[^\s<>"'{}|\\^`[\])]+/gi;

/** Split text into segments, converting URLs into <a> elements. */
function linkify(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    parts.push(
      <Box
        component="a"
        key={match.index}
        href={match[0]}
        target="_blank"
        rel="noopener noreferrer"
        sx={{ color: "#6ea8fe", textDecoration: "underline" }}
      >
        {match[0]}
      </Box>,
    );
    last = URL_RE.lastIndex;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts;
}

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
    const state = commandStates[selectedCmdId];
    if (!state?.output) return;
    const cmd = CRASH_COMMANDS.find((c) => c.id === selectedCmdId);
    if (!cmd) return;
    const lines: string[] = [];
    lines.push(`$ crash ${cmd.args.join(" ")}`);
    if (state.output.stdout) lines.push(state.output.stdout.trimEnd());
    if (state.output.stderr) lines.push(`[stderr] ${state.output.stderr.trimEnd()}`);
    lines.push(`[exit: ${state.output.exit_code}]`);
    await navigator.clipboard.writeText(lines.join("\n"));
  }, [commandStates, selectedCmdId]);

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

  // ── Check if selected command has output ─────────────────────
  const hasOutput = !!commandStates[selectedCmdId]?.output || !!commandStates[selectedCmdId]?.error;

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
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      {cmd.label}
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
            sx={{ textTransform: "none" }}
          >
            Run
          </Button>
          <Typography
            variant="body2"
            sx={{
              fontFamily: "monospace",
              fontSize: 12,
              color: "text.secondary",
              bgcolor: "action.hover",
              px: 1,
              py: 0.3,
              borderRadius: 1,
              border: 1,
              borderColor: "divider",
            }}
          >
            crash {selectedCmd.args.join(" ")}
          </Typography>
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
          elevation={3}
          sx={{
            flex: 1,
            p: 2,
            overflow: "auto",
            bgcolor: "#1e1e1e",
            color: "#d4d4d4",
            fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
            fontSize: 13,
            lineHeight: 1.6,
            borderRadius: 1,
          }}
        >
          {(() => {
            const state = commandStates[selectedCmdId];
            if (!state || (state.status === "idle" && !state.output && !state.error)) {
              return (
                <Typography component="div" sx={{ color: "#808080", fontFamily: "inherit" }}>
                  Click a command above to execute it. Output will appear here.
                </Typography>
              );
            }
            const cmd = selectedCmd;
            return (
              <Box>
                <Box
                  component="span"
                  sx={{
                    color: "#569cd6",
                    fontWeight: 600,
                    fontFamily: "inherit",
                  }}
                >
                  $ crash {cmd.args.join(" ")}
                </Box>
                {state.status === "running" && (
                  <Box
                    component="div"
                    sx={{ color: "#808080", fontStyle: "italic", fontFamily: "inherit" }}
                  >
                    Executing...
                  </Box>
                )}
                {state.output && (
                  <>
                    {state.output.stdout && (
                      <Box
                        component="div"
                        sx={{
                          color: "#d4d4d4",
                          fontFamily: "inherit",
                          mt: 0.25,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}
                      >
                        {linkify(state.output.stdout.trimEnd())}
                      </Box>
                    )}
                    {state.output.stderr && (
                      <Box
                        component="div"
                        sx={{
                          color: "#f48771",
                          fontFamily: "inherit",
                          mt: 0.25,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}
                      >
                        {linkify(state.output.stderr.trimEnd())}
                      </Box>
                    )}
                    <Box
                      component="div"
                      sx={{
                        color: state.output.exit_code === 0 ? "#6a9955" : "#f44747",
                        fontSize: 11,
                        fontFamily: "inherit",
                        mt: 0.25,
                      }}
                    >
                      [exit: {state.output.exit_code}]
                    </Box>
                  </>
                )}
                {state.error && (
                  <Box component="div" sx={{ color: "#f44747", fontFamily: "inherit", mt: 0.25 }}>
                    Error: {state.error}
                  </Box>
                )}
              </Box>
            );
          })()}
        </Paper>
      </Box>
    </Box>
  );
}
