# Catalogue Studio tabs

## Design and implementation plan

1. Restore the existing combo workflow as the default **Combos** tab, including its occasion filter, client name, combo cards and download button.
2. Add a separate **Individual gifts** tab with compact primary filters; put optional date filters behind More filters. Keep price visibility, client name and export together. Preserve each tab's selections when switching.
3. Implement accessible tab semantics, keyboard navigation, focus indicators and responsive layouts. Hide unavailable production classification filters instead of presenting dead controls.
4. Rebuild both previews with versioned CSS and JavaScript so stale styling cannot mix with new HTML. Keep production schema and records unchanged.
5. Verify default state, tab switching, selection retention, export controls and desktop/mobile layouts; run existing regression checks; commit and push.

## Checklist

- [x] Combo tab restored as default
- [x] Separate individual gift tab with compact filters and export controls
- [x] Keyboard navigation and selection retention
- [x] Responsive desktop/mobile visual review
- [x] Both preview builds updated; asset cache versions verified
- [x] Regression checks pass; changes committed and pushed

Validation: 44 automated tests passed; browser verified combo default, independent selected items retained, arrow-key tab navigation, desktop layouts and a 390px mobile viewport without horizontal overflow. Preview startup has no console errors. CSS and JavaScript use catalogue-tabs-1 cache versions. Production data/schema unchanged; classification filters remain hidden in the production-compatible preview.
