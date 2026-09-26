# Repository Guidelines

## Project Structure & Module Organization
- `functions/`: Firebase Cloud Functions (Node 18). Entry: `functions/index.js`; supporting modules in subfolders (`http/`, `callable/`, `services/`, etc.).
- `public/`: Firebase Hosting static assets (HTML, JS, CSS).
- Config: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`, and `cors-config.json`.
- Backups/variants: files with `.backup`/`.incomplete` are not authoritative; prefer primary config files above.

## Build, Test, and Development Commands
- Install: `npm install --prefix functions` (installs Cloud Functions deps).
- Emulators: `firebase emulators:start --only hosting,functions,firestore` (run locally).
- Functions only: `npm run serve --prefix functions`.
- Tests: `npm test --prefix functions` (runs Jest).
- Lint: `npm run lint --prefix functions` (ESLint with Google config).
- Deploy functions: `npm run deploy --prefix functions` or `firebase deploy --only functions`.
- Deploy hosting: `firebase deploy --only hosting`.

## Coding Style & Naming Conventions
- JavaScript (Node 18 runtime in `functions/`). Use 2‑space indentation and semicolons.
- ESLint: Google style (`functions/.eslintrc.js`). Fix issues before committing.
- Filenames in `functions/` use lowerCamelCase (e.g., `scheduledArticles.js`, `utils.js`).
- Function exports and modules: lowerCamelCase; constants: UPPER_SNAKE_CASE.

## Testing Guidelines
- Framework: Jest. Place tests under `functions/test/` with `*.test.js` names.
- Scope: unit tests for utilities/services; light integration for HTTP handlers.
- Run: `npm test --prefix functions`. Aim to cover critical paths (error cases, validation, and side effects).

## Commit & Pull Request Guidelines
- Commit style follows Conventional Commits: `feat:`, `fix:`, `chore:`, `revert:`. Keep messages imperative and focused.
- Branch naming mirrors PRs (e.g., `codex/feature-or-fix`).
- PRs: include a clear summary, linked issues, and screenshots or curl examples for API changes. Note any config or schema updates.

## Security & Configuration Tips
- Do not commit secrets. Use Firebase config where applicable: `firebase functions:config:set key=value`.
- Respect CORS settings (`cors-config.json`) and validate input on all HTTP endpoints.
- Ensure Firestore and Storage rules changes are reviewed; test with emulators before deploy.
