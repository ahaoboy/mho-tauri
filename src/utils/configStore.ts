// ── Configuration persistence using localStorage ────────────────────────

import type { SavedConfig } from "../types";

const STORAGE_KEY = "mho:configs";
const INDEX_KEY = "mho:config-index";
const LAST_USED_KEY = "mho:last-used";

/** Read all stored config IDs in order. */
function getIndex(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch (e) {
    console.warn("Failed to read config index:", e);
    return [];
  }
}

/** Persist the index array. */
function saveIndex(ids: string[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

/** Load all saved configurations, ordered by index. */
export function loadAllConfigs(): SavedConfig[] {
  const ids = getIndex();
  const configs: SavedConfig[] = [];
  for (const id of ids) {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${id}`);
    if (raw) {
      try {
        configs.push(JSON.parse(raw) as SavedConfig);
      } catch (e) {
        console.warn("Skipping corrupted config entry:", e);
      }
    }
  }
  return configs;
}

/** Load a single configuration by id. */
export function loadConfig(id: string): SavedConfig | null {
  const raw = localStorage.getItem(`${STORAGE_KEY}:${id}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedConfig;
  } catch (e) {
    console.warn("Failed to load config:", e);
    return null;
  }
}

/** Save a configuration (creates or updates). Returns the saved config. */
export function saveConfig(config: SavedConfig): void {
  const ids = getIndex();
  if (!ids.includes(config.id)) {
    ids.push(config.id);
    saveIndex(ids);
  }
  localStorage.setItem(`${STORAGE_KEY}:${config.id}`, JSON.stringify(config));
}

/** Delete a configuration by id. */
export function deleteConfig(id: string): void {
  const ids = getIndex().filter((i) => i !== id);
  saveIndex(ids);
  localStorage.removeItem(`${STORAGE_KEY}:${id}`);
}

/** Remember the last successfully connected config ID. */
export function setLastUsedConfigId(id: string): void {
  localStorage.setItem(LAST_USED_KEY, id);
}

/** Retrieve the last successfully connected config ID, if any. */
export function getLastUsedConfigId(): string | null {
  const raw = localStorage.getItem(LAST_USED_KEY);
  if (!raw) return null;
  // Validate that the config still exists
  if (!localStorage.getItem(`${STORAGE_KEY}:${raw}`)) {
    localStorage.removeItem(LAST_USED_KEY);
    return null;
  }
  return raw;
}

/** Generate a unique id for a new config based on timestamp. */
export function generateConfigId(): string {
  return `cfg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
