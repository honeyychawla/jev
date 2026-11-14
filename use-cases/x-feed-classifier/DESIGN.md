# Sift 2.1 design contract

## Existing feed

The original X layout remains the primary surface. Use a 40px-wide transparent corner button just below the native author/menu row. The emoji is 28px with an 11px confidence beneath. No pill, large card or persistent text strip. Use native 👍 explore, 👎 skip and 🤔 unclear, as explicitly requested emoji affordances. 🔌 and ⏳ represent connection/pending states rather than judgments. Meaning is available in accessible names and on click.

The marker is absolutely positioned and never joins X's horizontal flex row. Nearby text reserves 52px on its inline-end edge; short text and media-only posts reserve vertical space so the marker does not cover native controls. Pause removes every injected node and class. A detail section opens only on request and contains the reason, evidence limits and correction buttons.

Default treatment is markers only. Optional highlighting, dimming and strikethrough are reversible. Uncertain posts stay readable. Full-video uncertainty is never disguised as image understanding.

## Toolbar popup

Operate mode. Preserve the quiet green, bundled Manrope identity. The native popup uses an explicit 360px width on html and body, with no percentage-width breakpoint that can trap Chrome's initial sizing. The home view fits below Chrome's 600px popup limit. Connection and settings are separate views inside the same popup, with scrolling for longer settings.

Hierarchy: brand; Your AI feed and on/off; prominent connection state/action; three-outcome legend; concise interest summary; Settings. Connection absence is visible before any implied AI result. Settings contain the editable profile, adjacent topics, appearance, optional experimental images, optional basic estimates and session budget. Session key storage is default; remember-on-device requires an explicit checkbox.

Use one accent, clear 11–19px text roles, 40px primary controls, keyboard focus indicators, sensible disabled/error states and no dashboard. User-specified emojis override generic icon-system preferences; structural navigation remains plain text.

## Verification

Measure a real Chrome action popup, not only a manually sized browser tab. Test the X-shaped horizontal layout, quoted posts, card context, video-only posts, narrow feed, recycled elements, API failure, pause and correction flows. Keep simulated-response previews explicit. Browser fixtures prove mechanics, not live X or Jev accuracy.
