// ── Global application state (zustand) ──────────────────────────────────
//
// Everything that outlives a single component lives here: the connection
// form, the session, the saved configs and the remote mho status. Components
// subscribe to the slices they render, so an install only has to patch the
// store for the tab title, the status panel and the terminal to update.

import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { homeDir, join } from "@tauri-apps/api/path";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { isMobile } from "./utils/platform";
import { normalizePrivateKey } from "./utils/keyNormalizer";
import {
  deleteConfig,
  generateConfigId,
  getLastUsedConfigId,
  loadAllConfigs,
  saveConfig,
  setLastUsedConfigId,
} from "./utils/configStore";
import type {
  AuthMethod,
  ParsedSshInput,
  RemoteInfo,
  SavedConfig,
  SshConfig,
  WorkspaceTab,
} from "./types";

// ── Form <-> config helpers ──────────────────────────────────────────────

/** Fields the login form can edit. */
export type FormField =
  | "label"
  | "host"
  | "port"
  | "username"
  | "password"
  | "privateKey"
  | "mhoPath";

type Form = {
  label: string;
  host: string;
  port: string;
  username: string;
  authMethod: AuthMethod;
  password: string;
  privateKey: string;
  mhoPath: string;
};

const EMPTY_FORM: Form = {
  label: "",
  host: "",
  port: "22",
  username: "",
  authMethod: "password",
  password: "",
  privateKey: "",
  mhoPath: "mho",
};

function formOf(config: SavedConfig): Form {
  return {
    label: config.label,
    host: config.host,
    port: config.port,
    username: config.username,
    authMethod: config.authMethod,
    password: config.password,
    privateKey: config.privateKey,
    mhoPath: config.mhoPath ?? "mho",
  };
}

/** Build the SSH parameters sent to the Rust backend. */
function sshConfigOf(form: Form): SshConfig {
  const config: SshConfig = {
    host: form.host,
    port: parseInt(form.port, 10) || 22,
    username: form.username,
  };
  if (form.authMethod === "privateKey" && form.privateKey) {
    config.privateKey = normalizePrivateKey(form.privateKey);
  } else if (form.password) {
    config.password = form.password;
  }
  return config;
}

/** `user@host`, or "" until both parts are known. */
function autoLabel(host: string, username: string): string {
  return host && username ? `${username}@${host}` : "";
}

/** Expand a leading `~` to the local home directory. */
async function expandHome(path: string): Promise<string> {
  const match = /^~[/\\]?(.*)$/.exec(path);
  if (!match) return path;
  const home = await homeDir();
  return match[1] ? join(home, match[1]) : home;
}

/** Id of the newest probe; results from any older one are discarded. */
let probeGeneration = 0;

// ── Initial state (last used config, if any) ─────────────────────────────

const initialConfigs = loadAllConfigs();
const lastUsedId = getLastUsedConfigId();
const lastUsed = lastUsedId ? (initialConfigs.find((c) => c.id === lastUsedId) ?? null) : null;
const initialForm = lastUsed ? formOf(lastUsed) : EMPTY_FORM;

// ── Store ────────────────────────────────────────────────────────────────

interface Store extends Form {
  /** Whether the config name was edited by the user (stops auto-naming). */
  labelEdited: boolean;
  /** SSH parameters derived from the form. */
  sshConfig: SshConfig;

  // Session
  loggedIn: boolean;
  connecting: boolean;
  error: string;

  // Saved configs
  savedConfigs: SavedConfig[];
  selectedConfigId: string;

  // Remote host
  remote: RemoteInfo | null;
  probing: boolean;
  probeError: string;
  activeTab: WorkspaceTab;

  // Form actions
  setField: (field: FormField, value: string) => void;
  setAuthMethod: (method: AuthMethod) => void;
  selectConfig: (id: string) => void;
  loadConfig: (config: SavedConfig) => void;
  newConfig: () => void;
  saveCurrentConfig: () => void;
  removeConfig: (id: string) => void;
  autoFill: (parsed: ParsedSshInput) => Promise<void>;

  // Session actions
  connect: () => Promise<void>;
  cancelConnect: () => Promise<void>;
  disconnect: () => void;

  // Remote actions
  probe: (options?: { selectTab?: boolean }) => Promise<void>;
  markInstalled: (path: string) => void;
  setActiveTab: (tab: WorkspaceTab) => void;
}

export const useStore = create<Store>((set, get) => {
  /** Merge a form patch and keep the derived `sshConfig` in sync. */
  const patchForm = (patch: Partial<Form> & Partial<Store>): Partial<Store> => ({
    ...patch,
    sshConfig: sshConfigOf({ ...get(), ...patch }),
  });

  return {
    ...initialForm,
    labelEdited: lastUsed !== null,
    sshConfig: sshConfigOf(initialForm),

    loggedIn: false,
    connecting: false,
    error: "",

    savedConfigs: initialConfigs,
    selectedConfigId: lastUsedId ?? "",

    remote: null,
    probing: false,
    probeError: "",
    activeTab: "terminal",

    // ── Form ──────────────────────────────────────────────
    setField: (field, value) =>
      set((state) => {
        const patch: Partial<Store> = {
          [field]: value,
          selectedConfigId: "",
          ...(field === "label" ? { labelEdited: true } : {}),
        };
        if (field !== "label" && !state.labelEdited) {
          patch.label = autoLabel(
            field === "host" ? value : state.host,
            field === "username" ? value : state.username,
          );
        }
        return patchForm(patch);
      }),

    setAuthMethod: (authMethod) =>
      set({ authMethod, selectedConfigId: "", sshConfig: sshConfigOf({ ...get(), authMethod }) }),

    selectConfig: (selectedConfigId) => set({ selectedConfigId }),

    loadConfig: (config) =>
      set({
        ...formOf(config),
        selectedConfigId: config.id,
        labelEdited: true,
        sshConfig: sshConfigOf(formOf(config)),
      }),

    newConfig: () =>
      set({
        ...EMPTY_FORM,
        selectedConfigId: "",
        labelEdited: false,
        sshConfig: sshConfigOf(EMPTY_FORM),
      }),

    saveCurrentConfig: () => {
      const state = get();
      if (!state.host || !state.username) return;
      const id = state.selectedConfigId || generateConfigId();
      const config: SavedConfig = {
        id,
        label: state.label || `${state.username}@${state.host}`,
        host: state.host,
        port: state.port,
        username: state.username,
        authMethod: state.authMethod,
        password: state.password,
        privateKey: state.privateKey,
        mhoPath: state.mhoPath,
      };
      saveConfig(config);
      set({ selectedConfigId: id, labelEdited: true, savedConfigs: loadAllConfigs() });
    },

    removeConfig: (id) => {
      deleteConfig(id);
      set({ savedConfigs: loadAllConfigs() });
      if (get().selectedConfigId === id) get().newConfig();
    },

    autoFill: async (parsed) => {
      const patch: Partial<Store> = { selectedConfigId: "", labelEdited: false, error: "" };
      if (parsed.host) patch.host = parsed.host;
      if (parsed.port) patch.port = parsed.port;
      if (parsed.username) patch.username = parsed.username;
      set(patchForm(patch));

      // A private key takes precedence over a password.
      if (parsed.privateKeyPath) {
        set(patchForm({ authMethod: "privateKey", password: "" }));
        try {
          const raw = await readTextFile(await expandHome(parsed.privateKeyPath));
          const normalized = normalizePrivateKey(raw);
          if (!normalized) {
            set({ error: `Unrecognized private key format: ${parsed.privateKeyPath}` });
            return;
          }
          set(patchForm({ privateKey: normalized }));
        } catch (e) {
          set({ error: `Failed to read ${parsed.privateKeyPath}: ${e}` });
        }
        return;
      }

      // sshpass / `user:password@host` style pastes switch to password auth.
      if (parsed.password) set(patchForm({ authMethod: "password", password: parsed.password }));
    },

    // ── Session ───────────────────────────────────────────
    connect: async () => {
      const state = get();
      if (!state.host || !state.username || state.connecting) return;

      set({ connecting: true, error: "" });
      try {
        // A remote `echo` validates the connection before the workspace opens.
        await invoke("execute_mho", {
          sshConfig: get().sshConfig,
          mhoPath: "echo",
          args: ["connected"],
          timeoutSecs: 20,
        });

        get().saveCurrentConfig();
        setLastUsedConfigId(get().selectedConfigId);
        set({ loggedIn: true });
        await get().probe({ selectTab: true });
      } catch (e) {
        console.error("Connection failed:", e);
        const message = String(e);
        if (/cancelled/i.test(message)) {
          set({ error: "" });
        } else {
          const hint =
            isMobile() && /timed out/i.test(message)
              ? '\n\nAndroid 17+: allow the "Nearby devices" (local network) permission for MHO, then retry.'
              : "";
          set({ error: message + hint });
        }
      } finally {
        set({ connecting: false });
      }
    },

    cancelConnect: async () => {
      try {
        await invoke("cancel_ssh");
      } catch (e) {
        console.error("Cancel failed:", e);
      }
    },

    disconnect: () => {
      probeGeneration += 1;
      set({
        loggedIn: false,
        connecting: false,
        error: "",
        remote: null,
        probing: false,
        probeError: "",
        activeTab: "terminal",
      });
    },

    // ── Remote ────────────────────────────────────────────
    probe: async (options) => {
      const { sshConfig, mhoPath } = get();
      const target = mhoPath.trim();
      if (!target) return;

      const generation = ++probeGeneration;
      set({ probing: true, probeError: "" });
      try {
        const remote = await invoke<RemoteInfo>("probe_remote", {
          sshConfig,
          mhoPath: target,
        });
        // A newer probe (or a logout) superseded this one.
        if (generation !== probeGeneration) return;
        set({ remote });
        // Only the caller that owns the landing decision may steer the tab.
        if (options?.selectTab) {
          set({ activeTab: remote.mho_exists ? "terminal" : "install" });
        }
      } catch (e) {
        if (generation !== probeGeneration) return;
        console.error("Remote probe failed:", e);
        set({ probeError: String(e) });
      } finally {
        if (generation === probeGeneration) set({ probing: false });
      }
    },

    // Flipping `mho_exists` here is what makes the "Install (required)"
    // label disappear as soon as the install returns.
    markInstalled: (path) => {
      set((state) => ({
        mhoPath: path,
        remote: state.remote
          ? { ...state.remote, mho_exists: true, mho_resolved: path, mho_path: path }
          : state.remote,
        probeError: "",
      }));
      // Persist the new binary path, then confirm it over SSH.
      get().saveCurrentConfig();
      void get().probe();
    },

    setActiveTab: (activeTab) => set({ activeTab }),
  };
});
