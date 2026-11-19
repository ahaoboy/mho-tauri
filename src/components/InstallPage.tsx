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
  Tooltip,
  Typography,
} from "@mui/material";
import { CheckCircle, Download, Refresh, WarningAmber } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useStore } from "../store";
import type {
  DirStatus,
  InstallOptions,
  InstallReport,
  InstallProxy,
  InstallSource,
} from "../types";

// ── Proxy / source metadata ─────────────────────────────────────────────
//
// The bundle is published twice: committed to the `mho-assets` repo (`main`)
// and attached to the `nightly` release. Repo-hosted archives work with every
// proxy; jsDelivr and Statically only mirror repo files, so they cannot serve
// release assets.

const PROXY_OPTIONS: { id: InstallProxy; label: string }[] = [
  { id: "github", label: "GitHub" },
  { id: "gh-proxy", label: "gh-proxy" },
  { id: "xget", label: "xget" },
  { id: "jsdelivr", label: "jsDelivr" },
  { id: "statically", label: "Statically" },
];

/** Proxies that can serve release assets. */
const RELEASE_PROXIES: ReadonlySet<InstallProxy> = new Set(["github", "gh-proxy", "xget"]);

const SOURCE_OPTIONS: InstallSource[] = ["repo", "release"];

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
  const { t } = useTranslation();
  const sshConfig = useStore((s) => s.sshConfig);
  const host = useStore((s) => s.host);
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
  const [source, setSource] = useState<InstallSource>("repo");

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
        source,
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
  }, [dir, target, proxy, source, sshConfig, markInstalled]);

  const handleCancel = useCallback(async () => {
    try {
      await invoke("cancel_ssh");
    } catch (e) {
      console.error("Cancel failed:", e);
    }
  }, []);

  // ── Derived state ─────────────────────────────────────────────
  const dirUsable = !!dirStatus && (dirStatus.writable || dirStatus.creatable);
  const unsupported = !!remote && !remote.target_supported;
  const proxySupportsSource = source === "repo" || RELEASE_PROXIES.has(proxy);
  const canInstall =
    !installing &&
    !!dir.trim() &&
    !!target &&
    proxySupportsSource &&
    (dirStatus === null || dirUsable);

  let dirLabel = "";
  if (dirStatus) {
    const state = dirStatus.writable
      ? t("install.writable")
      : dirStatus.creatable
        ? t("install.creatable")
        : t("install.notWritable");
    dirLabel = dirStatus.space_known
      ? t("install.freeSpace", { state, size: formatBytes(dirStatus.available_bytes) })
      : state;
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", px: 2, py: 2 }}>
      {/* ── Remote host summary (compact) ─────────────── */}
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 2, minWidth: 0 }}>
        {remote ? (
          <>
            <Tooltip title={`${remote.user}@${host} · ${remote.target}`}>
              <Chip
                size="small"
                variant="outlined"
                label={`${remote.os.toLowerCase()} · ${remote.arch}`}
              />
            </Tooltip>
            <Tooltip
              title={
                remote.mho_exists
                  ? (remote.mho_resolved ?? "")
                  : t("install.notFoundAt", { path: mhoPath })
              }
            >
              <Chip
                size="small"
                variant="outlined"
                color={remote.mho_exists ? "success" : "warning"}
                icon={
                  remote.mho_exists ? (
                    <CheckCircle fontSize="small" />
                  ) : (
                    <WarningAmber fontSize="small" />
                  )
                }
                label={
                  remote.mho_exists
                    ? (remote.mho_version?.replace(/^mho\s+/i, "") ??
                      t("install.installedFallback"))
                    : t("install.notInstalled")
                }
              />
            </Tooltip>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t("install.remoteHost")}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {probing ? (
          <CircularProgress size={16} />
        ) : (
          <IconButton size="small" onClick={() => void probe()} title={t("install.refresh")}>
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
            label={t("install.directory")}
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

        {/* ── Target / source / proxy (stacked on phones) ────── */}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <FormControl size="small" sx={{ flex: 2, width: "100%" }}>
            <InputLabel>{t("install.target")}</InputLabel>
            <Select
              label={t("install.target")}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              renderValue={(value) => value}
              sx={{ fontFamily: "monospace", fontSize: 13 }}
            >
              {targets.map((value) => (
                <MenuItem key={value} value={value} dense sx={{ fontFamily: "monospace" }}>
                  {value}
                  {remote?.target === value ? `  ${t("install.detected")}` : ""}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ flex: 1, width: "100%" }}>
            <InputLabel>{t("install.source")}</InputLabel>
            <Select
              label={t("install.source")}
              value={source}
              onChange={(e) => {
                const next = e.target.value as InstallSource;
                setSource(next);
                // Release assets are rejected by the file-only mirrors.
                if (next === "release" && !RELEASE_PROXIES.has(proxy)) setProxy("github");
              }}
            >
              {SOURCE_OPTIONS.map((id) => (
                <MenuItem key={id} value={id} dense>
                  {t(id === "repo" ? "install.sourceRepo" : "install.sourceRelease")}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ flex: 1, width: "100%" }}>
            <InputLabel>{t("install.proxy")}</InputLabel>
            <Select
              label={t("install.proxy")}
              value={proxy}
              onChange={(e) => setProxy(e.target.value as InstallProxy)}
            >
              {PROXY_OPTIONS.map((option) => {
                const usable = source === "repo" || RELEASE_PROXIES.has(option.id);
                return (
                  <MenuItem key={option.id} value={option.id} dense disabled={!usable}>
                    {option.label}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        </Stack>
        {unsupported && (
          <Typography variant="caption" color="warning.main">
            {t("install.unsupportedTarget", { target: remote?.target })}
          </Typography>
        )}
        {/* Advisory only: `ei` performs the authoritative space check with the
            real extracted file list, so a tight-but-workable directory must
            not be blocked here. */}
        {dirStatus?.space_warning && (
          <Alert severity="warning" sx={{ py: 0.5 }}>
            {dirStatus.space_warning}
          </Alert>
        )}
        {/* Advisory only: `ei` performs the authoritative space check with the
            real extracted file list, so a tight-but-workable directory must
            not be blocked here. */}
        {dirStatus?.space_warning && (
          <Alert severity="warning" sx={{ py: 0.5 }}>
            {dirStatus.space_warning}
          </Alert>
        )}
        {source === "release" && (
          <Typography variant="caption" color="text.secondary">
            {t("install.releaseProxyHint")}
          </Typography>
        )}

        {/* ── Actions ───────────────────────────────── */}
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          {installing ? (
            <Button
              variant="outlined"
              color="error"
              onClick={handleCancel}
              sx={{ textTransform: "none", width: { xs: "100%", sm: "auto" } }}
            >
              {t("install.cancel")}
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleInstall}
              disabled={!canInstall}
              startIcon={<Download />}
              sx={{ textTransform: "none", width: { xs: "100%", sm: "auto" } }}
            >
              {t("install.install")}
            </Button>
          )}
          {installing && <CircularProgress size={18} />}
        </Stack>

        {report && !installing && (
          <Alert severity="success" icon={<CheckCircle fontSize="inherit" />}>
            {t("install.installed")} ·{" "}
            <Box component="span" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
              {report.path}
            </Box>
          </Alert>
        )}

        {installError && <Alert severity="error">{installError}</Alert>}
      </Stack>
    </Box>
  );
}
