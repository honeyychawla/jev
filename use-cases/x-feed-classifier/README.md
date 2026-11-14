# Sift 2.1 — powered by Jev

A small Chrome extension that helps an AI tinkerer choose what to explore on X. It works on the existing feed and has no dashboard.

**Use an OpenRouter API key (sk-or-…), not a direct TypeSafe key.** No separate TypeSafe account is needed. [Official OpenRouter Jev guide](https://openrouter.ai/docs/guides/community/jev)

**Jev must be connected for AI recommendations.** Without a key, the extension shows a connection-needed marker. Basic keyword estimates are an optional setting, disabled by default.

## Install or update

1. Unzip `sift-extension-v2.1-openrouter.zip`.
2. If updating, copy the new files into the original `jev` folder you loaded in Chrome, replacing its files. Open `chrome://extensions` and click **Reload** on Sift.
3. If installing for the first time, open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select the extracted `jev` folder.
4. Refresh X. Open Sift from Chrome’s extension toolbar.
5. Click **Connect Jev**. Get a key from the [OpenRouter keys page](https://openrouter.ai/settings/keys), paste it into Sift, and click **Test & connect**. Allow the requested OpenRouter permission.
6. Leave the prefilled AI-tinkerer profile and adjacent topics enabled to start.

Existing profiles and corrections are preserved. Reconnect with your OpenRouter key after upgrading; any old TypeSafe credential is removed rather than reused.

Chrome 128 or later is required. This is an unpacked extension, not a Chrome Web Store listing.

## On your feed

- **👍 Explore:** a useful thing to learn, understand or try.
- **👎 Skip:** clearly outside your interests or mostly empty bait.
- **🤔 Unclear:** missing context or an uncertain decision; kept readable.
- **🔌:** connect or retry Jev; the post has not been classified.

The number below a recommendation is Jev’s confidence in its decision. It is not a truth score, quality rating or guarantee that you will like the post. A dash means no applicable model confidence. Tap a marker for its reason, evidence and **Useful to me / Not for me** corrections. Corrections are reversible and help personalize later requests.

The default is emojis and confidence only. Settings can also highlight reads, dim skips or cross out likely bait. Off removes all added markers and styles.

## How Jev is used

Sift sends one request containing the reader profile, visible post evidence and up to four relevant correction examples. It asks for the next action, relevance, discovery value, empty bait, missing context and the main reason. A conservative policy requires stronger evidence to skip a post than to recommend exploring it.

The integration uses `POST https://openrouter.ai/api/v1/systemone` and pins `typesafe/jev-1.14`. It recognizes that beginner explanations, short releases, useful demos and honest promotional posts can be valuable. It is not limited to technical papers or AI keywords.

See [RESEARCH.md](RESEARCH.md) for the diagnosis, primary-source research, design decisions, cost example, model limits and evaluation plan.

## Images, video and privacy

By default, Sift uses visible text, quotes, link previews and image alt text. **Analyze image previews with Jev** is optional and experimental. Enabling it requests access to X’s media CDN, then sends at most two resized post photos or video posters per check. It does not watch full videos, hear audio or open linked pages. Missing evidence leads to uncertainty rather than automatic rejection.

Your API key stays in trusted extension storage, inaccessible to the content script. Session-only is the default. **Remember on this device** stores it locally without encryption or sync; Disconnect removes both copies. Visible post evidence, your profile and relevant corrections are sent through OpenRouter to TypeSafe’s Jev model; authors, handles, engagement counts, cookies, browser passwords and whole-page HTML are not. Media bytes are sent only when image analysis is enabled.

Your latest 20 correction examples are stored locally. Reset learned preferences clears them and your per-post overrides. Private messages, chat, Grok, compose, settings, login, account and notification routes are excluded.

API charges apply to your OpenRouter account. A session starts with a limit of 200 feed calls. Testing a key makes one additional request. Caching avoids repeating identical checks; profile changes and corrections invalidate the appropriate cache entries. No more than two requests run concurrently. Pausing cancels outstanding requests; a request already received by OpenRouter may still be billed.

## Verification and development

No build step or runtime dependencies.

- `npm test`: unit and background integration tests.
- `npm install`, `npx playwright install chromium`, `npm run test:browser`: isolated browser suite with the actual Chrome action popup and mocked OpenRouter responses. Test-only permissions are pregranted in a temporary extension copy; the distributed manifest keeps them optional.
- `npm run evaluate:live`: optional paid evaluation of 32 illustrative cases. Set `OPENROUTER_API_KEY` in your own local shell first. The script never prints the key and writes its report to `.qa/live-evaluation.json`.

The live evaluation has not been run: no real key was supplied. Automated and browser tests verify the software, not live model accuracy. Actual X markup can change. See [VERIFICATION.md](VERIFICATION.md).

This is an independent extension, not an official TypeSafe or X product. Bundled Manrope is licensed under the SIL Open Font License. Existing icon assets are licensed under MIT; license files are in `assets/`.
