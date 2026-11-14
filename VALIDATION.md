# Collection validation — 14 November 2026

This collection preserves the final shareable packages from the five completed demo projects. Application source was not rewritten for consolidation.

## Provenance and completeness

- Five original ZIPs passed ZIP CRC integrity checks and have SHA-256 hashes in `SOURCE_MANIFEST.json`.
- All **205 original packaged files** are preserved in the unchanged ZIPs. In the extracted source, 204 files match byte-for-byte; only Jev Inbox’s `.gitattributes` changes its Windows launcher rule from text conversion to `-text`, preserving the launcher’s exact CRLF bytes in Git and GitHub ZIP downloads. No application code changed. Both metadata hashes are recorded in the manifest. Executable launcher permissions are preserved.
- Shield, Emote, and Sift match the final source folders. The pizza package contains the final application code plus the already-prepared portable launchers, local key configuration, and sharing documentation. Jev Inbox matches its public package; its Windows launcher in the ZIP uses distribution line endings.
- Five natural-language one-shot build prompts summarize the final requirements. Conversation transcripts and attachments are excluded.
- Built Shield and pizza assets are included. Existing lockfiles, tests, prompts, and asset licenses are retained.

## Checks rerun on isolated copies

Environment: macOS, Node.js 22.23.1. The three projects with lockfiles installed successfully using `npm ci`. No live email account, real key, or existing browser profile was used for these checks.

| Demo | Result |
|---|---|
| Jev Shield 0.2.2 | TypeScript check and build passed; **7 unit tests + 15 browser checks + 11 hardening checks + 7 privacy regressions passed**. |
| Domino’s demo | Build and **53 regression tests passed**, including browser fixture checks and 1,260 quantity arithmetic combinations. |
| Emote | TypeScript/build, **9 backend tests and 11 browser UI tests passed**. |
| Jev Inbox | Syntax check, **27 tests**, and original sharing scan passed. |
| Sift 2.1.0 | **30 unit/integration tests and 17 browser checks passed**. |

Total: **187 passing automated tests/checks** across these suites. Counts exclude the separate interactive permission test below.

The browser suites used the installed Chromium test build through their supported executable overrides. Emote's verification-only harness used port 5193 to avoid the original running demo; the published source and test configuration remain unchanged. Initial browser launches that requested an unavailable Playwright build were retried with the installed test executable.

### Interactive permission test limitation

Shield's separate `test:permissions` suite reproduced the old permission error and passed native permission acceptance, the scoped grant, and initial scanning. It then ended during the page-reload phase with `Target page, context or browser has been closed`. The remaining reload/pause portion is **not certified as passing** by this run. The noninteractive permission-related, privacy, and hardening tests above passed. The exact original application and tests are preserved.

## Public package checks

- No real API keys or recognizable OAuth/GitHub tokens were found in the final source, build prompts, or embedded ZIP contents.
- Token-shaped values in tests were reviewed as synthetic fixtures and allowed only by exact value hash and file path in the scanner.
- No saved mail, OAuth client files, encryption keys, browser profiles, order history, dependency directories, or local runtime databases are included.
- The original pizza `OpenRouter Key.env` is a **blank tracked template** to preserve its launcher behavior. After entering a real key, **do not commit that file's change**. Prefer the downloadable ZIP for personal use. Snapshot verification rejects a nonblank template.
- No conversation transcripts, private email addresses, private Drive links, or original chat screenshot attachments are published.

Run `python3 scripts/verify_snapshot.py` from the repository root to repeat package checksum, file inventory, launcher permission, build-prompt inventory, and credential-pattern checks.

Live Jev quality, current Domino’s website behavior, and new Gmail/YouTube OAuth configuration are not certified by mocked provider tests. No paid model calls, real emails, or food orders were made during consolidation.
