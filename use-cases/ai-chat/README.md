# Emote

A minimalist local emoji search powered by **TypeSafe Jev through OpenRouter**. Type into the centered search bar, pause for 450 ms, and click a matching emoji to insert it at the cursor. A decorative selection from the full catalog settles into a pile along the bottom. Jev supplies emoji decisions; this app does not add a separate model for conversational text replies.

![Matching emoji rise from the pile and fall back when text is cleared](docs/demo.gif)

Want to recreate it with a coding assistant? Copy the [one-shot natural-language prompt](PROMPT.md). Clone this repository to get this exact implementation.

## Run it

Requires [Node.js](https://nodejs.org/) 22.15 or newer (Node.js 24 is used in CI). Works locally on macOS, Windows, and Linux with a modern browser. Each person supplies their own OpenRouter key; no API key is included in this repository.

Clone the repository, or use **Code → Download ZIP** on GitHub and extract it:

```sh
git clone https://github.com/honeyychawla/emote-emoji-search.git
cd emote-emoji-search
```

Then run:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Keep the terminal running.

On macOS, you can instead double-click **Start Emote.command** after installing Node.js. It installs dependencies on first launch and opens the app in your browser. If macOS does not open the launcher, use the terminal commands above.

Without a key, the app provides a clearly labeled local keyword preview. Add a key to enable Jev's semantic suggestions and the same animated interface.

## Add your OpenRouter key

Open **Settings** (the gear at the top right), paste your key into **OpenRouter API key**, and choose **Save & test connection**. The backend validates the key with OpenRouter, makes a small Jev request, and saves it only after the test succeeds. A failed test leaves your existing key untouched. The key field clears after saving. You can also use **Test saved key** without pasting it again.

For manual setup, copy `.env.example` to `.env` in the project folder. On macOS or Linux:

```sh
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env`. Open `.env`, paste your key on this line, then save:

```dotenv
OPENROUTER_API_KEY=your-key-here
TYPESAFE_MODEL=jev-1.13
PORT=5173
```

The backend rereads `.env` on each request. The interface detects the key within a few seconds; no restart is needed for key or model changes. Restart after changing `PORT`. A detected key means a value is present; Settings shows “Connected” only after a successful Jev request in the current server session. You need OpenRouter credits and access to the selected Jev model.

The key is used only on the backend and `.env` is excluded from Git. Do not use a `VITE_` prefix for secrets. Create a key at [OpenRouter](https://openrouter.ai/settings/keys). Never include `.env` when sharing a ZIP or committing files.

## Included

- Live, debounced suggestions with cancellation, stale-response protection, a bounded five-minute cache, and explicit provider errors.
- 3,963 emoji from Emojibase 18, representing 1,923 base emoji plus skin-tone variants. Flags, professions, gender variants, and joined sequences are included. Your operating system determines which glyphs it can display; newer emoji may appear as boxes on older systems.
- Searchable full picker with categories and a skin-tone switch. Searching “skin” or a tone name also includes variants.
- A single search bar, live matches beneath it, insertion at the cursor, Copy text, Enter to search, Escape to clear, and a responsive mobile layout.
- Matching emoji rise from their positions in the bottom pile into the result row. Deleting or clearing text immediately drops them back with a small bounce. Changes in meaning return old matches while new matches rise; rapid edits reverse flights from their current position. Reduced-motion preferences are respected.
- Clearly labeled local keyword previews when no API key is configured. Provider failures are displayed as errors, never disguised as AI results.

## How Jev chooses emoji

The backend uses the official `@typesafe-ai/sdk` with `baseURL: https://openrouter.ai/api`. The SDK calls `/v1/systemone`, not `/chat/completions`.

Every emoji is reachable through a catalog-derived category. The first Choice request ranks all 104 category buckets. The second request ranks the actual emoji in the top six categories, with at most 240 options per Choice. Results combine category and emoji probabilities, collapse repeated skin-tone families, and show up to eight suggestions. This is hierarchical selection over the complete catalog; it does not exhaustively score every emoji on every keystroke. Relevance and latency depend on the input, model, and provider.

References: [OpenRouter’s TypeSafe integration](https://openrouter.ai/docs/guides/community/typesafe-sdk), [Jev Choice](https://docs.typesafe.ai/primitives/choice), [Emojibase datasets](https://emojibase.dev/docs/datasets/).

## Privacy and local behavior

The server listens only on `127.0.0.1`. With a key configured, each settled draft is sent to OpenRouter and TypeSafe for inference. Requests use only the current search text. Search text lives in this tab’s memory and disappears on refresh. The backend temporarily caches up to 100 results in memory. It does not write messages or keys to logs. There is no database, telemetry, login, or deployment.

This repository shares the local app. GitHub Pages cannot run its Node backend; it is not a hosted demo. A public deployment would need a separate server configuration and access controls.

## Get updates

For a Git clone, stop the server, run `git pull` and `npm ci`, then start it again with `npm run dev`. Your ignored `.env` remains on your machine.

## Verify

```sh
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

UI tests start the local server if necessary. They mock provider responses so tests do not spend API credits. Backend tests exercise the real SDK with a mocked transport, catalog coverage, cancellation, request validation, and local API boundaries. These checks do not verify live model quality or account access.

For a production build served locally:

```sh
npm run build
npm start
```
