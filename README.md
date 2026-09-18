# OTP Authenticator

Desktop TOTP / HOTP authenticator for **macOS**, **Windows**, and **Linux**. Import export files or scrape a folder of Authenticator logs, then copy live codes from a profile-based list.

![OTP Authenticator icon](build/icon.png)

## Features

- Live **TOTP** and **HOTP** codes with a countdown bar
- **Scrape** a folder tree for Authenticator / Auth / 2FA `.log` files
- **Import** one or more export files, or drop them onto the window
- **Add** an account from an `otpauth://` URI or a base32 secret
- Automatic **profiles** — each dump folder becomes a selectable profile
- Search, category, type, and password filters
- Copy code, login, issuer, URI, or source path
- Open the guessed login site or the source folder
- Light / dark theme
- Accounts persist across restarts

## Requirements

- [Node.js LTS](https://nodejs.org/) 18 or newer (includes `npm`)
- macOS, Windows 10/11, or a recent Linux desktop

You do **not** need Python to run this app.

## Install and run

```bash
git clone https://github.com/responsepy/otp-authenticator-electron.git
cd otp-authenticator-electron
npm install
npm start
```

### Windows

1. Install [Node.js LTS](https://nodejs.org/).
2. Open Command Prompt or PowerShell:

```bat
git clone https://github.com/responsepy/otp-authenticator-electron.git
cd otp-authenticator-electron
npm install
npm start
```

Do not copy `node_modules` from another OS. Always run `npm install` on the machine that will run the app.

## Build installers

Build on the same OS you want to ship:

```bash
npm run dist:mac     # .dmg + .zip
npm run dist:win     # NSIS installer + portable .exe
npm run dist:linux   # AppImage + .deb
```

Output goes to `dist/`.

| Script | Result |
|---|---|
| `npm start` | Run from source |
| `npm test` | Parser, TOTP, and import tests |
| `npm run dist` | Installer for the current OS |
| `npm run pack` | Unpackaged app directory only |

A Windows installer should be built **on Windows**. Cross-building from macOS needs extra tooling.

## Usage

### Scrape (main workflow)

1. Click **Scrape** (or **File → Scrape Directory…**).
2. Pick the Stealer Log folder that contains one or more dumps.
3. The app walks every subfolder and imports `.log` files under a path that contains `Auth`, `2FA`, or `Authenticator`.
4. Chrome Authenticator files named `000003.log` are included even if they look binary.
5. Each dump’s **main folder name** becomes a profile (the folder that contains `Plugins`, or the parent of the Authenticator folder).
6. A progress bar shows search, then each file as it is imported. The scan runs on a background thread so the window stays movable.

Typical path that is picked up:

```
SomeDumpName/
  Plugins/Authenticator/Google Chrome/Default/Sync Extension Settings/000003.log
```

Also matched:

```
.../2FA/...
.../Auth/...
.../Authenticator_Chrome_Default/000003.log
```

A random `000003.log` outside an Auth / 2FA / Authenticator path is ignored.

### Import

**Import** opens a file picker for one or more `.log`, `.json`, or `.txt` exports. You can also drop files onto the window.

Supported contents:

- Compact OTP export objects (`dataType: OTPStorage`, or objects with `secret` + `account`)
- Bitwarden-style cipher maps with a `totp` field
- `otpauth://` URIs inside a secret field
- Authy asset JSON (shown as assets, not live codes)

Invalid OTP secrets are skipped when **Validate OTP secrets on import** is on (default).

### Add

**Add** creates one account. Paste a full URI:

```
otpauth://totp/GitHub:you@mail.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub
```

or fill issuer, account, and base32 secret by hand.

### Profiles

After a scrape, use the **Profile** dropdown to show one dump or **All Profiles**.

| Button | Effect |
|---|---|
| **Delete selected profile** | Removes that profile and every account in it |
| **Delete all profiles** | Clears every profile and every imported account |
| **Profiles** | Create, rename, or delete profiles |

Deleting a profile also deletes its accounts. They do not stay under All Profiles.

### Filters

- **Search** — issuer or account name
- **Clear** — empty the search box
- **Category** — Email, Crypto, Messaging, and others assigned on import
- **Passwords** — all / with passwords / without passwords
- **Type** — TOTP, HOTP, Authy, other

### Account row

| Action | What it does |
|---|---|
| Click the code | Copy the current OTP |
| **Copy login** / double-click the name | Copy username or email |
| **Open site** | Open a guessed login URL |
| **Open dir** | Open the source folder in Finder / Explorer / the file manager |
| **Passwords** / **Logins** | Show related credentials if they were attached |
| **Delete** | Remove that one account |
| Right-click | Copy issuer, URI, or source path |

Codes refresh every second. The bar turns amber under 10s and red under 5s.

### Theme

The **Light / Dark** switch is in the top-right. The choice is saved.

## Preferences

**Prefs** controls:

- Show passwords in cleartext
- Scan binary files when scraping (usually not needed; `000003.log` is already imported)
- Drag-and-drop overlay
- Auto-add import path to the profile
- Validate OTP secrets on import
- Max import workers
- Enabled account types

## Data location

Accounts, profiles, and preferences are stored in `state.json` under the Electron user-data folder:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/otp-authenticator/state.json` |
| Windows | `%APPDATA%\otp-authenticator\state.json` |
| Linux | `~/.config/otp-authenticator/state.json` |

Copy that file to move your vault to another machine. Secrets live in this file on disk — treat it like a password database.

## Project structure

```
otp-authenticator-electron/
  src/                 Main process
    main.js            Window, menus, IPC
    preload.js         Safe renderer bridge
    importer.js        Scrape + import
    parser.js          Export / log parser
    totp.js            TOTP / HOTP
    store.js           Persistence
    categorizer.js     Category labels
    ...
  renderer/            UI
    index.html
    app.js
    styles.css
    icon.png
  build/               App icons for installers
    icon.icns          macOS
    icon.ico           Windows
    icon.png           Linux / window
  scripts/make-icon.py Regenerate icons
  test/                Unit tests
```

## Tests

```bash
npm test
```

Covers the JSON parser, RFC TOTP / HOTP vectors, scrape path matching, and profile delete.

## App icon

Dock, taskbar, and installers use `build/icon.*`. To regenerate (needs Python + Pillow):

```bash
python3 scripts/make-icon.py
```

## Documentation

- [Button reference](BUTTONS.md) — every control in the window

## License

MIT
