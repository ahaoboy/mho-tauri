// ── Install tab — install mho on the remote host ────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { CheckCircle, Download, Refresh, Storage } from "@mui/icons-material";
import type {
  DirStatus,
  InstallOptions,
  InstallReport,
  InstallProxy,
  RemoteInfo,
  SshConfig,
} from "../types";

// ── Proxy metadata ──────────────────────────────────────────────────────

const PROXY_OPTIONS: { id: InstallProxy; label: string; supportsRelease: boolean }[] = [
  { id: "github", label: "GitHub (direct)", supportsRelease: true },
  { id: "gh-proxy", label: "gh-proxy.com", supportsRelease: true },
  { id: "xget", label: "xget.xi-xu.me", supportsRelease: true },
  { id: "jsdelivr", label: "jsDelivr", supportsRelease: false },
  { id: "statically", label: "Statically", supportsRelease: false },
];

/** Fallback list when the backend has not answered yet (mho-full assets). */
const FALLBACK_TARGETS = [
  "x86_64-unknown-linux-musl",
  "x86_64-unknown-linux-gnu",
  "aarch64-unknown-linux-musl",
  "aarch64-unknown-linux-gnu",
  "aarch64-apple-darwin",
  "x86_64-pc-windows-msvc",
  "x86_64-pc-windows-gnu",
];

/** Human readable byte size (`0` is a real value, not "unknown"). */
function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1);
  return `${text} ${units[unit]}`;
}

// ── Props ────────────────────────────────────────────────────────────────

interface InstallPageProps {
  sshConfig: SshConfig;
  mhoPath: string;
  remote: RemoteInfo | null;
  probing: boolean;
  probeError: string;
  onRefresh: () => void;
  /** Called with the absolute path of the installed binary. */
  onInstalled: (installedPath: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────

export default function InstallPage({
  sshConfig,
  mhoPath,
  remote,
  probing,
  probeError,
  onRefresh,
  onInstalled,
}: InstallPageProps) {
  const [options, setOptions] = useState<InstallOptions | null>(null);
  const [dir, setDir] = useState("");
  const [target, setTarget] = useState("");
  const [proxy, setProxy] = useState<InstallProxy>("github");

  const [dirStatus, setDirStatus] = useState<DirStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [dirError, setDirError] = useState("");

  const [installing, setInstalling] = useState(false);
  const [report, setReport] = useState<InstallReport | null>(null);
  const [installError, setInstallError] = useState("");

  /** Guards against re-seeding the form (and clobbering user edits). */
  const seededFor = useRef("");

  // ── Load backend options once ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    invoke<InstallOptions>("install_options")
      .then((value) => {
        if (!cancelled) setOptions(value);
      })
      .catch((e) => console.error("install_options failed:", e));
    return () => {
      cancelled = true;
    };
  }, []);

  const targets = options?.targets?.length ? options.targets : FALLBACK_TARGETS;

  // ── Remote directory check ────────────────────────────────────
  const checkDir = useCallback(
    async (value: string) => {
      const dirValue = value.trim();
      if (!dirValue) {
        setDirStatus(null);
        return;
      }
      setChecking(true);
      setDirError("");
      try {
        setDirStatus(await invoke<DirStatus>("check_dir", { sshConfig, dir: dirValue }));
      } catch (e) {
        setDirStatus(null);
        setDirError(String(e));
      } finally {
        setChecking(false);
      }
    },
    [sshConfig],
  );

  // ── Seed the form from the remote probe (once per host) ───────
  useEffect(() => {
    if (!remote) return;
    const key = `${remote.install_dir}|${remote.target}`;
    if (seededFor.current === key) return;
    seededFor.current = key;

    const suggested = remote.install_dir || "~/.mho";
    setDir(suggested);

    // Detect the best target. When the detected triple has no published
    // bundle, keep the same architecture if possible instead of offering a
    // bundle that cannot run on the remote host.
    const arch = remote.target.split("-")[0];
    let preferred = "";
    if (remote.target_supported) {
      preferred = remote.target;
    } else if (targets.some((t) => t.startsWith(`${arch}-`))) {
      preferred = targets.find((t) => t.startsWith(`${arch}-`)) ?? "";
    } else if (options?.target && targets.includes(options.target)) {
      preferred = options.target;
    }
    setTarget(preferred || targets[0]);

    void checkDir(suggested);
  }, [remote, options?.target, targets, checkDir]);

  // ── Keep a valid target when nothing is detected yet ──────────
  useEffect(() => {
    if (!target && options?.target) setTarget(options.target);
  }, [options?.target, target]);

  // ── Install ───────────────────────────────────────────────────
  const handleInstall = useCallback(async () => {
    const dirValue = dir.trim();
    if (!dirValue || !target) return;

    setInstalling(true);
    setReport(null);
    setInstallError("");

    try {
      const result = await invoke<InstallReport>("install_mho", {
        sshConfig,
        installDir: dirValue,
        target,
        proxy,
      });
      setReport(result);
      onInstalled(result.path);
    } catch (e) {
      setInstallError(String(e));
    } finally {
      setInstalling(false);
    }
  }, [dir, target, proxy, sshConfig, onInstalled]);

  const handleCancel = useCallback(async () => {
    try {
      await invoke("cancel_ssh");
    } catch (e) {
      console.error("Cancel failed:", e);
    }
  }, []);

  // ── Derived state ─────────────────────────────────────────────
  const dirUsable = !!dirStatus && (dirStatus.writable || dirStatus.creatable);
  const canInstall = !installing && !!dir.trim() && !!target && (dirStatus === null || dirUsable);

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", px: 2, py: 2 }}>
      {/* ── Remote status ─────────────────────────────── */}
      <Stack direction="row" sx={{ alignItems: "center", mb: 1 }}>
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
          Remote host
        </Typography>
        {probing ? (
          <CircularProgress size={16} />
        ) : (
          <Button
            size="small"
            startIcon={<Refresh sx={{ fontSize: 16 }} />}
            onClick={onRefresh}
            sx={{ textTransform: "none" }}
          >
            Refresh
          </Button>
        )}
      </Stack>

      {probeError && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {probeError}
        </Alert>
      )}

      {remote && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary">
              {remote.user}@{remote.os.toLowerCase()} ({remote.arch}) · target{" "}
              <Box component="span" sx={{ fontFamily: "monospace" }}>
                {remote.target}
              </Box>
            </Typography>
            {remote.mho_exists ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <CheckCircle color="success" sx={{ fontSize: 16 }} />
                <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                  {remote.mho_resolved}
                </Typography>
                {remote.mho_version && (
                  <Typography variant="caption" color="text.secondary">
                    {remote.mho_version}
                  </Typography>
                )}
              </Stack>
            ) : (
              <Typography variant="body2" color="warning.main">
                mho was not found at “{mhoPath}”. Install it below, then switch to the Terminal tab.
              </Typography>
            )}
          </Stack>
        </Paper>
      )}

      <Divider sx={{ mb: 2 }} />

      {/* ── Install form ──────────────────────────────── */}
      <Stack spacing={2}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Installation
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
            <TextField
              label="Install directory"
              value={dir}
              onChange={(e) => {
                setDir(e.target.value);
                setDirStatus(null);
                setDirError("");
              }}
              placeholder="~/.mho"
              size="small"
              slotProps={{
                htmlInput: { style: { fontFamily: "monospace", fontSize: 13 } },
              }}
            />
            <Button
              variant="outlined"
              size="small"
              onClick={() => void checkDir(dir)}
              disabled={checking || !dir.trim()}
              startIcon={
                checking ? <CircularProgress size={14} /> : <Storage sx={{ fontSize: 16 }} />
              }
              sx={{ textTransform: "none", flexShrink: 0, height: 40 }}
            >
              Check
            </Button>
          </Stack>

          {/* Directory status */}
          {dirError && (
            <FormHelperText error sx={{ mx: 0 }}>
              {dirError}
            </FormHelperText>
          )}
          {dirStatus && !dirError && (
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", mt: 1, flexWrap: "wrap", gap: 0.5 }}
            >
              <Chip
                size="small"
                color={dirUsable ? "success" : "error"}
                label={
                  dirStatus.writable
                    ? "writable"
                    : dirStatus.creatable
                      ? "can be created"
                      : "not writable"
                }
              />
              <Chip
                size="small"
                variant="outlined"
                color={
                  dirStatus.space_known && dirStatus.available_bytes === 0 ? "error" : "default"
                }
                label={
                  dirStatus.space_known
                    ? `free ${formatBytes(dirStatus.available_bytes)} / ${formatBytes(dirStatus.total_bytes)}`
                    : "free space unknown"
                }
              />
              {dirStatus.space_known &&
                dirStatus.space_from &&
                dirStatus.space_from !== dirStatus.dir && (
                  <Typography variant="caption" color="text.secondary">
                    measured on {dirStatus.space_from} (target does not exist yet)
                  </Typography>
                )}
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                {dirStatus.dir}
              </Typography>
            </Stack>
          )}
          {dirStatus?.error && (
            <FormHelperText error sx={{ mx: 0 }}>
              {dirStatus.error}
            </FormHelperText>
          )}
        </Box>

        <FormControl size="small" fullWidth>
          <InputLabel>Target</InputLabel>
          <Select
            label="Target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            sx={{ fontFamily: "monospace", fontSize: 13 }}
          >
            {targets.map((value) => (
              <MenuItem key={value} value={value} dense sx={{ fontFamily: "monospace" }}>
                {value}
                {remote?.target === value ? "  (detected)" : ""}
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>
            {remote && !remote.target_supported ? (
              <>
                Detected <code>{remote.target}</code> has no published bundle — pick another target,
                or build mho for it manually.
              </>
            ) : (
              "Rust target triple for the remote machine. The detected value is preselected."
            )}
          </FormHelperText>
        </FormControl>

        <FormControl size="small" fullWidth>
          <InputLabel>Download proxy</InputLabel>
          <Select
            label="Download proxy"
            value={proxy}
            onChange={(e) => setProxy(e.target.value as InstallProxy)}
          >
            {PROXY_OPTIONS.map((option) => (
              <MenuItem key={option.id} value={option.id} dense disabled={!option.supportsRelease}>
                {option.label}
                {!option.supportsRelease ? " — release assets unsupported" : ""}
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>Mirror used to download the GitHub release archive.</FormHelperText>
        </FormControl>

        {/* Actions */}
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          {installing ? (
            <Button
              variant="outlined"
              color="error"
              onClick={handleCancel}
              sx={{ textTransform: "none" }}
            >
              Cancel
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleInstall}
              disabled={!canInstall}
              startIcon={<Download />}
              sx={{ textTransform: "none" }}
            >
              Install mho-full
            </Button>
          )}
          {installing && <CircularProgress size={18} />}
          {installing && (
            <Typography variant="caption" color="text.secondary">
              Downloading, then writing to the remote host…
            </Typography>
          )}
        </Stack>

        {report && !installing && (
          <Alert severity="success" icon={<CheckCircle fontSize="inherit" />}>
            Installed. Terminal commands will use{" "}
            <Box component="span" sx={{ fontFamily: "monospace" }}>
              {report.path}
            </Box>
            .
          </Alert>
        )}

        {installError && <Alert severity="error">{installError}</Alert>}
      </Stack>
    </Box>
  );
}
