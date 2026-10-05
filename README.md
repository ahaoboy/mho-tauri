<p align="center">
  <a href="https://github.com/ahaoboy/mho-tauri" target="_blank" rel="noopener">
    <img src="public/icon.png" alt="SSH Client" width="96" />
  </a>
</p>

<h1 align="center">SSH Client — Tauri Edition</h1>

<p align="center">
  A cross-platform SSH client built with <strong>Tauri</strong> + <strong>React</strong> + <strong>MUI</strong>.
  <br/>
  Connect to remote servers via password or private key, with a full terminal emulator.
</p>

---

## Screenshots

### Mobile (Android)

<p align="center">
  <img width="320" alt="Login form (Android)" src="https://github.com/user-attachments/assets/54c27e7d-8add-40b0-9d8b-9ba332a7d7b9" />
</p>

### Desktop (Windows)

<p align="center">
  <img alt="SSH terminal (Desktop)" src="https://github.com/user-attachments/assets/3fdbd0c9-ed96-4101-9d9a-b0d5dcc2b965" />
</p>

## Download

> Links point to the **[latest release](https://github.com/ahaoboy/mho-tauri/releases/latest)** assets.

| Platform                 | Download                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 🪟 Windows (installer)   | [mho-tauri_windows_x64.exe](https://github.com/ahaoboy/mho-tauri/releases/latest/download/mho-tauri_windows_x64.exe) |
| 🪟 Windows (MSI)         | [mho-tauri_x64_en-US.msi](https://github.com/ahaoboy/mho-tauri/releases/latest/download/mho-tauri_x64_en-US.msi)     |
| 🍎 macOS (Intel)         | [mho-tauri_darwin_x64](https://github.com/ahaoboy/mho-tauri/releases/latest/download/mho-tauri_darwin_x64)           |
| 🍎 macOS (Apple Silicon) | [mho-tauri_darwin_aarch64](https://github.com/ahaoboy/mho-tauri/releases/latest/download/mho-tauri_darwin_aarch64)   |
| 🍎 macOS (Intel, DMG)    | [mho-tauri_x64.dmg](https://github.com/ahaoboy/mho-tauri/releases/latest/download/mho-tauri_x64.dmg)                 |
| 🍎 macOS (ARM, DMG)      | [mho-tauri_aarch64.dmg](https://github.com/ahaoboy/mho-tauri/releases/latest/download/mho-tauri_aarch64.dmg)         |
| 🐧 Linux (binary)        | [mho-tauri_linux_x64](https://github.com/ahaoboy/mho-tauri/releases/latest/download/mho-tauri_linux_x64)             |
| 🐧 Linux (deb)           | [mho-tauri_amd64.deb](https://github.com/ahaoboy/mho-tauri/releases/latest/download/mho-tauri_amd64.deb)             |
| 🐧 Linux (AppImage)      | [mho-tauri_amd64.AppImage](https://github.com/ahaoboy/mho-tauri/releases/latest/download/mho-tauri_amd64.AppImage)   |
| 🐧 Linux (rpm)           | [mho-tauri.x86_64.rpm](https://github.com/ahaoboy/mho-tauri/releases/latest/download/mho-tauri.x86_64.rpm)           |
| 🤖 Android (APK)         | [app-universal-release.apk](https://github.com/ahaoboy/mho-tauri/releases/latest/download/app-universal-release.apk)     |

## Features

- **Password & private key authentication** — auto-detect key type, normalize PEM format
- **Built-in terminal** — powered by [xterm.js](https://xtermjs.org/) with GitHub-dark theme
- **Config management** — save, load, and delete connection profiles (auto-saved on success)
- **Remote command (-t)** — execute a custom command instead of the default shell
- **Dark mode** — auto-detects system `prefers-color-scheme`
- **Mobile support** — responsive layout, Android safe-area handling
- **Cross-platform** — Windows, macOS, Linux, Android

## Tech Stack

| Layer         | Technology                                       |
| ------------- | ------------------------------------------------ |
| Desktop shell | [Tauri v2](https://tauri.app/)                   |
| Frontend      | React 19 + TypeScript                            |
| UI library    | [MUI](https://mui.com/) (Material UI)            |
| Terminal      | [xterm.js](https://xtermjs.org/)                 |
| SSH backend   | [russh](https://docs.rs/russh/) (async Rust SSH) |
| Logging       | `tracing`                                        |

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) ≥ 18
- [pnpm](https://pnpm.io/) (or npm)

### Install & Run

```bash
# Install frontend dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

### Android

```bash
pnpm tauri android init
pnpm tauri android dev
```

## License

MIT
