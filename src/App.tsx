// ── Crash Tauri — main application controller ─────────────────────────────

import { useState, useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CssBaseline } from "@mui/material";
import { useAutoOrientation } from "./hooks/useAutoOrientation";
import { isMobile } from "./utils/platform";
import type { AuthMethod, SshConfig, SavedConfig } from "./types";
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
  const [crashPath, setCrashPath] = useState("crash");
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
      crashPath: setCrashPath,
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
    setCrashPath(config.crashPath ?? "crash");
    setLabelEdited(true);
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
      crashPath,
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
    crashPath,
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
      await invoke("execute_crash", {
        sshConfig,
        crashPath: "echo",
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
        crashPath,
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
    crashPath,
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
      crashPath,
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
    }),
    [
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
      handleFieldChange,
      handleConnect,
      handleLoadConfig,
      handleSaveConfig,
      handleDeleteConfig,
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
          crashPath={crashPath}
          sshConfig={sshConfig}
          onDisconnect={handleDisconnect}
        />
      ) : (
        <LoginForm {...loginFormProps} />
      )}
    </>
  );
}
