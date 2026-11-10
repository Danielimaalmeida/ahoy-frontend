## Summary

<!-- A diagram, diff sketch or tree of what changed. -->

## Evidence

<!-- Before and after: screenshots for UI (light and dark), or the test or command output. -->

## Merge Danger

**Door:** <!-- one-way or two-way -->

**Blast Radius:** <!-- one word -->

## Design system and accessibility

<!-- For a change people can see. Tick what holds; say why for anything left unticked. Rules: docs/design-system.md and
docs/accessibility.md. -->

- [ ] Built from `src/app/ui/` wrappers and bundle classes; any new component or variant is in the design system first
- [ ] Colours, spacing, radii and shadows come from tokens (`npm run lint` passes `tokens:check`)
- [ ] Labels follow `vocabulary.md` (plain words for statuses, actions and navigation)
- [ ] Every action works with the keyboard alone, with a visible focus ring, and Escape closes what it opened
- [ ] Every control has a name; icons alone carry an `aria-label`; status is not shown by colour alone
- [ ] Checked in light and dark: text 4.5:1, icons, borders and chart marks 3:1
- [ ] Motion stops under `prefers-reduced-motion`; no sideways scroll at 390px or at 200% zoom
- [ ] Not applicable: this change shows nothing new
