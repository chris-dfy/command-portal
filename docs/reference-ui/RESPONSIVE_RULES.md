# Responsive Rules

- Above 1280px: the eight-domain status bar uses one row; health uses four columns.
- 1051–1280px: status and health use balanced multi-row grids.
- 821–1050px: mission and topology columns collapse; evidence uses one column; metrics use two columns.
- 820px and below: navigation becomes an off-canvas panel, main content becomes the only grid column, and the sticky desktop rail reflows.
- 820px and below: the executive status bar becomes an internally scrollable, snap-aligned strip; it never causes page overflow.
- 580px and below: all panel, health, coverage, and metric grids become single-column; secondary header facts hide but connection and read-only state remain visible.
- Touch targets remain at least 36px high; primary navigation targets exceed 44px.
- Content may wrap; evidence IDs truncate in lists and remain fully available in drill-down.
- No horizontal page scrolling is permitted at 320px viewport width.

Reduced-motion preferences disable transitions and repeating animations. Layout does not rely on hover.
