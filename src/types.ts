// ── Shared types for the Mho Tauri wrapper application ────────────────────

/** Available authentication methods for SSH. */
export type AuthMethod = "password" | "privateKey";

/** SSH connection parameters sent to the Rust backend. */
export interface SshConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

/** Output from a remote command execution. */
export interface CommandOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
}

/** A saved connection configuration, identified by a unique id. */
export interface SavedConfig {
  id: string;
  label: string;
  host: string;
  port: string;
  username: string;
  authMethod: AuthMethod;
  password: string;
  privateKey: string;
  /** Path to the mho binary on the remote host (default: "mho"). */
  mhoPath: string;
}

/** Predefined mho commands available in the dashboard. */
export interface MhoCommandDef<T extends string = string> {
  id: T;
  label: string;
  /** The mho subcommand and its arguments. */
  args: string[];
}

/** Connection details extracted from pasted text. */
export interface ParsedSshInput {
  username?: string;
  /** Password found in `sshpass -p …` or `user:password@host` forms. */
  password?: string;
  host?: string;
  port?: string;
  /** Local path to a private key referenced by `ssh -i <path>`. */
  privateKeyPath?: string;
}

/** Execution status of a command. */
export type ExecutionStatus = "idle" | "running" | "success" | "error";

/** State of a single command execution. */
export interface CommandState {
  status: ExecutionStatus;
  output: CommandOutput | null;
  error: string | null;
}

export const MHO_COMMANDS = [
  { id: "status", label: "Status", args: ["status"] },
  { id: "start", label: "Start", args: ["start", "-f"] },
  { id: "stop", label: "Stop", args: ["stop", "-f"] },
  { id: "update", label: "Update", args: ["config", "update", "-f"] },
  { id: "config", label: "Config", args: ["config", "url"] },
  { id: "upgrade", label: "Upgrade", args: ["upgrade", "mho-assets"] },
] as const satisfies readonly MhoCommandDef[];

/** Id type derived from the command definitions above. */
export type MhoCommandId = (typeof MHO_COMMANDS)[number]["id"];

/** Default command selected on first load. */
export const DEFAULT_COMMAND_ID: MhoCommandId = "start";

/** Commands that require a URL input argument. */
const URL_COMMANDS: ReadonlySet<MhoCommandId> = new Set(["config"]);

/** Whether the given command requires a URL input. */
export function isUrlCommand(id: MhoCommandId): boolean {
  return URL_COMMANDS.has(id);
}

// ── Workspace tabs ───────────────────────────────────────────────────────

/** Tabs available after connecting. */
export type WorkspaceTab = "terminal" | "install";

// ── Remote installation ──────────────────────────────────────────────────

/** Information reported by the remote host probe. */
export interface RemoteInfo {
  os: string;
  arch: string;
  /** `musl` or `gnu` (Linux only). */
  libc: string;
  home: string;
  user: string;
  mho_path: string;
  /** Rust target triple detected on the remote host. */
  target: string;
  /** Whether a bundle is published for `target`. */
  target_supported: boolean;
  mho_exists: boolean;
  mho_resolved: string | null;
  mho_version: string | null;
  /** Suggested installation directory (folder of the configured binary). */
  install_dir: string;
}

/** State of a directory on the remote host. */
export interface DirStatus {
  dir: string;
  exists: boolean;
  writable: boolean;
  /** The directory is missing, but its parent is writable. */
  creatable: boolean;
  total_bytes: number;
  available_bytes: number;
  /** Whether `available_bytes` is a real measurement (0 can mean "full"). */
  space_known: boolean;
  /** Path the space figures came from (the nearest existing ancestor). */
  space_from: string;
  error: string | null;
}

/** Options exposed by the backend for the install page. */
export interface InstallOptions {
  /** Suggested target triple for this host. */
  target: string;
  targets: string[];
  proxies: string[];
}

/** Result of a successful install. */
export interface InstallReport {
  /** Absolute path of the installed binary on the remote host. */
  path: string;
}

/** Download proxy services supported by `github-proxy`. */
export type InstallProxy = "github" | "gh-proxy" | "xget" | "jsdelivr" | "statically";
