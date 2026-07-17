# Responsive Rules

This Experience Layer guidance follows the [NEXUS Platform Constitution](../architecture/NEXUS_Platform_Constitution.md).

- Above 1100px: navigation, the main workspace, and the persistent NEXUS copilot use three non-overlapping application columns.
- 821–1100px: navigation becomes off-canvas so the main workspace and NEXUS retain separate columns.
- Modules use workspace container queries, not only viewport breakpoints, so heroes, grids, Operational Understanding, Conclave, and topology reflow after NEXUS receives its column.
- 820px and below: NEXUS becomes an overlay because a usable side-by-side workspace no longer fits; navigation remains off-canvas and main content becomes the only grid column.
- 820px and below: the executive status bar becomes an internally scrollable, snap-aligned strip; it never causes page overflow.
- 580px and below: all panel, health, coverage, and metric grids become single-column; secondary header facts hide but connection and read-only state remain visible.
- Touch targets remain at least 36px high; primary navigation targets exceed 44px.
- Content may wrap; evidence IDs truncate in lists and remain fully available in drill-down.
- No horizontal page scrolling is permitted at 320px viewport width.

Reduced-motion preferences disable transitions and repeating animations. Layout does not rely on hover.
