# API

The simulator exposes a supported surface for other programs — a survivability
calculator, a list builder, anything that needs the rules maths or the price
model without reimplementing either.

Everything else in `index.html` is internal and may be renamed without notice.
**This document is the contract**; `test/api.test.mjs` enforces it.

## Getting hold of it

**In a browser.** Load the page; the API is on `window.Necromunda`. The file is
self-contained and offline, so a plain `<iframe>` or a script tag works.

**In Node.** The four script blocks have to be evaluated together:

```js
import fs from 'node:fs';
const src = fs.readFileSync('index.html', 'utf8');
const grab = (id) => src.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))[1];
const Necromunda = new Function('module',
  grab('engine') + grab('data') + grab('pricing') + grab('api') + ';return Necromunda;'
)({ exports: {} });
```

`test/load.mjs` has this as `loadApi()`. The sibling list-optimiser project
loads the engine the same way.

## Conventions

- Every probability is a number from 0 to 1.
- A **weapon** is either a catalogue name (`'Boltgun'`) or a profile object.
- A **target** is either a fighter name (`'Ganger'`, `'Ghost (Delaque, 45c)'`) or
  a stat object (`{ T: 3, W: 1, sv: 5 }`).
- Gang list material is **off unless asked for**. Pass `gang: true` for all of
  them, or `gang: 'Goliath'` for one House. Ask for a gang weapon without it and
  the call throws rather than silently missing it.
- A bad call throws. Nothing returns a quietly wrong number.

## `shoot({ bs, weapon, target, hitMod, gang })`

One ranged attack.

```js
Necromunda.shoot({ bs: 4, weapon: 'Boltgun', target: 'Ganger' })
// { outOfAction: 0.153, serious: 0.208, fleshWound: 0.034,
//   wounded: 0, unharmed: 0.605, anyInjury: 0.395, ... }
```

## `fight({ ws, strength, weapon, attacks, target, hitMod, gang })`

One close combat flurry. `strength` is the **attacker's** Strength and is
required for any weapon whose profile reads `S` or `S+1` — most melee weapons.
For two weapons, pass `weapons: [{ weapon, attacks }, …]` instead.

```js
Necromunda.fight({ ws: 3, strength: 3, weapon: 'Power sword', attacks: 3, target: 'Champion' })
```

## `survive({ target, attacks, gang })`

**The survivability primitive.** Several attacks against one fighter, each
picking up where the last left off — wounds and condition carry across. This is
not the same as multiplying single-attack odds together, because a fighter that
has already lost a wound is easier to finish.

```js
Necromunda.survive({ target: 'Champion', attacks: [
  { bs: 4, weapon: 'Boltgun' },
  { bs: 4, weapon: 'Boltgun' },
  { ws: 4, strength: 3, weapon: 'Chainsword', attacks: 2 }
]})
// { survives: 0.860, unharmed: 0.295, outOfAction: 0.140, ... }
```

An entry with `bs` is a ranged attack; one with `ws` is a melee flurry. Adds
`survives` (1 − outOfAction) to the usual fields.

## `catalogue({ gang })`

Everything buyable, for a list builder.

```js
{ ranged: [ { name, kind, category, gang, shortRange, longRange, str, ap,
              lethality, traits, credits, tradePoints, multiProfile } … ],
  melee:  [ … ],
  fighters: [ { name, gang, credits, ws, bs, S, T, W, I, A, sv, fromBook } … ] }
```

`credits: null` means not purchasable — only the notional hand weapon.
`tradePoints: null` means the Trading Post does not list one, which is the case
for every gang list weapon, and is exactly the House advantage.

## `priceModel({ gang })` and `valueOf(name, { gang })`

What the market charges per stat, and what a weapon is worth against its own
stat line. **Prices only** — this says nothing about how good a weapon is.

```js
Necromunda.valueOf('Meltagun')
// { name: 'Meltagun', credits: 140, modelSays: 140.8, difference: -0.8, heldOutOfFit: false }
```

`priceModel()` returns per-model `weaponsFitted`, `meanErrorCredits`,
`meanErrorIfMultiplier`, `shape`, and the full `coefficients` and `weapons`
lists. Read `coefficients[].weaponsCarrying` before trusting any one figure: a
coefficient resting on one or two weapons describes those weapons, not a market
rate. `heldAtZero` marks one pinned at its boundary.

## What it will not tell you

- **One attacker, one target.** Template and Blast weapons hit everything under
  the marker; none of that is modelled.
- **No Initiative order**, so nothing here asks whether the target strikes back.
- **Ammo, Knockback, Concussive, Drag, Rad-phage, Cursed and Blast scatter onto
  other models** are not modelled. `problems` on a result names anything about
  the profile the engine could not resolve.
- Prices are Trading Post; gang lists agree on every weapon both sell.
