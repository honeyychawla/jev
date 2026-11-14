# jev

Five local Jev demos, organized by use case, with their final source packages, shareable downloads, setup guides, and one natural-language build prompt per use case. Snapshot: **14 November 2026**.

## Choose a demo

| Use case | Final demo | Project and setup | Original ready-to-share ZIP | One-shot build prompt |
|---|---|---|---|---|
| Hide display ads | **Jev Shield 0.2.2** | [Ad blocker](use-cases/ad-blocker/README.md) | [Download](downloads/jev-shield.zip) | [Copy prompt](use-cases/ad-blocker/ONE_SHOT_BUILD_PROMPT.md) |
| Build a Domino’s cart through chat | **Domino’s Jev demo 1.0.0**, including final ordering fixes | [Pizza ordering](use-cases/pizza-ordering/README.md) | [Mac package](downloads/Dominos-Jev-Demo-Mac.zip) | [Copy prompt](use-cases/pizza-ordering/ONE_SHOT_BUILD_PROMPT.md) |
| Find and insert matching emojis | **Emote 1.0.0** | [Emoji search](use-cases/ai-chat/README.md) | [Download](downloads/emote-emoji-search.zip) | [Copy prompt](use-cases/ai-chat/ONE_SHOT_BUILD_PROMPT.md) |
| Sort Gmail and YouTube comments | **Jev Inbox 1.0.0** | [YouTube and email dashboard](use-cases/youtube-email-dashboard/README.md) | [Download](downloads/jev-inbox-v1.0.0.zip) | [Copy prompt](use-cases/youtube-email-dashboard/ONE_SHOT_BUILD_PROMPT.md) |
| Decide which X posts to explore | **Sift 2.1.0, OpenRouter edition** | [X feed classifier](use-cases/x-feed-classifier/README.md) | [Download](downloads/sift-extension-v2.1-openrouter.zip) | [Copy prompt](use-cases/x-feed-classifier/ONE_SHOT_BUILD_PROMPT.md) |

Emote is the final emoji-search implementation: a minimalist search field with relevant emojis that rise from a pile and fall back as you edit.

## Get the whole collection

Download the combined `jev.zip` from [Releases](https://github.com/honeyychawla/jev/releases/latest), choose **Code → Download ZIP**, or clone:

```sh
git clone https://github.com/honeyychawla/jev.git
cd jev
```

Each demo is independent. Use its folder and README; there is no single server that starts all five. Each person connects their **own OpenRouter key**, and Jev calls use that person's API credits. Jev runs through a cloud API even though the interfaces run locally.

## Quick start from this repository

1. **Ad blocker:** open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `use-cases/ad-blocker/dist`. Open Jev Shield Settings, add your OpenRouter key, save consent, then enable it on a public website. The built extension is included; Node.js is not required to install it.
2. **Pizza ordering (Mac):** install Node.js 22.15+ and Chrome, then double-click `use-cases/pizza-ordering/Start Dominos.command`. The launcher installs dependencies and opens the blank local key file for setup. The app stops before submitting or paying for an order. See [START HERE](use-cases/pizza-ordering/START%20HERE.txt).
3. **Emote:** install Node.js 22.15+, open a terminal in `use-cases/ai-chat`, run `npm ci` then `npm run dev`, and open `http://127.0.0.1:5173`. Add your OpenRouter key in Settings. A Mac launcher is also included.
4. **Jev Inbox:** install Node.js 22.15+, then use the Mac or Windows launcher in `use-cases/youtube-email-dashboard`, or run `npm start` there. Open `http://localhost:5184`. Follow the [Google setup guide](use-cases/youtube-email-dashboard/docs/google-setup.md) for your own OAuth client, Gmail/YouTube account, and OpenRouter key.
5. **X classifier:** open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `use-cases/x-feed-classifier` itself. Open Sift → **Connect Jev**, enter your OpenRouter key, then refresh X. This is the final OpenRouter build, not the earlier direct-TypeSafe build.

If you download an individual original ZIP, use its original folder names and included instructions. Keep installed extension folders in a permanent location.

## What is preserved

- **205 source/package files** from the five latest shareable ZIPs, including the built Shield extension and pizza interface. All application code is byte-for-byte unchanged; one Git metadata rule preserves the original Windows launcher line endings in GitHub downloads.
- The **five original ZIPs**, unchanged, under `downloads/`.
- **Five one-shot natural-language build prompts**, one per use case, linked in the table above. Copy a complete prompt into a coding assistant to build that experience from scratch.
- Original setup guides, tests, dependency lockfiles where supplied, asset licenses, and existing one-shot prompts. Emote's [build prompt](use-cases/ai-chat/PROMPT.md) and Jev Inbox's [setup prompt](use-cases/youtube-email-dashboard/ONE_SHOT_PROMPT.md) and [build prompt](use-cases/youtube-email-dashboard/BUILD_PROMPT.md) are included.

Use the source folders or original ZIPs for these exact implementations. The one-shot prompts describe the final intended experience; newly generated implementations can vary. Private conversation transcripts and attachments are not included.

No saved emails, OAuth credentials, browser profiles, order history, or real API keys are included. The pizza key file is an empty tracked template required by its original launcher: after adding your key, do not commit that file's change. Runtime data created after setup stays private and must not be added to Git. Downloading a release ZIP is the easiest way to keep a personal configured copy separate from this repository.

## Verification

See [VALIDATION.md](VALIDATION.md) for the checks run for this collection. [SOURCE_MANIFEST.json](SOURCE_MANIFEST.json) records every imported file and original ZIP checksum. Verify the snapshot with Python 3:

```sh
python3 scripts/verify_snapshot.py
```

These are independent prototypes. The ad blocker hides display ads, not video ads or network trackers. The X classifier's live model accuracy depends on your key and available post context. Gmail setup requires your own Google Cloud configuration. This collection is not affiliated with TypeSafe, OpenRouter, Google, X, or Domino’s.
