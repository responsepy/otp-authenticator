# OTP Authenticator (Electron)

Cross-platform desktop port of the Python OTP Authenticator. Runs on macOS, Windows, and Linux.

## Features

- Import authenticator export files (`.log`, JSON, otpauth, Bitwarden-style ciphers)
- **Scrape** — pick a dump directory; finds `.log` files under `Auth` / `2FA` / `Authenticator` paths and creates a profile per main folder
- Button reference: [BUTTONS.md](BUTTONS.md)
- Live TOTP and HOTP codes
- Search, category, profile, type, and password filters
- Related password / login discovery from nearby files
- Drag-and-drop import
- Profiles and preferences
- Native menus, notifications, and file-manager / browser open

Accounts persist in the app user-data folder (`state.json`), so they survive restarts.

## Run from source

```bash
cd electron
npm install
npm start
```

## Tests

```bash
cd electron
npm test
```

## Build installers

Build for the current OS:

```bash
cd electron
npm run dist
```

Platform-specific:

```bash
npm run dist:mac     # .dmg + .zip
npm run dist:win     # NSIS installer + portable .exe
npm run dist:linux   # AppImage + .deb
```

`npm run dist:all` tries to build every platform. A full Windows installer from macOS needs extra tooling; build Windows artifacts on Windows when possible.

Installers land in `electron/dist/`.

## App icon

`build/icon.png` (Linux / in-window), `build/icon.icns` (macOS), and `build/icon.ico` (Windows) are used for the dock, taskbar, and installers. Regenerate them with:

```bash
python3 scripts/make-icon.py
```
