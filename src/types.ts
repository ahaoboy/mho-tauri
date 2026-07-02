// ── Shared types for the Crash Tauri wrapper application ────────────────────

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
  /** Path to the crash binary on the remote host (default: "crash"). */
  crashPath: string;
}

/** Predefined crash commands available in the dashboard. */
export interface CrashCommandDef {
  id: string;
  label: string;
  description: string;
  /** The crash subcommand and its arguments. */
  args: string[];
  /** Whether this command requires a URL input (e.g., "config url"). */
  needsUrl?: boolean;
}

/** Execution status of a command. */
export type ExecutionStatus = "idle" | "running" | "success" | "error";

/** State of a single command execution. */
export interface CommandState {
  status: ExecutionStatus;
  output: CommandOutput | null;
  error: string | null;
}
