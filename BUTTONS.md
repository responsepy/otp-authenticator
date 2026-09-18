# Button reference

## Top bar

| Control | What it does |
|---|---|
| **Add** | Manually add one account from an `otpauth://` URI or a base32 secret |
| **Scrape** | Pick a folder. Walks all subfolders for `.log` files under `Auth`, `2FA`, or `Authenticator` paths, imports them, and creates a profile from each dump’s main folder name |
| **Import** | Pick one or more export files and load them |
| **Light / Dark** | Switch theme. Saved in preferences |

Keyboard: **Ctrl/Cmd+N** add, **Ctrl/Cmd+O** import, **Ctrl/Cmd+Shift+O** scrape, **Ctrl/Cmd+,** preferences.

## Filters

| Control | What it does |
|---|---|
| **Search** | Filter by issuer or account |
| **Clear** | Clear the search box |
| **Category** | Show one category or all |
| **All / With Passwords / Without Passwords** | Filter by related-password presence |
| **Type** | TOTP, HOTP, Authy, Authy asset, or other |
| **Profile** | Show one dump or **All Profiles** |
| **Delete selected profile** | Delete the chosen profile and all of its accounts. Disabled on All Profiles |
| **Delete all profiles** | Delete every profile and every imported account |
| **Profiles** | Create, rename, or delete profiles |
| **Prefs** | Import and display options |

## Account row

| Control | What it does |
|---|---|
| Click the code | Copy the current OTP |
| **Copy login** | Copy username / email |
| **Open site** | Open the guessed login page |
| **Passwords (N)** | Show related passwords found near the import |
| **Logins (N)** | Show logins from nearby `*Pass*.txt` files |
| **Open dir** | Open the dump folder in the system file manager |
| **Delete** | Remove that account |
| **Open asset / View raw** | Authy assets: open the URL or inspect raw JSON |

Right-click a row for the same actions, plus copy issuer, copy URI, and copy source path.

Double-click the name to copy the login.

## File menu

| Item | Same as |
|---|---|
| **Import…** | **Import** |
| **Scrape Directory…** | **Scrape** |
| **Add Account…** | **Add** |

**Profiles → Delete All Profiles** is the same as **Delete all profiles**.
