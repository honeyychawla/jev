# Jev Shield data disclosure

## When scanning happens

Scanning requires a saved OpenRouter key, the data-sharing checkbox, an explicitly enabled site, and Chrome's permission for that host. Only the main frame is scanned. Site choice covers that exact hostname on HTTP and HTTPS, not every subdomain. Pausing restores hidden blocks and stops further scanning. Requests already received by OpenRouter may still be billed even if the browser aborts them.

## Data sent through OpenRouter to the Jev provider

For each candidate: an ephemeral candidate ID, HTML tag, at most 100 characters of id/class tokens, 80 characters of an ARIA label/title, 180 characters of candidate visible text, dimensions, up to four link/iframe hostnames, and up to five local candidate signals. The top-level page hostname is included. Requests also contain the fixed ad-classification questions and model name.

Full URLs, query strings, page titles, unrelated page text, screenshots, cookies, browser storage and form values are not collected. Input, textarea, select and editable text are excluded from text extraction. Email addresses, HTTP(S) URLs and long numeric identifiers are redacted from snippets, but this is not a comprehensive personal-data filter. Candidate text and structural labels can contain personal information. OpenRouter forwards classification data to the Jev provider (TypeSafe); provider handling and retention follow their policies and your account configuration.

## Sensitive pages

Pages with rendered password fields, one-time-code fields, credit-card autocomplete fields or visible Stripe/PayPal iframes are skipped. Hidden preloaded forms and invisible or one-pixel background payment frames do not suppress scanning of a public page. Opening or closing these controls via class, style or hidden-attribute changes rechecks the page. Form values remain excluded from candidate extraction. Common checkout, payment, billing, login, signin and inbox URL path segments are also skipped. These are heuristics, not a guarantee that private pages will be recognized. Only enable pages whose candidate snippets you are comfortable sharing.

## Local storage and API key

The key, consent, enabled-site list, threshold, daily limit and UTC daily request count are stored in `chrome.storage.local`. If you run the live diagnostic, its timestamp, model, latency and four fixed-example probabilities are also stored there. This diagnostic contains no browsing data. The storage area is restricted to trusted extension contexts before use. Page content scripts never receive the key. It is sent only to `https://openrouter.ai` as an authorization header, with cookies omitted and redirects rejected.

The extension does not encrypt the stored key. Anyone with access to the browser profile or extension developer tools may access it. **Remove key** deletes it from extension settings, clears consent, stops scans and restores hidden blocks. Removing the extension clears its local extension data through the browser. Use OpenRouter's key controls to revoke a key or set a monetary budget.

Website candidate descriptions and probabilities exist temporarily in page memory and in a bounded service-worker memory cache. They are not written to extension storage. Only the optional diagnostic's fixed-example results are retained. There is no custom analytics server, telemetry, automatic error upload or persistent URL history. The enabled-site list is retained so your settings work on return visits.

## Permissions

- `storage`: local key, settings and request count.
- `activeTab`: identify the current site when you open the popup.
- `scripting`: register and inject the scanner on explicitly enabled sites.
- `https://openrouter.ai/*`: verify the API key and request Jev decisions.
- Optional HTTP/HTTPS host access: requested only when you click **Enable on this site**. Pause/remove stops scanning; the browser may retain its site-access permission, which you can revoke in extension Details → Site access.

No externally connectable interface, remotely hosted executable code, browser cookie extraction, or background request interception is included.
