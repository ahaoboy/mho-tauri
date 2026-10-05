// ── Connection-string parser ─────────────────────────────────────────────
//
// Recognizes the common shapes of pasted connection info so the login form
// can be pre-filled after a paste:
//
//   ssh user@host -p 2222
//   ssh user@host -p 2222 -i ~/.ssh/id_ed25519
//   sshpass -p 'secret' ssh user@host
//   ssh://user:secret@host:2222
//   https://host:9090/ui
//   user@host:2222
//   host
//
// A pasted wrapper command (e.g. a Windows Terminal `commandline`) is also
// handled: the portion starting at the `ssh` keyword is parsed in isolation.

import type { ParsedSshInput } from "../types";

/** ssh flags that consume the next token as their value. */
const FLAGS_WITH_VALUE = new Set([
  "-b",
  "-c",
  "-D",
  "-E",
  "-e",
  "-F",
  "-I",
  "-i",
  "-J",
  "-L",
  "-l",
  "-m",
  "-O",
  "-o",
  "-p",
  "-Q",
  "-R",
  "-S",
  "-W",
  "-w",
]);

/** IPv4 address, bracketed IPv6 address, or dotted hostname. */
const HOST_RE =
  /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-fA-F:]+\]|[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+)$/;

/** `[user[:password]@]host[:port]`, with bracketed IPv6 support. */
const TARGET_RE = /^(?:([^@\s]+)@)?(\[[0-9a-fA-F:]+\]|[^\s:@/]+)(?::(\d+))?$/;

/** Whether the value looks like a usable host. */
function isValidHost(host: string): boolean {
  return host === "localhost" || HOST_RE.test(host);
}

/** Strip one layer of matching surrounding quotes. */
function stripQuotes(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && (v[0] === "'" || v[0] === '"') && v[v.length - 1] === v[0]) {
    return v.slice(1, -1);
  }
  return v;
}

/** Split a command string into tokens, honouring single/double quotes. */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: string | null = null;
  let started = false;

  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started || current) tokens.push(current);
      current = "";
      started = false;
      continue;
    }
    current += ch;
  }
  if (started || current) tokens.push(current);
  return tokens;
}

/** Index of the standalone `ssh` keyword, or -1 when absent. */
function findSshStart(text: string): number {
  const match = /(^|[\s'"\\/])(?:[^\s'"\\/]*[\\/])?(ssh(?:\.exe)?)(?=\s|$)/i.exec(text);
  return match ? match.index + match[1].length : -1;
}

/** Parse `[user[:password]@]host[:port]` into its parts. */
function parseTarget(text: string): ParsedSshInput | null {
  const match = TARGET_RE.exec(stripQuotes(text));
  if (!match) return null;

  const [, userInfo, host, port] = match;
  if (!isValidHost(host)) return null;

  let username: string | undefined;
  let password: string | undefined;
  if (userInfo) {
    const sep = userInfo.indexOf(":");
    username = sep === -1 ? userInfo : userInfo.slice(0, sep) || undefined;
    password = sep === -1 ? undefined : userInfo.slice(sep + 1) || undefined;
  }

  return { username, password, host, port: port || undefined };
}

/**
 * Password from an `sshpass` wrapper, e.g. `sshpass -p 'secret' ssh …`.
 * Returns `undefined` for `-e`/`-f` forms, whose secret is not in the text.
 */
function extractSshpassPassword(text: string): string | undefined {
  const tokens = tokenize(text);
  const start = tokens.findIndex((t) => /(^|[\\/])sshpass(\.exe)?$/i.test(t));
  if (start === -1) return undefined;

  for (let i = start + 1; i < tokens.length; i++) {
    const token = tokens[i];
    // Reached the real ssh command — stop scanning.
    if (/^(.*[\\/])?ssh(\.exe)?$/i.test(token)) return undefined;
    if (token === "-p") return tokens[i + 1] || undefined;
    if (token.startsWith("-p")) return token.slice(2) || undefined;
    if (token === "-e" || token.startsWith("-f")) return undefined;
  }
  return undefined;
}

/** Parse a `scheme://…` URL, e.g. `https://host:9090/ui`. */
function parseUrl(text: string): ParsedSshInput | null {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }

  if (!isValidHost(url.hostname)) return null;

  return {
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    host: url.hostname,
    port: url.port || undefined,
  };
}

/** Parse an `ssh …` invocation from an already-tokenized command. */
function parseSshTokens(tokens: string[]): ParsedSshInput | null {
  // tokens[0] is the ssh executable; everything after is its arguments.
  const args = tokens.slice(1).map(stripQuotes);

  let username: string | undefined;
  let password: string | undefined;
  let host: string | undefined;
  let port: string | undefined;
  let privateKeyPath: string | undefined;
  let sawDestination = false;

  for (let i = 0; i < args.length; i++) {
    const token = args[i];

    if (token.startsWith("-") && token.length > 1) {
      const flag = token.slice(0, 2);
      if (FLAGS_WITH_VALUE.has(flag)) {
        // Support both `-p 2222` and `-p2222`.
        const value = token.length > 2 ? token.slice(2) : args[++i];
        if (flag === "-p") port ??= value;
        else if (flag === "-l") username ??= value;
        else if (flag === "-i") privateKeyPath ??= value;
      }
      continue;
    }

    // Options may follow the destination (`ssh user@host -p 2222`), so keep
    // scanning until the next positional token, which starts the remote command.
    if (sawDestination) break;
    sawDestination = true;

    const target = parseTarget(token);
    if (target) {
      username ??= target.username;
      password ??= target.password;
      host ??= target.host;
      port ??= target.port;
    }
  }

  if (!host) return null;
  return { username, password, host, port, privateKeyPath };
}

/**
 * Extract connection details from pasted text.
 *
 * Tries, in order: an embedded `ssh …` command (optionally wrapped in
 * `sshpass`), a `scheme://` URL, and a bare `[user@]host[:port]` target.
 *
 * @returns The parsed fields, or `null` when nothing recognizable was found.
 */
export function parseSshInput(raw: string): ParsedSshInput | null {
  const text = raw.trim();
  if (!text) return null;

  // 1. `ssh …` command, possibly wrapped in sshpass or a larger shell command.
  const sshStart = findSshStart(text);
  if (sshStart !== -1) {
    const parsed = parseSshTokens(tokenize(text.slice(sshStart)));
    if (parsed) {
      parsed.password ??= extractSshpassPassword(text);
      return parsed;
    }
  }

  // 2. `scheme://…` URL.
  const url = parseUrl(stripQuotes(text));
  if (url) return url;

  // 3. Bare `[user@]host[:port]` target (single token only).
  const firstToken = text.split(/\s+/)[0];
  if (firstToken !== text) {
    const target = parseTarget(firstToken);
    if (target) return target;
  }
  return parseTarget(text);
}
