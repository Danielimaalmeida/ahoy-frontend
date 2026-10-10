# FilterChips

Toggle chips that filter a list by status, each with a count and the API word.

One chip is pressed at a time (`aria-pressed="true"`, accent fill). Each status chip contains its StatusBadge, the API word in `ah-chip__api` and the count, so people learn the mapping by using it. "In port" groups the two terminal outcomes.

## Markup

```html
<button class="ah-chip" type="button" aria-pressed="false">
  <span class="ah-badge ah-badge--halted" style="height:18px"><i class="ah-badge__dot"></i>Anchored</span>
  <span class="ah-chip__api">halted</span><span class="ah-chip__count">2</span>
</button>
```
