# Sift 2.1 verification

**30 automated tests passed**, covering reader defaults, broad discovery criteria, request evidence, typed response validation, actual-decision confidence, conservative skipping, missing context, adjacent topics, bounded corrections, cache invalidation, privacy boundaries, remembered-key removal, rate-limit fallback, session budgets, concurrent-call deduplication, two-call concurrency and immediate pause/cancellation. Provider migration tests also verify the OpenRouter endpoint/model/authentication, rejection of direct TypeSafe keys, removal of legacy credentials without losing preferences, OpenRouter credit errors, and error responses that must not save a connection.

**17 browser checks passed** in a fresh isolated Chrome profile:

1. Actual Chrome action popup measured 360px wide, 498px high, without horizontal clipping.
2. Connection-first UI, on/off and prefilled personalized settings.
3. No fabricated classification before Jev is connected.
4. Connect/test and full request/response path using simulated Jev responses.
5. Confidence directly below the recommendation.
6. The screenshot-style vague video remains uncertain.
7. Quote/link-card context is extracted; authors and engagement are excluded.
8. Correct a post, retain the local preference, and undo it.
9. Optional dim/strike treatments work.
10. Off restores original horizontal positions, widths and styling.
11. Opt-in image fetching, resizing, asset references and OpenRouter model routing work.
12. Narrow feed has no horizontal overflow; native menus remain clear.
13. Recycled post elements receive new decisions.
14. New media-only posts retain room for the preview.
15. API failure is explicit; retry recovers.
16. Private routes remain inactive.
17. No uncaught browser page errors.

The browser harness temporarily pregrants API/media origins in its isolated extension copy. The shipped manifest retains optional permissions. It uses illustrative posts, a synthetic test image and intercepted API responses. No real API key, user feed, cookies or browser account was accessed.

Home popup, settings and feed screenshots were visually reviewed. The mechanical UI detector reported no findings. JavaScript syntax checks passed.

## Not claimed

- Live Jev connectivity, real request latency or classification accuracy: no real key was supplied.
- Image-analysis accuracy: the image request path was tested, while its decision was simulated.
- Complete signed-in X compatibility: the browser fixture reproduces relevant layout and recycling behavior; X can change its markup.
- Semantic evaluation results: the 32-case live evaluation harness is included but has not been run. No artificial “accuracy” number is reported.

The version 2.1 browser suite uses OpenRouter response metadata and exercises the OpenRouter key form, key-page link, connection test, images, classification and recovery. All service requests are simulated; no real OpenRouter key was used.
