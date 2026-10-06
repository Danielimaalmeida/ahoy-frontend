# TopBar

The app header on every screen: logo, the three destinations, search, the Live indicator, **Set sail** and the signed-in user.

- Destinations are pill tabs (`ah-nav__item`); the current one has `aria-current="page"` and gets `accent-soft`.
- **All hands** carries the count of voyages needing a person (`ah-count`). Planned screens carry `ah-soon` ("planned").
- **Set sail** is the only primary button in the bar.
- The Live indicator (`ah-live`) shows the event stream is connected. When it drops, swap it for a "Reconnecting to live updates…" pill (see Banner).
- No login or logout: sign-in is SSO. The avatar shows initials, with the e-mail in its tooltip.
- The bar wraps on narrow screens; it is never sticky.

## Angular
`<ah-top-bar [needsYou]="count" [live]="connected">` with `routerLink` + `routerLinkActive` setting `aria-current`.
