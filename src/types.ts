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
  { id: "update", label: "Update", args: ["update-url", "-f"] },
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
