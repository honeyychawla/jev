# Ordering behavior

Jev (`typesafe/jev-1.14`) makes real OpenRouter decisions in two stages: interpreting the request, then approving each permitted website click. The server validates its answers. Ordinary code computes desired quantities and verifies the website cart. There is no replacement model or offline success response.

## Counts and ordinary wording

- Digits and English number words from 1 through 20 are supported. `2margarita large`, `two large margheritas`, and `farmhouse large 2` are valid formats.
- A bare order such as `3 large Farmhouse` means a final quantity of 3 for that item and variant. `Add 2` or `2 more` means an additional 2. `Make it 2` means a final total of 2.
- `Small` maps to Domino’s `Regular`. `Med`/`M` and `L` map to medium and large. `Margarita`, `margareta`, and their plurals are recognized as Margherita in pizza orders.
- `Another one` uses the most recently requested cart item. A size-only change preserves quantity, crust, and unrelated items. Ambiguous references require clarification.
- `Remove 1` subtracts one. `Remove the Farmhouse` removes the matching line. If more than one size matches, specify the size or say all Farmhouse. `Remove everything` clears the cart. Zero removes the specified line.
- Up to six distinct item/size operations can be requested together. Quantities are limited to 20 per identical variant, subject to the website’s own limits and availability.
- Drink volumes, prices, and “serves” numbers are not item counts.

## Clarifications

An incomplete request does not add a default pizza first. For `3 Farmhouse`, the app asks for size and saves the requested quantity. `Large` completes the original request. The displayed size choices also accept `1`, `2`, `3`, their English number words, or their displayed size names.

A new explicit quantity overrides the pending quantity: `3 Farmhouse` followed by `make that 2 large` requests two large pizzas. A complete new order replaces an unfinished request. `Cancel that` cancels the pending request without emptying the existing cart.

The size choices offered to Jev are grounded in the customer’s text and explicit clarification options. It cannot choose a displayed menu default when the customer omitted a required size. Known menu-name coverage detects omitted requested products. Uncertain consequential decisions stop for clarification.

Explicit extra toppings, unsupported instructions, and unrecognized options require review in the Domino’s browser. They are never silently discarded. Sizes and recognized crusts are checked against the website’s actual options before clicking Add or Update.

## Website execution and verification

- Actual cart rows establish quantities and variants. The menu’s combined counter cannot prove the quantity of one size.
- Textless plus/minus icons are identified with their exact cart row and variant.
- Increasing a quantity exposes only the matching plus control to Jev. A decrease or unrelated customization is not an alternative.
- Both `Repeat Last` and `Repeat Last Customisation` dialogs are supported.
- Adding another size uses `Add New`; it cannot update and replace the existing size.
- The whole target cart must match before success is reported. Replies name the verified quantities and sizes. Final review includes Domino’s displayed total when available.
- A loading dialog cannot authorize an addition. Cart recommendations do not count as a loaded cart. Cart navigation waits for the destination and its visible content, without waiting for unrelated resources to finish.
- Repeated unchanged states stop the task. External changes to unrelated items also stop it.
- Pause stops after an already-started action. Resume retains the original final target, so a partially completed addition is not counted again. API failures stop execution and preserve the recorded activity.
- Payment, order submission, cash on delivery, login credentials, and personal delivery data remain under the user’s control.

## Reproducible checks

`npm test` runs the local regression suite, including 1,260 combinations of existing quantity, requested count, and set/add/subtract operations.

`npm run test:language` and `npm run test:clarifications` use the configured server-side key for real, billable Jev calls. They do not change a website cart. `npm run test:dominos` uses a separate browser profile and guest cart on the real website, stopping before payment. Test reports are saved locally under `data/qa/`. These tests do not run automatically on app startup.
