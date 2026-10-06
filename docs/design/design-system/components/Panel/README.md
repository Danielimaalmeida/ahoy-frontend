# Panel

The one container: a white card with a `line` border and `radius-lg`, an optional header, body and footer.

Panels never get a shadow; elevation is for dialogs and toasts only. Headers hold a `section-title`, an optional muted subtitle and right-aligned actions. Lay panels out with flex or grid and `space-3.5` gaps. Do not nest panels; inside a panel, separate groups with `line-soft` rules or `surface-raised` boxes.

## Markup
```html
<section class="ah-panel" aria-labelledby="needs">
  <div class="ah-panel__head"><h2 class="ah-panel__title" id="needs">Needs you</h2><span class="ah-muted">4 voyages</span></div>
  <div class="ah-panel__body">…</div>
  <div class="ah-panel__foot">…</div>
</section>
```
