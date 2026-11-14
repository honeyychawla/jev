# Jev Shield

A Chrome / Edge Manifest V3 extension, written in TypeScript, that asks **Jev 1.14 through OpenRouter** whether likely ad blocks are paid advertisements. High-confidence blocks are hidden reversibly.

This is an independent prototype, not an official TypeSafe or OpenRouter product.

Current build: **0.2.2**. This revision fixes public news pages being skipped because they preload invisible Stripe frames or closed sign-in forms. Sensitive controls must be rendered to pause scanning; checkout and other private URL paths remain excluded. Visibility changes are watched so opening a payment or login form pauses scanning and closing it resumes.

Version 0.2.1 fixes Chrome's “Only permissions specified in the manifest may be requested” activation error. Optional host permissions now use the same wildcard scheme as the runtime site request. The allowed protocols remain HTTP and HTTPS, and access is still granted separately for each site.

Version 0.2.0 fixed page-update starvation, stale decisions on reused elements, unnecessary reclassification on settings changes, hidden-text extraction, and candidate discovery on large pages.

## Install the ready-built extension

1. Open `chrome://extensions` in Chrome (or `edge://extensions` in Edge).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this project's **dist** folder. Select the folder containing `manifest.json`, not the ZIP or source directory.
4. Pin **Jev Shield** from the browser's Extensions menu.

## Exactly where to paste your OpenRouter key

1. Open **Jev Shield → Settings** (or right-click its icon → **Options**).
2. Paste your key in **OpenRouter API key**. You can create a key at [OpenRouter → API keys](https://openrouter.ai/settings/keys).
3. Read and tick **Allow Jev to check likely ads**.
4. Click **Save settings**, then **Test connection**.
5. Visit a public website, open Jev Shield, and click **Enable on this site**. Accept Chrome's site-access prompt.

Paste the key only into the extension's settings, not into the source, terminal, or this chat. No TypeSafe API key is needed. The connection test verifies your key with OpenRouter without making a paid model request; actual model access is exercised when you enable a site and candidates are found.

## Verify the real model with your saved key

In **Settings**, click **Run live Jev check**. This makes **one billable OpenRouter request** containing four fixed examples: two ads and two ordinary content blocks. No website content is used. The result shows the returned ad probabilities, whether each matched the expected decision at a 90% cutoff, the model, response time, and test timestamp. The request counts toward the daily cap. It works without enabling a website.

Four matching examples prove that the API request worked for those examples; they do not prove universal ad-blocking accuracy. Errors and mismatches are displayed rather than treated as a successful test. A summary is stored locally and removed when the key is replaced or deleted.

To update an existing installation, replace the files in the **same extension folder** with this build, open `chrome://extensions` (or `edge://extensions` in Edge), and click **Reload** on Jev Shield. Reload open website tabs and the Settings page. Keeping the same folder preserves the extension identity and saved key. If you loaded this project's `dist` folder directly, its files have already been updated; only the reload is needed.

## What it does

- Per-site opt-in with optional Chrome host permissions; newly enabled sites begin scanning immediately and on subsequent visits.
- Finds candidate containers from explicit ad attributes, labels, ad-like class/id tokens and common advertising iframe/link hostnames.
- Sends a bounded description to Jev, in batches of up to 12 candidates.
- Hides only candidates at or above the configured probability threshold (90% initially).
- Watches for dynamically inserted ad blocks, up to 72 evaluated candidates per page.
- Continually changing pages cannot postpone scans indefinitely. Reused elements are judged again when their contents change; old ad decisions are removed before evaluating replacement content.
- Threshold changes reuse the page's existing decisions. Enabling another hostname leaves the current page's decisions alone.
- **Restore** keeps a block visible until reload. **Restore all** restores all hidden blocks. **Pause on this site** restores content and stops further requests.
- Stops automatic retries on an API error; **Scan again** retries failed candidates and resumes discovery within the page limit.
- Caps API request attempts at 100 per UTC day by default. Adjustable from 1–1,000. Failed attempts count toward this cap. The cap is a request cap, not a dollar budget.
- Caches up to 500 decisions in the service worker's memory. Cache is cleared when the key changes or the worker restarts; it is not a permanent browsing history.
- Provides light/dark themes and responsive settings.

## OpenRouter integration

| Setting | Value |
| --- | --- |
| Inference endpoint | `POST https://openrouter.ai/api/alpha/decisions` |
| Model | `typesafe/jev-1.14` |
| Question type | `noul` (yes/no probability) |
| Authentication | `Authorization: Bearer <your OpenRouter key>` |
| Connection check | `GET https://openrouter.ai/api/v1/key` |

Jev does not use the chat-completions endpoint. The request contains `model`, `state` and named `questions`; each answer must contain `type: "noul"` and a finite `noul` probability from 0 to 1. Missing or malformed answers leave the candidate batch visible. The model is pinned so a new model release does not silently change its judgments.

Official references, checked November 14, 2026: [Jev on OpenRouter](https://openrouter.ai/docs/guides/community/jev), [Jev tutorial and request format](https://openrouter.ai/docs/guides/community/jev-tutorial), [Jev 1.14](https://openrouter.ai/typesafe/jev-1.14), [key verification endpoint](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key).

## Data and limitations

See [PRIVACY.md](PRIVACY.md) for the exact data and permissions. Jev runs in the cloud through OpenRouter; it is not bundled locally.

This version **hides visible display ads and sponsored blocks**. It does not block network requests, stop trackers, block YouTube/video ads, inspect closed shadow roots, or read inside cross-origin iframes. Ads can load before they are hidden. Candidate heuristics can miss ads and the model can misclassify content. Only enabled top-level HTTP/HTTPS pages are scanned. Sensitive-page detection is best effort; use public pages whose candidate snippets you are comfortable sending to OpenRouter and its Jev provider.

No real API key is included. The automated tests use synthetic provider responses, so they verify extension behavior and the request/response contract, not live Jev accuracy, latency, billing, or account access. Edge uses the same Manifest V3 build but was not separately tested. A native site-permission prompt must be accepted by the user; headless tests pregrant the local fixture host in a temporary test-only copy.

## Develop

Requires Node.js 22+ and npm.

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run test:hardening
npm run test:privacy
npm run test:permissions
```

After code changes, rebuild, reload the extension in `chrome://extensions`, and refresh your test page. Browser tests use a fresh temporary browser profile and a local fixture page, never your personal browser profile. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can optionally point to an existing compatible test Chromium binary.

The permission regression runs the original failing manifest and the corrected production manifest without pregranting host access or mocking the permissions API. Its corrected scenario opens a visible test browser; accept the test site's prompt if Chromium displays one. The test intercepts the Bloomberg URL with a local HTML fixture and uses synthetic Jev replies, so it does not access Bloomberg content or a live API account.

Files: `src/background.ts` owns the key, API, permissions, registration and usage cap; `src/candidates.ts` extracts bounded candidates; `src/content.ts` scans and restores the DOM; `src/core.ts` defines the OpenRouter contract; `src/popup.ts` and `src/options.ts` implement the UI. `public/` contains the extension manifest, HTML and CSS.
