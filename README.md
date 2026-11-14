# jev

Five natural-language prompts for building useful local demos with **Jev by TypeSafe AI through OpenRouter**.

Choose a use case, open its prompt, and paste the entire text block into a coding assistant that can create files, run the app, and test it. Each prompt describes the final intended experience in one request.

| Use case | What you will build | One-shot build prompt |
|---|---|---|
| Hide display ads | **Jev Shield:** a Chrome/Edge extension that identifies likely ads and hides them reversibly. | [Copy prompt](use-cases/ad-blocker/PROMPT.md) |
| Order pizza through chat | A local **Domino’s ordering assistant** with a live browser view, verified cart, and visible Jev activity. | [Copy prompt](use-cases/pizza-ordering/PROMPT.md) |
| Find the right emoji | **Emote:** a minimalist search field with relevant emojis that rise from a pile and fall back as you edit. | [Copy prompt](use-cases/emoji-search/PROMPT.md) |
| Sort emails and comments | **Jev Inbox:** a local Gmail-style dashboard for classifying Gmail emails and YouTube comments. | [Copy prompt](use-cases/youtube-email-dashboard/PROMPT.md) |
| Choose what to read on X | **Sift:** a simple extension showing Explore, Skip, or Unclear directly on posts, with Jev confidence. | [Copy prompt](use-cases/x-feed-classifier/PROMPT.md) |

Each person supplies their own OpenRouter key and, for Jev Inbox, their own Google account setup. The interfaces run locally; Jev requests use the cloud API. Keep credentials in the finished app's private settings, never in a prompt.

These are build prompts, not runnable applications. Generated implementations can vary. Each prompt asks the coding assistant to complete setup, test the result, and clearly identify any remaining account setup or unverified live behavior.
