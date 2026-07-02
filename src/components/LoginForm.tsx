// ── Crash Tauri login form component ──────────────────────────────────────

import { useState, useCallback } from "react";
import {
  Box,
  Button,
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
import type { AuthMethod, SavedConfig } from "../types";
import { normalizePrivateKey } from "../utils/keyNormalizer";
import { generateConfigId } from "../utils/configStore";

// ── Props ────────────────────────────────────────────────────────────────

interface LoginFormProps {
  /** Config label (auto-generated default, user-customizable). */
  label: string;
  /** Current form values. */
  host: string;
  port: string;
  username: string;
  authMethod: AuthMethod;
  password: string;
  privateKey: string;
  /** Path to the crash binary on the remote host. */
  crashPath: string;
  /** "true" when a login attempt is in progress. */
  connecting: boolean;
  /** Error message to display. */
  error: string;
  /** List of saved configs for quick-load. */
  savedConfigs: SavedConfig[];
  /** Called when any field changes. */
  onChange: (field: string, value: string) => void;
  /** Called when auth method changes. */
  onAuthMethodChange: (method: AuthMethod) => void;
  /** Called when the user clicks Connect. */
  onConnect: () => void;
  /** Called to load a saved config. */
  onLoadConfig: (config: SavedConfig) => void;
  /** Called to save current form as a new config. */
  onSaveConfig: () => void;
  /** Called to delete the currently selected config. */
  onDeleteConfig: (id: string) => void;
  /** Currently selected config ID (controlled). */
  selectedConfigId: string;
  /** Called when the dropdown selection changes. */
  onSelectConfig: (id: string) => void;
}

/** Return a fresh default config object with a unique id. */
function getDefaultConfig(): SavedConfig {
  return {
    id: generateConfigId(),
    label: "",
    host: "",
    port: "22",
    username: "",
    authMethod: "password",
    password: "",
    privateKey: "",
    crashPath: "crash",
  };
}

// ── Component ────────────────────────────────────────────────────────────

export default function LoginForm({
  label,
  host,
  port,
  username,
  authMethod,
  password,
  privateKey,
  crashPath,
  connecting,
  error,
  savedConfigs,
  onChange,
  onAuthMethodChange,
  onConnect,
  onLoadConfig,
  onSaveConfig,
  onDeleteConfig,
  selectedConfigId,
  onSelectConfig,
}: LoginFormProps) {
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down("sm"));
  const [showPassword, setShowPassword] = useState(false);

  /** Track manual edits to clear the dropdown selection. */
  const handleFieldChange = useCallback(
    (field: string, value: string) => {
      onSelectConfig("");
      onChange(field, value);
    },
    [onChange, onSelectConfig],
  );

  /** Normalize the private key when the user leaves the field. */
  const handlePrivateKeyBlur = useCallback(() => {
    if (privateKey.trim()) {
      handleFieldChange("privateKey", normalizePrivateKey(privateKey));
    }
  }, [privateKey, handleFieldChange]);

  const canConnect = host.trim() && username.trim();

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100dvh",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        pt: "calc(var(--safe-area-top) + 16px)",
        pb: "calc(var(--safe-area-bottom) + 16px)",
      }}
    >
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
            href="https://github.com/ahaoboy/crash-tauri"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ display: "inline-block", cursor: "pointer" }}
          >
            <Box
              component="img"
              src="/icon.png"
              alt="Crash Tauri"
              sx={{ width: 100, height: 100 }}
            />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }} gutterBottom>
            Crash
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Remote crash command wrapper
          </Typography>
        </Box>

        {/* ── Saved configs quick-select ─────────────── */}
        <FormControl size="small" fullWidth sx={{ mb: 2 }}>
          <InputLabel>Saved Configurations</InputLabel>
          <Select
            value={selectedConfigId}
            label="Saved Configurations"
            onChange={(e) => {
              const id = e.target.value;
              if (id === "__new__") {
                onSelectConfig("");
                onLoadConfig(getDefaultConfig());
                return;
              }
              const cfg = savedConfigs.find((c) => c.id === id);
              if (cfg) {
                onSelectConfig(cfg.id);
                onLoadConfig(cfg);
              }
            }}
          >
            <MenuItem value="__new__" dense>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "primary.main" }}>
                + New config
              </Box>
            </MenuItem>
            {savedConfigs.length === 0 ? (
              <MenuItem disabled dense>
                <em>No saved configs</em>
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
            onConnect();
          }}
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          {/* Config name */}
          <TextField
            label="Config Name"
            placeholder="my-server"
            value={label}
            onChange={(e) => handleFieldChange("label", e.target.value)}
          />

          {/* Host + Port */}
          <Box sx={{ display: "flex", gap: 1.5 }}>
            <TextField
              label="Host"
              placeholder="192.168.1.1"
              value={host}
              onChange={(e) => handleFieldChange("host", e.target.value)}
              required
              sx={{ flex: 2 }}
            />
            <TextField
              label="Port"
              type="number"
              value={port}
              onChange={(e) => handleFieldChange("port", e.target.value)}
              slotProps={{ htmlInput: { min: 1, max: 65535 } }}
              sx={{ flex: 1 }}
            />
          </Box>

          {/* Username */}
          <TextField
            label="Username"
            placeholder="root"
            value={username}
            onChange={(e) => handleFieldChange("username", e.target.value)}
            required
          />

          {/* Auth method */}
          <FormControl>
            <InputLabel>Authentication</InputLabel>
            <Select
              value={authMethod}
              label="Authentication"
              onChange={(e) => {
                onSelectConfig("");
                onAuthMethodChange(e.target.value as AuthMethod);
              }}
            >
              <MenuItem value="password">
                <Password sx={{ mr: 1, fontSize: 18 }} />
                Password
              </MenuItem>
              <MenuItem value="privateKey">
                <Key sx={{ mr: 1, fontSize: 18 }} />
                Private Key
              </MenuItem>
            </Select>
          </FormControl>

          {/* Password / Private Key */}
          {authMethod === "password" ? (
            <TextField
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => handleFieldChange("password", e.target.value)}
              placeholder="••••••••"
              slotProps={{
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
              label="Private Key"
              multiline
              minRows={4}
              maxRows={8}
              value={privateKey}
              onChange={(e) => handleFieldChange("privateKey", e.target.value)}
              onBlur={handlePrivateKeyBlur}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----\n..."
              slotProps={{
                htmlInput: {
                  sx: { fontFamily: "monospace", fontSize: 13 },
                },
              }}
            />
          )}

          {/* Crash binary path */}
          <TextField
            label="Crash Binary Path"
            value={crashPath}
            onChange={(e) => handleFieldChange("crashPath", e.target.value)}
            placeholder="crash"
            helperText="Path to the crash binary on the remote host"
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
            <FormHelperText error sx={{ mx: 0 }}>
              {error}
            </FormHelperText>
          )}

          {/* Action buttons */}
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              type="submit"
              variant="contained"
              loading={connecting}
              loadingPosition="start"
              disabled={!canConnect}
              sx={{ flex: 2 }}
            >
              {connecting ? "Connecting…" : "Connect"}
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={onSaveConfig}
              disabled={!canConnect}
              title="Save current config"
              sx={{ minWidth: 40, px: 1 }}
            >
              <Save fontSize="small" />
            </Button>
            {selectedConfigId && (
              <Button
                variant="contained"
                color="error"
                onClick={() => {
                  const id = selectedConfigId;
                  onSelectConfig("");
                  onDeleteConfig(id);
                  onLoadConfig(getDefaultConfig());
                }}
                title="Delete selected config"
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
