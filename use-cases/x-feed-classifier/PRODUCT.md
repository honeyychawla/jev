# Sift
<!-- impeccable:product-schema 1 -->

## Platform
Chrome extension (Manifest V3), operating directly inside X posts.

## Purpose and user
The user is an AI tinkerer who wants to learn, understand, discover tools and releases, try workflows, and explore useful subjects adjacent to AI. Discovery and accessibility matter more than technical depth. Short announcements, beginner explanations, creative demos, honest product promotion, robotics and practical automation can all be useful.

## Confirmed scope
Inline classification while scrolling. Clear top-right emoji with confidence underneath. Simple toolbar popup with on/off, connection and settings. No dashboard, separate feed, auto-scrolling, posting or social actions. Latest request calls for a deeper classification redesign, not only cosmetic fixes. User confirmed Jev was not connected in the previous screenshots.

## Decisions
Use three action outcomes: explore, skip, unclear. Distinguish irrelevant content from bait in the explanation. Be conservative about skipping. Never dismiss unseen video or image contents as off-topic. Jev is the default classifier; disconnected is an explicit status, not a keyword verdict. Basic estimates are opt-in and carry no model percentage.

## Personalization and evidence
Prefill the user's AI-tinkerer profile. Allow edits and adjacent-topic preference. Read visible text, quotes, link cards and alt text. Optional experimental Jev image analysis uses at most two post images or video posters. Corrections update local examples sent in future requests, not model weights. Confidence belongs to the action Choice; a changed guardrail outcome has no borrowed percentage.

## Boundaries
Use OpenRouter’s documented System One endpoint with the user’s OpenRouter key. Jev is still the TypeSafe model; authentication and billing use OpenRouter. Keep credentials isolated by provider and never forward a legacy TypeSafe key to OpenRouter. No browser-cookie extraction or personal browser profile access. API key storage is trusted-context only; remember-on-device is explicit opt-in. No full video/audio interpretation, fact checking or linked-page browsing claims. Test fixtures and confidence previews must be labeled simulated. Live model accuracy is unverified until a real API evaluation is run.
