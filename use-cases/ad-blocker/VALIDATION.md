# Validation — version 0.2.2

Validated November 14, 2026.

## Hidden-payment regression fixed in 0.2.2

Read-only inspection of the affected Bloomberg India tab found four `js.stripe.com` iframes, each one pixel high with `visibility:hidden`, and no other matching sensitive-page controls. Their presence alone triggered the old whole-page skip. A controlled browser regression reproduced this failure with version 0.2.1 before applying the fix.

Version 0.2.2 checks visibility before treating sensitive fields or recognized payment frames as a reason to pause. Private URL routes stay excluded. Style and hidden-attribute changes now trigger reevaluation without invalidating the extension's own hide decisions.

**40 checks passed on this build:** seven core tests, 15 Chromium integration checks, 11 hardening checks, and seven new privacy regression checks. TypeScript strict type checking and the production build passed. The privacy suite verifies scanning with four hidden Stripe frames and a closed account form, pausing and restoration when the form opens, resuming when it closes, pausing on a visible payment iframe, resuming without hide/restore loops, keeping checkout routes excluded, and withholding all test form values from payloads. All model replies were synthetic. The installed personal-browser extension has not been reloaded or used for a live API request by this repair.

## Permission regression fixed in 0.2.1

The user's screenshot exposed an activation defect missed by earlier tests that pregranted fixture access. A new test reproduced the exact error with `optional_host_permissions: ["http://*/*", "https://*/*"]` and a runtime `*://www.bloomberg.com/*` request. Changing the declaration to `["*://*/*"]` resolved it. This retains the same HTTP/HTTPS scope.

Four focused checks passed: exact failure reproduction with the old manifest; successful real permission request and site-scoped grant with the corrected manifest; scanning after reload without another grant; and restoration on pause. The corrected run used an unmodified copy of the distributable manifest, a fresh visible Chromium profile, the real permissions API, and no host pregrants. The Bloomberg URL was served a controlled fixture through a test route, and Jev replies were synthetic. These results verify the permission mechanism, not live Bloomberg ad detection. No claim is made that the native prompt was manually inspected. Type checking and the seven core tests were rerun and passed.

**The previous 0.2.0 validation passed 33 automated checks:** seven core tests, 15 Chromium integration checks, and 11 targeted regression checks. TypeScript strict type checking and the production extension build also passed.

The second review reproduced six previously untested defects in version 0.1.0. Version 0.2.0 fixes them: continuous mutations delaying scans, stale decisions on reused DOM nodes, hidden replacement content, unnecessary API calls when thresholds change, unrelated-site activation triggering rescans, and CSS-hidden text appearing in snippets. It additionally prioritizes explicit ad slots on large pages, keeps popup counters current, serializes content-script registration, and adds a real-model diagnostic.

## What was exercised

- Opt-in behavior, saved settings, key verification, and the live-diagnostic UI/request contract.
- Real Manifest V3 content scripts, service worker messaging, dynamic injection and persisted registration.
- Ad hiding, ordinary-content preservation, dynamic ads, original CSS restoration, and popup restore/pause controls.
- No key access from a content-script context; no privileged settings messages from page scripts.
- No form values, full link URLs, API keys, or CSS-hidden test strings in classification payloads.
- API failures, malformed decisions, explicit retries, in-flight cancellation, private-route changes, and consent revocation across tabs.
- Threshold changes using retained decisions without another API request.
- Explicit ad slots after 1,600 unrelated matching elements.
- Daily request limits across concurrent tabs and after a full browser restart.
- Responsive settings, dark mode, and key removal.

## What these tests do not prove

The tests ran in new temporary profiles on Chromium 156.0.8078.4. OpenRouter inference and key-verification responses were synthetic. No real key, paid API call, personal profile or personal website was used. Therefore the tests validate extension behavior and the documented provider contract, **not live Jev accuracy, latency, billing or your account access**.

The original integration and hardening suites pregrant fixture hostnames in temporary test copies. The new permission regression deliberately does not. The distributable requests site access when its user enables a site. The popup's active-tab lookup is adapted because it is opened as a regular test tab; its UI, messages and worker otherwise use production code. Microsoft Edge was not directly tested. The connected computer exposes Chrome and does not expose the user's Edge installation.

## Remaining live check

After updating/reloading the extension in Chrome or Edge, use **Settings → Run live Jev check**. That makes one billable request with four fixed examples and the saved OpenRouter key. The report shows probabilities, matches, model, elapsed time and timestamp. No browsing content is sent. This final account/model check remains unverified until the user runs it; even a 4/4 result does not guarantee correct classification on every website.

This remains a visible-ad hiding prototype. It does not provide network-level ad/tracker blocking or video-ad blocking. No 10/10 or universal-accuracy claim is made.
