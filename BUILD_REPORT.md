# ROCKY AI — Build Report

- **Repo:** https://github.com/aruzle102/rocky-ai-assistant
- **Branch:** main
- **Code commit:** 6204507428f938392ddc0a03ea70ea04378b9a68 (source, Android project, icon, tests, README — pushed and verified on GitHub)
- **App ID:** com.modaliadz.rocky — **App name:** ROCKY AI
- **Status: APK NOT YET BUILT — one specific authorization is missing (see blocker below). No APK is claimed.**

## What was actually verified

| Check | Result |
|---|---|
| Repo exists, public, branch main | ✅ Verified via `gh repo view` |
| Source + Android project pushed to main | ✅ Commit 6204507, `gh api …/contents/` lists all top-level files |
| `npm test` (vitest) | ✅ 4/4 passed — brain state machine + task store |
| `npm run build` (tsc --noEmit + vite) | ✅ Passed, bundle 643 KB JS (176 KB gzip) |
| `npx cap sync android` | ✅ Synced, 3 Capacitor plugins |
| Custom icon generated (PIL, 1024 px) | ✅ `assets/icon-1024.png` (79,943 bytes) + mipmap PNGs per density |
| Manifest: portrait, RECORD_AUDIO, minSdk 26, targetSdk 34 | ✅ Edited and committed |
| Secret scan of source | ✅ No API keys bundled; key entry is on-device Preferences only |
| GitHub Actions cloud build | ❌ BLOCKED — workflow file cannot be pushed with current credentials |

## The exact blocker (only remaining step before the APK)

Pushing any file under `.github/workflows/` is refused by GitHub for both
available credentials:

1. `gh` CLI (OAuth App token, scopes `gist, read:org, repo`):
   `remote rejected: refusing to allow an OAuth App to create or update
   workflow '.github/workflows/android.yml' without 'workflow' scope`
2. GitHub MCP App (`create_or_update_file`):
   `403 Resource not accessible by integration` — the App installation
   does not have Workflows permission on this repository.

The workflow file itself is complete and ready at
`.github/workflows/android.yml` in the local checkout (and described in
`README.md`). It does: checkout → Node 20 → Java 17 → Android SDK →
`npm ci` → typecheck → vitest → web build → `cap sync` → Gradle
`assembleDebug` → APK exists/non-empty check → `aapt dump badging` →
secret-pattern scan → upload artifact `ROCKY_AI-debug-apk` → job summary.
Permissions: `contents: read` only. No secrets in the workflow.

## The one action needed from the user (pick ONE)

- **Option A (fastest, no CLI):** on github.com, open the repo → Add file →
  Upload files → upload `.github/workflows/android.yml` (the agent can supply
  the file) → Commit to main. The workflow then runs automatically and
  produces the APK artifact.
- **Option B (CLI):** run `gh auth refresh --hostname github.com -s workflow`
  and complete the device-code authorisation, then tell the agent — it will
  immediately push the workflow, watch the run, fix any failure, download
  the artifact and verify it.

After either option, the agent's remaining steps are: push workflow →
`gh run watch` → on green, `gh run download` → verify zip integrity, byte
size, and the CI `aapt` package line → copy APK to
`~/workspace/your_files/ROCKY_AI.apk` and `~/workspace/rocky-ai/ROCKY_AI.apk`
→ update this report with the run URL and exact byte size.

## Tested vs implemented-only (honest)

- **Tested here:** unit tests, typecheck, web production build, Capacitor sync,
  icon generation, repo push, secret-pattern reasoning over source.
- **NOT tested (no emulator, no physical phone in this environment):**
  APK build itself (blocked above), app launch, hologram rendering on device,
  microphone permission flow, speech recognition in ar-DZ / fr-FR / en-US,
  TTS voice quality, install + icon on a real phone.
- **Do NOT claim** Algerian Arabic recognition works, or that any APK exists,
  until the workflow run is green and the artifact is downloaded and inspected.

## Features still needing a model, service, or permission

- Cloud model: user-supplied OpenAI-compatible base URL + model + key in
  Settings (on-device only). Without it the app runs its offline local brain.
- Microphone permission on the device (runtime prompt + recovery message).
- Device speech services for recognition/TTS quality (vendor-dependent).
- The workflow-scope authorisation above (for the cloud build only).
