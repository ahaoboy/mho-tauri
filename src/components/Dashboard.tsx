// ── Mho Tauri dashboard — command execution UI ─────────────────────────

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
import {
  type CommandOutput,
  type MhoCommandDef,
  type CommandState,
  type MhoCommandId,
  DEFAULT_COMMAND_ID,
  MHO_COMMANDS,
  isUrlCommand,
} from "../types";
import { useStore } from "../store";
import { useTranslation } from "react-i18next";

// ── Command definitions (extensible, single source of truth) ─────────────

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

// ── Component ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { t } = useTranslation();
  const mhoPath = useStore((s) => s.mhoPath);
  const sshConfig = useStore((s) => s.sshConfig);

  const [selectedCmdId, setSelectedCmdId] = useState<MhoCommandId>(DEFAULT_COMMAND_ID);
  const [urlInput, setUrlInput] = useState("");
  const [commandStates, setCommandStates] = useState<Record<string, CommandState>>({});
  const outputRef = useRef<HTMLDivElement>(null);

  const selectedCmd = MHO_COMMANDS.find((c) => c.id === selectedCmdId) ?? MHO_COMMANDS[0];

  // ── Execute a mho command via SSH ────────────────────────────
  const executeCommand = useCallback(
    async (cmd: MhoCommandDef, extraArg?: string) => {
      const cmdId = cmd.id;

      setCommandStates((prev) => ({
        ...prev,
        [cmdId]: { status: "running", output: null, error: null },
      }));

      try {
        const args = extraArg ? [...cmd.args, extraArg] : [...cmd.args];
        const output: CommandOutput = await invoke("execute_mho", {
          sshConfig,
          mhoPath,
          args,
          timeoutSecs: 120,
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
        if (/cancelled/i.test(errMsg)) {
          setCommandStates((prev) => ({
            ...prev,
            [cmdId]: { status: "idle", output: null, error: null },
          }));
          return;
        }
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
    [mhoPath, sshConfig],
  );

  // ── Cancel the in-flight command ─────────────────────────────
  const handleCancelCommand = useCallback(async () => {
    try {
      await invoke("cancel_ssh");
    } catch (e) {
      console.error("Cancel failed:", e);
    }
  }, []);

  // ── Copy output to clipboard ──────────────────────────────────
  const handleCopyOutput = useCallback(async () => {
    const state = commandStates[selectedCmdId];
    if (!state?.output) return;
    const cmd = MHO_COMMANDS.find((c) => c.id === selectedCmdId);
    if (!cmd) return;
    const lines: string[] = [];
    lines.push(`$ mho ${cmd.args.join(" ")}`);
    if (state.output.stdout) lines.push(state.output.stdout.trimEnd());
    if (state.output.stderr) lines.push(`[stderr] ${state.output.stderr.trimEnd()}`);
    lines.push(`[${t("dashboard.exit")}: ${state.output.exit_code}]`);
    await navigator.clipboard.writeText(lines.join("\n"));
  }, [commandStates, selectedCmdId, t]);

  // ── Auto-scroll output ────────────────────────────────────────
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [commandStates]);

  // ── Status indicator for the currently selected command ──────
  // Only the active command's result is shown, so switching commands does
  // not leave a stale success/failure badge on screen.
  const selectedState = commandStates[selectedCmdId];
  const renderStatusChip = (state: CommandState | undefined) => {
    if (!state || state.status === "idle") return null;
    if (state.status === "running") {
      return <CircularProgress size={16} />;
    }
    if (state.status === "success") {
      return <CheckCircle sx={{ fontSize: 18, color: "success.main" }} />;
    }
    return <ErrorIcon sx={{ fontSize: 18, color: "error.main" }} />;
  };

  // ── Check if selected command has output ─────────────────────
  const hasOutput = !!selectedState?.output || !!selectedState?.error;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
    >
      {/* ── Command selector ────────────────────────── */}
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <FormControl size="small" sx={{ flex: 1, minWidth: 0 }}>
            <InputLabel>{t("dashboard.command")}</InputLabel>
            <Select
              value={selectedCmdId}
              label={t("dashboard.command")}
              onChange={(e) => setSelectedCmdId(e.target.value)}
            >
              {MHO_COMMANDS.map((cmd) => (
                <MenuItem key={cmd.id} value={cmd.id} dense>
                  {t(`dashboard.commands.${cmd.id}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {commandStates[selectedCmdId]?.status === "running" ? (
            <Button
              variant="outlined"
              size="small"
              color="error"
              onClick={handleCancelCommand}
              sx={{ textTransform: "none", flexShrink: 0 }}
            >
              {t("dashboard.cancel")}
            </Button>
          ) : (
            <Button
              variant="contained"
              size="small"
              onClick={() => {
                if (isUrlCommand(selectedCmd.id) && urlInput.trim()) {
                  executeCommand(selectedCmd, urlInput.trim());
                  setUrlInput("");
                } else if (!isUrlCommand(selectedCmd.id)) {
                  executeCommand(selectedCmd);
                }
              }}
              disabled={isUrlCommand(selectedCmd.id) && !urlInput.trim()}
              startIcon={CMD_ICONS[selectedCmdId] ?? <Settings />}
              sx={{ textTransform: "none", flexShrink: 0 }}
            >
              {t("dashboard.run")}
            </Button>
          )}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              flexShrink: 0,
            }}
          >
            {renderStatusChip(selectedState)}
          </Box>
        </Stack>

        {/* URL input for commands that require a URL */}
        {isUrlCommand(selectedCmd.id) && (
          <TextField
            fullWidth
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

        {/* The command gets its own line: args can be long. */}
        <Box
          sx={{
            mt: 1,
            px: 1,
            py: 0.5,
            borderRadius: 1,
            border: 1,
            borderColor: "divider",
            bgcolor: "action.hover",
            fontFamily: "monospace",
            fontSize: 12,
            color: "text.secondary",
            wordBreak: "break-all",
          }}
        >
          $ mho {selectedCmd.args.join(" ")}
        </Box>
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
            {t("dashboard.output")}
          </Typography>
          {hasOutput && (
            <Tooltip title={t("dashboard.copyAllOutput")}>
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
            p: { xs: 1.5, sm: 2 },
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
            const state = selectedState;
            if (!state || (state.status === "idle" && !state.output && !state.error)) {
              return (
                <Typography component="div" sx={{ color: "#808080", fontFamily: "inherit" }}>
                  {t("dashboard.outputPlaceholder")}
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
                  $ mho {cmd.args.join(" ")}
                </Box>
                {state.status === "running" && (
                  <Box
                    component="div"
                    sx={{ color: "#808080", fontStyle: "italic", fontFamily: "inherit" }}
                  >
                    {t("dashboard.executing")}
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
                      [{t("dashboard.exit")}: {state.output.exit_code}]
                    </Box>
                  </>
                )}
                {state.error && (
                  <Box component="div" sx={{ color: "#f44747", fontFamily: "inherit", mt: 0.25 }}>
                    {t("dashboard.error", { message: state.error })}
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
