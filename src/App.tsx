// ── Mho Tauri — main application controller ─────────────────────────────

import { useState, useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { homeDir, join } from "@tauri-apps/api/path";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { CssBaseline } from "@mui/material";
import { useAutoOrientation } from "./hooks/useAutoOrientation";
import { isMobile } from "./utils/platform";
import type { AuthMethod, ParsedSshInput, SshConfig, SavedConfig } from "./types";
import { normalizePrivateKey } from "./utils/keyNormalizer";
import {
  loadAllConfigs,
  saveConfig,
  deleteConfig,
  generateConfigId,
  getLastUsedConfigId,
  setLastUsedConfigId,
} from "./utils/configStore";
import LoginForm from "./components/LoginForm";
import Dashboard from "./components/Dashboard";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Expand a leading `~` to the user's home directory. */
async function expandHome(path: string): Promise<string> {
  const match = /^~[/\\]?(.*)$/.exec(path);
  if (!match) return path;
  const home = await homeDir();
  return match[1] ? join(home, match[1]) : home;
}

// ── App component ────────────────────────────────────────────────────────

export default function App() {
  // ── Connection form state ──────────────────────────────────
  const [label, setLabel] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("password");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [mhoPath, setMhoPath] = useState("mho");
  // Track whether the user has manually edited the config label
  const [labelEdited, setLabelEdited] = useState(false);

  // ── Login / dashboard state ────────────────────────────────
  const [loggedIn, setLoggedIn] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  // ── Config management state ────────────────────────────────
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState("");

  // Load saved configs on mount, and auto-select the last used one
  useEffect(() => {
    const configs = loadAllConfigs();
    setSavedConfigs(configs);

    const lastId = getLastUsedConfigId();
    if (lastId) {
      const lastCfg = configs.find((c) => c.id === lastId);
      if (lastCfg) {
        handleLoadConfig(lastCfg);
        setSelectedConfigId(lastCfg.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reload configs helper ──────────────────────────────────
  const reloadConfigs = useCallback(() => {
    setSavedConfigs(loadAllConfigs());
  }, []);

  // ── Auto-generate default label from host + username ───────
  useEffect(() => {
    if (!labelEdited && host && username) {
      setLabel(`${username}@${host}`);
    } else if (!host && !username) {
      setLabel("");
    }
  }, [host, username, labelEdited]);

  // ── Update a single form field ─────────────────────────────
  const handleFieldChange = useCallback((field: string, value: string) => {
    if (field === "label") {
      setLabel(value);
      setLabelEdited(true);
      return;
    }
    const setters: Record<string, (v: string) => void> = {
      host: setHost,
      port: setPort,
      username: setUsername,
      password: setPassword,
      privateKey: setPrivateKey,
      mhoPath: setMhoPath,
    };
    setters[field]?.(value);
  }, []);

  // ── Load a saved config into the form ──────────────────────
  const handleLoadConfig = useCallback((config: SavedConfig) => {
    setLabel(config.label);
    setHost(config.host);
    setPort(config.port);
    setUsername(config.username);
    setAuthMethod(config.authMethod);
    setPassword(config.password);
    setPrivateKey(config.privateKey);
    setMhoPath(config.mhoPath ?? "mho");
    setLabelEdited(true);
  }, []);

  // ── Pre-fill the form from pasted connection info ──────────
  const handleAutoFill = useCallback(async (parsed: ParsedSshInput) => {
    if (parsed.host) setHost(parsed.host);
    if (parsed.port) setPort(parsed.port);
    if (parsed.username) setUsername(parsed.username);
    // The form no longer matches whatever config was selected.
    setSelectedConfigId("");
    setLabelEdited(false);
    setError("");

    // A private key takes precedence over a password.
    if (parsed.privateKeyPath) {
      setAuthMethod("privateKey");
      setPassword("");
      try {
        const raw = await readTextFile(await expandHome(parsed.privateKeyPath));
        const normalized = normalizePrivateKey(raw);
        if (!normalized) {
          setError(`Unrecognized private key format: ${parsed.privateKeyPath}`);
          return;
        }
        setPrivateKey(normalized);
      } catch (e) {
        setError(`Failed to read ${parsed.privateKeyPath}: ${e}`);
      }
      return;
    }

    // sshpass / `user:password@host` style pastes switch to password auth.
    if (parsed.password) {
      setAuthMethod("password");
      setPassword(parsed.password);
    }
  }, []);

  // ── Save current form values ───────────────────────────────
  const handleSaveConfig = useCallback(() => {
    if (!host || !username) return;
    const id = selectedConfigId || generateConfigId();
    const config: SavedConfig = {
      id,
      label: label || `${username}@${host}`,
      host,
      port,
      username,
      authMethod,
      password,
      privateKey,
      mhoPath,
    };
    saveConfig(config);
    setSelectedConfigId(id);
    setLabelEdited(true);
    reloadConfigs();
  }, [
    selectedConfigId,
    label,
    host,
    port,
    username,
    authMethod,
    password,
    privateKey,
    mhoPath,
    reloadConfigs,
  ]);

  // ── Delete the currently selected config ───────────────────
  const handleDeleteConfig = useCallback(
    (id: string) => {
      deleteConfig(id);
      reloadConfigs();
    },
    [reloadConfigs],
  );

  // ── Build SSH config from form values ──────────────────────
  const buildSshConfig = useCallback((): SshConfig => {
    const config: SshConfig = {
      host,
      port: parseInt(port, 10) || 22,
      username,
    };
    if (authMethod === "privateKey" && privateKey) {
      config.privateKey = normalizePrivateKey(privateKey);
    } else if (password) {
      config.password = password;
    }
    return config;
  }, [host, port, username, authMethod, privateKey, password]);

  // ── Connect / Login ────────────────────────────────────────
  const handleConnect = useCallback(async () => {
    if (!host || !username) return;

    setConnecting(true);
    setError("");

    try {
      // Validate connection by running a simple echo command
      const sshConfig = buildSshConfig();
      await invoke("execute_mho", {
        sshConfig,
        mhoPath: "echo",
        args: ["connected"],
      });

      setLoggedIn(true);

      // Auto-save config on successful connection
      const existing =
        savedConfigs.find((c) => c.id === selectedConfigId) ??
        savedConfigs.find((c) => c.host === host && c.username === username);
      const config: SavedConfig = {
        id: existing?.id ?? generateConfigId(),
        label: label || existing?.label || `${username}@${host}`,
        host,
        port,
        username,
        authMethod,
        password,
        privateKey,
        mhoPath,
      };
      saveConfig(config);
      setLastUsedConfigId(config.id);
      reloadConfigs();
      setSelectedConfigId(config.id);
    } catch (e) {
      console.error("Connection failed:", e);
      setError(String(e));
    } finally {
      setConnecting(false);
    }
  }, [
    host,
    port,
    username,
    authMethod,
    password,
    privateKey,
    mhoPath,
    buildSshConfig,
    savedConfigs,
    selectedConfigId,
    label,
    reloadConfigs,
  ]);

  // ── Disconnect / Logout ────────────────────────────────────
  const handleDisconnect = useCallback(() => {
    setLoggedIn(false);
    setError("");
  }, []);

  // ── Disable right-click context menu ──────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  // ── Window orientation ────────────────────────────────────
  const orientation =
    loggedIn && !isMobile() && screen.width > screen.height ? "landscape" : "portrait";
  useAutoOrientation(orientation);

  // ── Memoized login form props ──────────────────────────────
  const loginFormProps = useMemo(
    () => ({
      label,
      host,
      port,
      username,
      authMethod,
      password,
      privateKey,
      mhoPath,
      connecting,
      error,
      savedConfigs,
      onChange: handleFieldChange,
      onAuthMethodChange: setAuthMethod,
      onConnect: handleConnect,
      onLoadConfig: handleLoadConfig,
      onSaveConfig: handleSaveConfig,
      onDeleteConfig: handleDeleteConfig,
      selectedConfigId,
      onSelectConfig: setSelectedConfigId,
      onAutoFill: handleAutoFill,
    }),
    [
      label,
      host,
      port,
      username,
      authMethod,
      password,
      privateKey,
      mhoPath,
      connecting,
      error,
      savedConfigs,
      handleFieldChange,
      handleConnect,
      handleLoadConfig,
      handleSaveConfig,
      handleDeleteConfig,
      handleAutoFill,
      selectedConfigId,
    ],
  );

  // ── Memoized SSH config for commands ──────────────────────
  const sshConfig = useMemo(buildSshConfig, [buildSshConfig]);

  return (
    <>
      <CssBaseline />
      {loggedIn ? (
        <Dashboard
          username={username}
          host={host}
          port={port}
          mhoPath={mhoPath}
          sshConfig={sshConfig}
          onDisconnect={handleDisconnect}
        />
      ) : (
        <LoginForm {...loginFormProps} />
      )}
    </>
  );
}
