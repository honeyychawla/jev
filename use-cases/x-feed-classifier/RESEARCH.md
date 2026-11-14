# Sift 2.1: an AI discovery filter for your X feed

## OpenRouter routing update

Version 2.1 uses your **OpenRouter key**, sends requests to `https://openrouter.ai/api/v1/systemone`, and selects `typesafe/jev-1.14`. OpenRouter documents this TypeSafe-compatible interface, including the same typed questions and answers; the image assets shape is supported too. Authentication and charges belong to your OpenRouter account. A separate TypeSafe account is unnecessary. Existing TypeSafe credentials are never sent to OpenRouter. [System One compatibility](https://openrouter.ai/docs/guides/community/typesafe-sdk), [image asset support](https://openrouter.ai/docs/guides/community/multimodal-decisions)


## What you actually need

You are an AI tinkerer, not a reviewer looking only for rigorous research papers. A good recommendation can be a simple explanation, a new tool, a small experiment, a creative example, a useful product announcement, an accessible research result, or an adjacent workflow you could try. The extension’s job is to help decide where to spend attention while you scroll.

The operating principle is **be generous about discovery and cautious about dismissal**. A short post can be useful. A paid tool can be worth exploring. Excitement is not evidence of slop. A post outside your interests is not necessarily a bad post.

## Why the previous version failed

These findings come from the supplied screenshots, your confirmation that Jev was not connected, and inspection of the shipped source.

1. **Jev was not actually making the decisions.** The default provider was local rules. The “Powered by Jev” branding was technically an integration capability, but the feed experience made its absence much too easy to miss. The dashes were not poor Jev confidence; they indicated that no model confidence existed.
2. **The rules favored technical depth over your curiosity.** Code, benchmarks, measured results and limitations received bonuses. New tools, beginner explanations and practical creative ideas could lose even when they were exactly what you wanted.
3. **Missing keywords were treated as missing relevance.** The video advertisement in your screenshot does not establish its AI relevance in its visible caption. Automatically rejecting it was unjustified. Its video, image descriptions or link preview might supply the missing information.
4. **Five icons encoded too many distinctions.** Fast-forward, eyes and a question face required a legend. “Off-topic” was mixed into the same visual system as quality. Now three outcomes convey the next action; the detail view explains the distinction.
5. **The popup had a sizing trap.** A narrow-viewport rule changed the body to percentage width. Chrome can begin popup sizing from a narrow viewport, so that rule could preserve the cramped layout. Earlier tests set the viewport width manually and missed the actual popup path. The new test opens Chrome’s real action popup and measures its dimensions.
6. **The confidence was attached to the wrong combination of judgments.** The old number combined a usefulness-score confidence and an explanation confidence. It was not confidence in the actual read/skip recommendation. The new number comes from the direct recommendation Choice.

## How Jev helps you best

Jev is designed to return typed decisions rather than chat responses. Its Choice primitive supplies a selected option, a probability distribution and a confidence value. That makes it suitable for an inline reading decision with predictable UI states. [Choice documentation](https://docs.typesafe.ai/primitives/choice)

The extension sends six independent questions about one post in one request:

| Question | What it contributes |
|---|---|
| Read / skip / unsure | The proposed next action and its confidence |
| Direct / adjacent / unrelated / unclear | Relevance to your interests, separately from quality |
| Learning and discovery value | A diagnostic rating using your definition of usefulness |
| Empty bait | Distinguishes an engagement trap from ordinary promotion |
| Missing context | Prevents unsupported judgments about media and incomplete posts |
| Main reason | A short, fixed explanation such as tool, tutorial, workflow or missing context |

Each question evaluates the shared evidence independently. No question depends on another question’s answer. Batching avoids resending the same post for each question. [Parallel questions](https://docs.typesafe.ai/cookbooks/parallel_questions)

Personalization comes from your prefilled reader profile and up to four relevant examples from your own corrections. Jev does not fine-tune a private model for you; this is personalization through request context and explicit criteria. Your latest 20 feedback examples are retained on your device. [Models and customization](https://docs.typesafe.ai/models)

## The recommendation policy

- **👍 Explore:** enough evidence that this offers something relevant to learn, understand or try. It does not need to be advanced.
- **👎 Skip:** a well-supported negative reading recommendation. The reason distinguishes unrelated content from empty bait.
- **🤔 Unclear:** insufficient evidence or an ambiguous recommendation. The post stays readable.
- **🔌 Setup/connection needed:** Jev did not classify it. This is a status, not a judgment.

Read recommendations require a probability of at least 0.60 and decision confidence of at least 0.40. Skipping requires at least 0.85 probability and 0.70 confidence. These are conservative starting policies, not empirically optimized thresholds. Missing essential context, disagreement between relevance and recommendation, or borderline skip decisions route to “unclear.”

Confidence and probability are different. Jev’s Choice confidence describes the concentration of its distribution. It is not a percentage probability that the post is true or that you will like it. If a guardrail changes the proposed action, the main marker shows a dash rather than attaching the old action’s confidence to the new one. [Confidence documentation](https://docs.typesafe.ai/confidence)

## What evidence it can use

The extension extracts the visible post text, quoted text, link-card text, useful image alt text, whether media is present, and whether the text is truncated. It excludes author names, handles and engagement counts from the API request.

Optional image analysis sends up to two post photos or video posters. These are downloaded only from permitted X media paths, without cookies, bounded in size, and resized to at most 768 pixels before transmission. Profile pictures are excluded. Images are not saved in the result cache.

TypeSafe explicitly labels its image capability experimental. It supports image inputs, but full video and audio are not native inputs. A poster may identify an AI interface or a demo subject; it cannot establish the actions, narration or quality of the complete video. That limitation is visible in the decision details. [Images](https://docs.typesafe.ai/images), [supported inputs](https://docs.typesafe.ai/models)

Sift does not open linked websites, watch videos, fact-check announcements, or verify that a claimed release is genuinely new. “Worth exploring” is an attention recommendation. It is not an endorsement.

## A simple daily workflow

1. Turn Sift on and connect Jev once. The API key is tested before it is saved.
2. Keep the default AI-tinkerer profile and adjacent topics enabled initially.
3. Scroll normally. Only posts near the viewport enter the queue; at most two API calls run concurrently.
4. Tap a marker when its reason is unclear. Use **Useful to me** or **Not for me** for occasional corrections.
5. Enable image previews if you want to experiment with visual demos. Keep uncertain posts visible.

The popup’s main view contains the on/off switch, connection state, a three-item legend and Settings. Profile editing, appearance options, experimental images and usage controls live in Settings. There is no dashboard.

## Cost, latency and reliability

Jev’s published text price is $0.042 per million input tokens, with output tokens free at the time of this review. As an illustrative calculation, 2,000 text checks using 2,000 input tokens each would consume four million tokens, or about $0.168. This is not a measured cost for your feed; actual prompt lengths, media billing, retries and account pricing determine charges. The OpenRouter dashboard remains the source for usage and limits. [OpenRouter model pricing](https://openrouter.ai/typesafe/jev-1.14)

A session defaults to 200 feed calls. Cached results do not spend another call. The cache includes the model/schema version, evidence, profile, image setting and correction revision, so changed interests do not reuse stale judgments. Connection tests are one additional API call. Rate limits trigger a cooldown, and the popup exposes retry and budget controls.

The stable model is pinned to `typesafe/jev-1.14` so an alias change cannot silently change the tuned behavior. Model upgrades should be evaluated before switching. API latency and accuracy have not been measured with your account.

## Privacy and setup choices

The API key stays in trusted extension storage and is never sent to X or exposed to content scripts. Session-only is the default. **Remember on this device** is optional and stores the key locally without encryption or sync; Disconnect removes it. The popup discloses what is sent through OpenRouter to TypeSafe before connecting.

Image permission is requested only when enabling image analysis. Basic keyword estimates are disabled by default and, if enabled explicitly, show no model percentage. Private messages, chat, Grok, compose, settings and account routes are excluded. The extension never exports browser cookies or reads Chrome’s encryption key.

## Evidence and remaining uncertainty

Automated tests check software behavior, request construction, response validation, privacy boundaries and failure handling. Browser tests use an isolated profile, illustrative posts and simulated Jev responses. They cannot prove that Jev will classify real posts accurately.

The included `npm run evaluate:live` harness evaluates 32 labeled, illustrative cases with a locally supplied `OPENROUTER_API_KEY`. It reports agreement, false skips among useful posts, skip precision, uncertainty rate, latency and token usage. It has not been run because no real API key was supplied. It makes paid API requests only when you explicitly run it.

The most important next measurement is **how often something you wanted to explore gets a skip**. Start by correcting a small, diverse sample from your own feed: tool announcements, beginner lessons, creative demos, adjacent workflows, ambiguous videos and genuine bait. That evidence should guide later threshold changes; confidence alone does not establish real-world accuracy. TypeSafe also documents literal interpretation, adversarial content and other failure modes, which is why precise criteria and evaluation matter. [Model limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13)

Popup implementation reference: [Chrome popup constraints](https://github.com/googlechrome/modern-web-guidance/blob/main/skills/chrome-extensions/references/extensions/popup-ui.md). Research checked November 14, 2026.
