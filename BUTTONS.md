# OTP Authenticator — buttons

## Toolbar

- **Add** — Manually add one account with an `otpauth://` URI or a base32 secret.
- **Scrape** — Opens the system folder picker. Finds `.log` files under any path that contains `Auth`, `2FA`, or `Authenticator`, imports them, and creates a profile from each dump’s main folder name.
- **Import** — Pick one or more export files yourself and load them into the current profile.

## Filters

- **Search** — Filter the list by issuer or account name.
- **Clear** — Clears the search box.
- **Category** — Show one category (Email, Crypto, etc.) or all.
- **All / With Passwords / Without Passwords** — Show only accounts that have related passwords, only those that do not, or all.
- **Type** — Filter by TOTP, HOTP, Authy, or other types.
- **Profile** — Show accounts from one imported dump, or **All Profiles**.
- **Delete selected profile** — Removes the profile currently chosen in the dropdown and all of its accounts.
- **Delete all profiles** — Removes every profile and every imported account.
- **Light / Dark switch** — Top-right toggle for light mode and dark mode.
- **Profiles** — Create, rename, or delete one profile. **Delete** also removes that profile’s accounts.
- **Prefs** — Import and display preferences.
- **Dark / Light** — Switch the window between dark mode and light mode.

## Account row

- **Copy code** — Copy the current OTP.
- **Copy login** — Copy the account / username / email.
- **Open site** — Open the guessed login page in your browser.
- **Passwords** — Show related passwords found next to the import (if any).
- **Logins** — Show logins from nearby `*Pass*.txt` files (if any).
- **Open dir** — Open the dump folder in Finder / Explorer / the file manager.
- **Delete** — Remove that account from the app.
- **Open asset / View raw** — For Authy asset rows: open the URL or inspect the raw JSON.

Right-click a row for the same actions, plus copy issuer, copy URI, and copy source path.

Click a code to copy it. Double-click the name to copy the login.

## File menu

- **Import…** — Same as **Import**.
- **Scrape Directory…** — Same as **Scrape**.
- **Add Account…** — Same as **Add**.
