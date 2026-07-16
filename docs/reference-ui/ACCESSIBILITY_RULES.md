# Accessibility Rules

This Experience Layer guidance follows the [NEXUS Platform Constitution](../architecture/NEXUS_Platform_Constitution.md).

- Use semantic `header`, `nav`, `main`, `section`, `footer`, `dialog`, lists, and definition lists.
- Provide a keyboard-visible skip link and visible focus outlines.
- Every icon-only control requires an accessible name; decorative icons are hidden where appropriate.
- State uses text plus color and/or icon. Do not rely on color alone.
- Stale, unavailable, timeout, mismatch, unauthorized, and error states use plain-language text.
- Minimum target size is 36px, with 44px preferred for primary navigation.
- Respect `prefers-reduced-motion` and `prefers-contrast`.
- Keep reading order identical to visual order at every breakpoint.
- Dialogs must have a label and a keyboard-operable close control. Future work should add focus trapping if the dialog gains interactive content beyond close.
- Do not announce periodic refresh unless the state materially changes; manual refresh remains labeled.
