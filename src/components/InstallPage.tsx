// ── Install tab — install mho on the remote host ────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { CheckCircle, Download, Refresh, WarningAmber } from "@mui/icons-material";
import { useStore } from "../store";
import type { DirStatus, InstallOptions, InstallReport, InstallProxy } from "../types";

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

// ── Component ────────────────────────────────────────────────────────────

export default function InstallPage() {
  const sshConfig = useStore((s) => s.sshConfig);
  const mhoPath = useStore((s) => s.mhoPath);
  const remote = useStore((s) => s.remote);
  const probing = useStore((s) => s.probing);
  const probeError = useStore((s) => s.probeError);
  const probe = useStore((s) => s.probe);
  const markInstalled = useStore((s) => s.markInstalled);

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

  // Re-check whenever the directory settles, so the form has no Check button.
  useEffect(() => {
    const value = dir.trim();
    if (!value) {
      setDirStatus(null);
      return;
    }
    const timer = setTimeout(() => void checkDir(value), 400);
    return () => clearTimeout(timer);
  }, [dir, checkDir]);

  // ── Seed the form from the remote probe (once per host) ───────
  useEffect(() => {
    if (!remote) return;
    const key = `${remote.install_dir}|${remote.target}`;
    if (seededFor.current === key) return;
    seededFor.current = key;

    setDir(remote.install_dir || "~/.mho");

    // When the detected triple has no published bundle, keep the same
    // architecture if possible instead of offering one that cannot run.
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
  }, [remote, options?.target, targets]);

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
      // Patching the store flips the tab from "Install (required)" to
      // "Install", persists the new path and requests a confirming probe.
      markInstalled(result.path);
    } catch (e) {
      setInstallError(String(e));
    } finally {
      setInstalling(false);
    }
  }, [dir, target, proxy, sshConfig, markInstalled]);

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
  const unsupported = !!remote && !remote.target_supported;

  let dirLabel = "";
  if (dirStatus) {
    const state = dirStatus.writable
      ? "writable"
      : dirStatus.creatable
        ? "can be created"
        : "not writable";
    dirLabel = dirStatus.space_known
      ? `${state} · ${formatBytes(dirStatus.available_bytes)} free`
      : state;
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", px: 2, py: 2 }}>
      {/* ── Remote host summary ───────────────────────── */}
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {remote ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              {remote.mho_exists ? (
                <CheckCircle color="success" sx={{ fontSize: 16 }} />
              ) : (
                <WarningAmber color="warning" sx={{ fontSize: 16 }} />
              )}
              <Typography variant="body2" color="text.secondary" noWrap>
                {remote.user}@{remote.os.toLowerCase()} ({remote.arch})
                {remote.mho_exists
                  ? ` · ${remote.mho_version ?? remote.mho_resolved}`
                  : ` · mho not found (${mhoPath})`}
              </Typography>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Remote host
            </Typography>
          )}
        </Box>
        {probing ? (
          <CircularProgress size={16} />
        ) : (
          <IconButton size="small" onClick={() => void probe()} title="Refresh">
            <Refresh sx={{ fontSize: 18 }} />
          </IconButton>
        )}
      </Stack>

      {probeError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {probeError}
        </Alert>
      )}

      <Stack spacing={2}>
        {/* ── Directory ─────────────────────────────── */}
        <Box>
          <TextField
            fullWidth
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
          <Stack
            direction="row"
            spacing={0.75}
            sx={{ alignItems: "center", mt: 0.75, minHeight: 20 }}
          >
            {checking && <CircularProgress size={12} />}
            {dirStatus && !checking && (
              <Chip
                size="small"
                variant="outlined"
                color={dirUsable ? "success" : "error"}
                label={dirLabel}
              />
            )}
            {(dirError || dirStatus?.error) && (
              <Typography variant="caption" color="error" noWrap>
                {dirError || dirStatus?.error}
              </Typography>
            )}
          </Stack>
        </Box>

        {/* ── Target + proxy ────────────────────────── */}
        <Stack direction="row" spacing={1.5}>
          <FormControl size="small" sx={{ flex: 2 }}>
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
          </FormControl>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>Proxy</InputLabel>
            <Select
              label="Proxy"
              value={proxy}
              onChange={(e) => setProxy(e.target.value as InstallProxy)}
            >
              {PROXY_OPTIONS.map((option) => (
                <MenuItem
                  key={option.id}
                  value={option.id}
                  dense
                  disabled={!option.supportsRelease}
                >
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
        {unsupported && (
          <Typography variant="caption" color="warning.main">
            No bundle is published for {remote?.target} — pick another target.
          </Typography>
        )}

        {/* ── Actions ───────────────────────────────── */}
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
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
              Install mho
            </Button>
          )}
          {installing && <CircularProgress size={18} />}
        </Stack>

        {report && !installing && (
          <Alert severity="success" icon={<CheckCircle fontSize="inherit" />}>
            Installed to{" "}
            <Box component="span" sx={{ fontFamily: "monospace" }}>
              {report.path}
            </Box>
          </Alert>
        )}

        {installError && <Alert severity="error">{installError}</Alert>}
      </Stack>
    </Box>
  );
}
