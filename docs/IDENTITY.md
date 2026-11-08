# Swish identity

The header keeps Core’s blue wordmark treatment and reads Swish. The rail keeps its compact s> mark.

The external application icon matches Terminal and Ember: the same 824px rounded tile on a 1024px canvas, glowing gradient rim, dark screen, scanlines, glass sheen, and upright chevron. Swish uses blue with a lowercase italic `s`, outlined from IBM Plex Sans Condensed SemiBold Italic (SIL OFL 1.1). The font license is in `assets/licenses/IBM-Plex-Sans-Condensed-OFL.txt`; no installed font is required to render the SVG.

Source: `assets/swish-icon.svg`. Tile and effects are adapted from Terminal’s `assets/terminal-icon.svg`, with the letter treatment following Ember’s `desktop/assets/ember-icon.svg`. Generate packaged assets with `npm run tauri -- icon assets/swish-icon.svg`. ICNS, ICO, and the existing PNG size families are committed.

The November 7 owner request replaces the earlier outlined uppercase S direction with the suite-matched icon. [Side-by-side review](screenshots/suite-icons.png) compares the generated Swish, Terminal, and Ember icons at large, 64px, 32px, and 16px sizes. Packaged assets were generated and visually inspected; installed Dock refresh and Windows appearance were not verified.
