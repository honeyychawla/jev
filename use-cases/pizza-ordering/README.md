# Domino’s chat ordering with Jev

Start with **START HERE.txt**. This portable Mac package includes the source,
lockfile, built browser interface, regression tests, and double-click launchers.
Dependencies install on first launch. No public repository or Codex is required.

The local server uses the key in **OpenRouter Key.env** (or the
OPENROUTER_API_KEY process environment variable). The browser never receives
the key. Real calls use typesafe/jev-1.14 through OpenRouter's decisions API.
Each person supplies their own key and pays for their own API usage.

The app controls a dedicated Chrome profile that starts empty. It reads the
menu and current cart, asks Jev for typed ordering decisions, calculates desired
quantities in code, and asks Jev for each permitted click. Success requires the
actual website cart to match. It stops before submitting or paying for an order.

[Ordering rules, examples and limits](ORDERING_RULES.md) describe digits versus
words, additions versus final quantities, clarifications and recovery. Explicit
extra toppings need manual selection. Website changes and availability can
require a human handoff.

The interface includes chat, a live website view, the actual cart, request time,
and real API questions/responses/confidence/latency. Chat stays editable while
working. Use Pause to stop further actions, and Resume to continue toward the
saved target. Enter location, sign-in and delivery details directly in Chrome.

## Development

Node.js 22.12+ and Google Chrome are required. The package includes dist/ so a
build is not needed to run it. To change the source, run npm ci, npm run build,
then restart. npm test runs the regression suite. The real-API language and
website tests are billable and require a live menu saved by a first app session.
The website test uses a separate guest profile. Normal startup runs no tests.

The current regression suite has 53 passing tests, including 1,260 quantity
arithmetic combinations. The source was also checked against 85 real Jev
language cases and 13 real Domino’s conversation cases before packaging.

After use, private runtime files appear under data/, OpenRouter Key.env,
server.log and .server.pid. Share the original clean ZIP; do not share your
configured working folder. This package has no sender-specific runtime data.

This is an unofficial demo, not a Domino’s product. Prices, products and the
final total come from Domino’s and can change with the store/location.
