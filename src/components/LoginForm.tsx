// ── Mho Tauri login form component ──────────────────────────────────────

import { useState, useCallback, type ClipboardEvent } from "react";
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  FormHelperText,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  Key,
  Password,
  Save,
  Delete,
  Terminal,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { AuthMethod } from "../types";
import { normalizePrivateKey } from "../utils/keyNormalizer";
import { parseSshInput } from "../utils/sshParser";
import { useStore } from "../store";
import LanguageSwitcher from "./LanguageSwitcher";

// ── Component ────────────────────────────────────────────────────────────

export default function LoginForm() {
  const { t } = useTranslation();
  const label = useStore((s) => s.label);
  const host = useStore((s) => s.host);
  const port = useStore((s) => s.port);
  const username = useStore((s) => s.username);
  const authMethod = useStore((s) => s.authMethod);
  const password = useStore((s) => s.password);
  const privateKey = useStore((s) => s.privateKey);
  const mhoPath = useStore((s) => s.mhoPath);
  const connecting = useStore((s) => s.connecting);
  const error = useStore((s) => s.error);
  const savedConfigs = useStore((s) => s.savedConfigs);
  const selectedConfigId = useStore((s) => s.selectedConfigId);

  const setField = useStore((s) => s.setField);
  const setAuthMethod = useStore((s) => s.setAuthMethod);
  const loadConfig = useStore((s) => s.loadConfig);
  const newConfig = useStore((s) => s.newConfig);
  const saveCurrentConfig = useStore((s) => s.saveCurrentConfig);
  const removeConfig = useStore((s) => s.removeConfig);
  const autoFill = useStore((s) => s.autoFill);
  const connect = useStore((s) => s.connect);
  const cancelConnect = useStore((s) => s.cancelConnect);

  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down("sm"));
  const [showPassword, setShowPassword] = useState(false);

  /** Normalize the private key when the user leaves the field. */
  const handlePrivateKeyBlur = useCallback(() => {
    if (privateKey.trim()) {
      setField("privateKey", normalizePrivateKey(privateKey));
    }
  }, [privateKey, setField]);

  /**
   * Smart paste: recognize pasted connection strings and hand the extracted
   * fields to the store. Fields marked `data-raw-paste` are left untouched.
   */
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLElement>) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-raw-paste]")) return;

      const parsed = parseSshInput(e.clipboardData.getData("text"));
      if (!parsed?.host) return;

      e.preventDefault();
      void autoFill(parsed);
    },
    [autoFill],
  );

  const canConnect = host.trim() && username.trim();

  return (
    <Box
      onPaste={handlePaste}
      sx={{
        display: "flex",
        minHeight: "100dvh",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        pt: "calc(var(--safe-area-top) + 16px)",
        pb: "calc(var(--safe-area-bottom) + 16px)",
        position: "relative",
      }}
    >
      {/* ── Language switcher (top right) ───────────── */}
      <Box
        sx={{
          position: "absolute",
          // `env()` with a fallback works even when the `--safe-area-*`
          // variables are not defined (an invalid `calc()` would fall back
          // to `top: auto` and the button would sit mid-page).
          top: "calc(env(safe-area-inset-top, 0px) + 8px)",
          right: "calc(env(safe-area-inset-right, 0px) + 8px)",
          zIndex: 1,
        }}
      >
        <LanguageSwitcher />
      </Box>

      <Paper
        elevation={isNarrow ? 0 : 3}
        sx={{
          width: "100%",
          maxWidth: 440,
          p: isNarrow ? 2 : 4,
          ...(isNarrow && { bgcolor: "transparent" }),
        }}
      >
        {/* ── Header ─────────────────────────────────── */}
        <Box sx={{ textAlign: "center", mb: 3 }}>
          <Box
            component="a"
            href="https://github.com/ahaoboy/mho-tauri"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ display: "inline-block", cursor: "pointer" }}
          >
            <Box component="img" src="/icon.png" alt="Mho Tauri" sx={{ width: 100, height: 100 }} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }} gutterBottom>
            MHO
          </Typography>
        </Box>

        {/* ── Saved configs quick-select ─────────────── */}
        <FormControl size="small" fullWidth sx={{ mb: 2 }}>
          <InputLabel>{t("login.savedConfigs")}</InputLabel>
          <Select
            value={selectedConfigId}
            label={t("login.savedConfigs")}
            onChange={(e) => {
              const id = e.target.value;
              if (id === "__new__") {
                newConfig();
                return;
              }
              const cfg = savedConfigs.find((c) => c.id === id);
              if (cfg) loadConfig(cfg);
            }}
          >
            <MenuItem value="__new__" dense>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "primary.main" }}>
                {t("login.newConfig")}
              </Box>
            </MenuItem>
            {savedConfigs.length === 0 ? (
              <MenuItem disabled dense>
                <em>{t("login.noSavedConfigs")}</em>
              </MenuItem>
            ) : (
              savedConfigs.map((cfg) => (
                <MenuItem key={cfg.id} value={cfg.id} dense>
                  {cfg.label || `${cfg.username}@${cfg.host}:${cfg.port}`}
                </MenuItem>
              ))
            )}
          </Select>
        </FormControl>

        {/* ── Form ───────────────────────────────────── */}
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!connecting) void connect();
          }}
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          {/* Config name */}
          <TextField
            label={t("login.configName")}
            placeholder={t("login.configNamePlaceholder")}
            value={label}
            onChange={(e) => setField("label", e.target.value)}
          />

          {/* Host + Port */}
          <Box sx={{ display: "flex", gap: 1.5 }}>
            <TextField
              label={t("login.host")}
              placeholder={t("login.hostPlaceholder")}
              value={host}
              onChange={(e) => setField("host", e.target.value)}
              required
              sx={{ flex: 2 }}
            />
            <TextField
              label={t("login.port")}
              type="number"
              value={port}
              onChange={(e) => setField("port", e.target.value)}
              slotProps={{ htmlInput: { min: 1, max: 65535 } }}
              sx={{ flex: 1 }}
            />
          </Box>

          {/* Username */}
          <TextField
            label={t("login.username")}
            placeholder={t("login.usernamePlaceholder")}
            value={username}
            onChange={(e) => setField("username", e.target.value)}
            required
          />

          {/* Auth method */}
          <FormControl>
            <InputLabel>{t("login.authentication")}</InputLabel>
            <Select
              value={authMethod}
              label={t("login.authentication")}
              onChange={(e) => {
                setAuthMethod(e.target.value as AuthMethod);
              }}
            >
              <MenuItem value="password">
                <Password sx={{ mr: 1, fontSize: 18 }} />
                {t("login.password")}
              </MenuItem>
              <MenuItem value="privateKey">
                <Key sx={{ mr: 1, fontSize: 18 }} />
                {t("login.privateKey")}
              </MenuItem>
            </Select>
          </FormControl>

          {/* Password / Private Key */}
          {authMethod === "password" ? (
            <TextField
              label={t("login.password")}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setField("password", e.target.value)}
              placeholder={t("login.passwordPlaceholder")}
              slotProps={{
                htmlInput: { "data-raw-paste": "" },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowPassword((v) => !v)}
                        edge="end"
                        tabIndex={-1}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
          ) : (
            <TextField
              label={t("login.privateKey")}
              multiline
              minRows={4}
              maxRows={8}
              value={privateKey}
              onChange={(e) => setField("privateKey", e.target.value)}
              onBlur={handlePrivateKeyBlur}
              placeholder={t("login.privateKeyPlaceholder")}
              slotProps={{
                htmlInput: {
                  "data-raw-paste": "",
                  sx: { fontFamily: "monospace", fontSize: 13 },
                },
              }}
            />
          )}

          {/* Mho binary path */}
          <TextField
            label={t("login.mhoPath")}
            value={mhoPath}
            onChange={(e) => setField("mhoPath", e.target.value)}
            placeholder="mho"
            helperText={t("login.mhoPathHelper")}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Terminal sx={{ fontSize: 18, color: "text.secondary" }} />
                  </InputAdornment>
                ),
              },
            }}
          />

          {/* Error */}
          {error && (
            <FormHelperText error sx={{ mx: 0, whiteSpace: "pre-line" }}>
              {error}
            </FormHelperText>
          )}

          {/* Action buttons */}
          <Box sx={{ display: "flex", gap: 1 }}>
            {connecting ? (
              <Button
                type="button"
                variant="outlined"
                color="error"
                onClick={() => void cancelConnect()}
                startIcon={<CircularProgress size={16} color="inherit" />}
                sx={{ flex: 2 }}
              >
                {t("login.cancel")}
              </Button>
            ) : (
              <Button type="submit" variant="contained" disabled={!canConnect} sx={{ flex: 2 }}>
                {t("login.connect")}
              </Button>
            )}
            <Button
              variant="contained"
              color="primary"
              onClick={saveCurrentConfig}
              disabled={!canConnect || connecting}
              title={t("login.saveCurrentConfig")}
              sx={{ minWidth: 40, px: 1 }}
            >
              <Save fontSize="small" />
            </Button>
            {selectedConfigId && (
              <Button
                variant="contained"
                color="error"
                onClick={() => removeConfig(selectedConfigId)}
                disabled={connecting}
                title={t("login.deleteSelectedConfig")}
                sx={{ minWidth: 40, px: 1 }}
              >
                <Delete fontSize="small" />
              </Button>
            )}
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
