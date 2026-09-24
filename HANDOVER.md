# Handover

State of both projects as of the end of the session that built them, and the
things a next session should know before touching anything.

## The two projects

| | What it is | Where it lives |
|---|---|---|
| **necromunda-n26-attack-simulator** | One offline HTML file. Three tabs: Ranged, Melee, Value. | GitHub, branch `claude/new-session-lfehed`, public, GitHub Pages on |
| **necromunda-n26-list-optimiser** | Gang list findings, computed by loading the simulator's engine | **Local git only — never pushed.** Sent to the user as a zip |

Live: `https://seewhy3160.github.io/necromunda-n26-attack-simulator/`
Artifact mirror: `https://claude.ai/artifact/Vurot5nfVQ58NxWuysPv25`

**The optimiser exists nowhere but the user's zip and this container.** If it is
wanted on GitHub it needs a new repo; that was offered and not taken up.

## The API

`window.Necromunda`, documented in **API.md**, is the supported surface for other
programs — a survivability calculator, a list builder. Everything else in
`index.html` is internal. `test/api.test.mjs` is the contract; changing it
breaks consumers, so change it deliberately.

- `shoot` / `fight` — one attack, taking a weapon by name or as a profile.
- `survive` — several attacks threaded through one target, wounds carrying
  across. This is the survivability primitive and is *not* the same as
  multiplying single-attack odds, because a wounded fighter is easier to finish.
- `catalogue` / `priceModel` / `valueOf` — what a list builder needs.

Gang material is off unless a call passes `gang: true` or names a House.

## How they fit together

The simulator is the single source of truth for rules maths *and* for weapon
pricing. The optimiser loads both out of `index.html` at runtime rather than
keeping its own copy:

```
index.html  <script id="engine">   dice, wound rolls, injury dice
            <script id="data">     profiles, Trading Post prices, gang lists
            <script id="pricing">  the price regression
                 |
          lib/engine.mjs  (extracts and evaluates them)
                 |
     data/*.mjs  ->  analyse*.mjs  ->  findings/*.md
```

This is deliberate and load-bearing. The engine has been corrected twice from
source documents, and every figure moved both times. A test in each project
fails if the optimiser starts doing its own maths, and another fails if the
committed findings drift from the engine.

`analyse.mjs` and `analyse-pricing.mjs` rewrite tables between
`<!-- generated:name -->` markers. Prose outside the markers is hand-written.
Never hand-edit a generated block; re-run the script.

## Rules decisions that were hard-won

These came from the user correcting me, usually with a source photo. Do not
quietly revert them.

- **Injury dice: 1–2 Flesh Wound, 3–5 Seriously Injured, 6 Out of Action.** Not
  the 3/2/1 spread of earlier editions.
- **Firepower dice is a D6**, not a four-sided die: 1 hit on 1–3, 2 on 4–5,
  3 on a 6.
- **Vehicles are not in this edition.** The core rules reference still carries
  vehicle material; it is previous-edition content and was deliberately removed.
- **Unwieldy sets Initiative to 1 *before* modifiers**, so a charge still brings
  it to 3. Checked against the book twice.
- **Blast scatter: a 1" or 2" scatter counts as a hit**, since the marker still
  covers the target. 10 in 36 of missed Blast shots. This is the user's ruling,
  stated as a disclaimer on the page.
- The **short/long range save modifier** (p76) is transcribed as printed and
  still looks wrong — a better save at short range. It is the one open
  transcription question. Flagged in the README and in the app.

## Things the price model gets right on purpose

Every one of these was a bug the user caught. They are enforced by tests in
`test/pricing.test.mjs`; if you change the encoding, run them.

- **`(X+)` traits are fitted as a trigger rate**, so Breaching (5+) is worth
  exactly twice Breaching (6+), and a Blaze (4+) would price above Blaze (5+).
- **Lethality, Damage and Rapid Fire are fitted as steps**, so a level is the
  steps below it added up and cannot come out under the level beneath it.
- **Blast is fitted as covered area**, ratio (5/3)² fixed, scale estimated. As
  two free flags the fit put the 5" marker *below* the 3".
- **Drawbacks may not add credits; advantages may not subtract them.** Enforced
  by refitting with offenders pinned to zero. Left free, every drawback came out
  as a premium.
- **The drawbacks are a balance mechanic, not a price** — the user's framing, and
  the right one. A weapon is not dear because it jams; it jams because it is
  strong. Their price cannot be recovered from a list that never sells the same
  weapon with and without them.
- **Where matched pairs exist, trust them over the fit.** Rapid Fire (1) is worth
  about +5c from autogun-vs-lasgun and autopistol-vs-stub-gun, which the
  whole-list fit cannot recover.

## Open threads

1. **The optimiser still scrapes script blocks directly** rather than going
   through the API added later. It works and its tests pass, but `loadApi()` in
   `test/load.mjs` is now the documented path and the optimiser should move to it.
2. **The optimiser's `analyse-pricing.mjs` has an unfinished edit.** A section
   pooling the gang lists into the fit was drafted and *not applied* — the patch
   failed its assertion and nothing was written. The data file
   `data/gang-lists.mjs` **is** committed and correct. Wiring the extended fit
   into the findings page is the obvious next job. The numbers it produced when
   run by hand: melee goes from 20 weapons at ±2.42c to 38 at ±2.39c, and
   Paired (X) becomes estimable at about +7.8c where the Trading Post had no
   examples at all.
3. **Trade Points are shown but not modelled.** The Value tab displays them and
   explains that they are the real House advantage, but no figure prices them,
   because TP is not denominated in credits and the list gives no exchange rate.
   A TP model would need an assumption about what a Trade Point is worth.
4. **Template may scale with weapon cost.** Residuals slope +0.31 against price
   across the seven Template weapons, which is what a multiplier would look like.
   Seven weapons is too few to act on and the whole-list comparison says the
   market charges flat rates, so it is recorded and not acted on.

## Working notes

- The invented fighter archetypes were replaced by ~47 real profiles from the six
  gang lists, behind the same gang switch. The Juve archetype, previously the one
  never reviewed, was corrected against the real Prospects. The core rules' worked
  example profile turns out to be the Escher Gang Sister exactly.
- `npm test` in the simulator runs 105 tests, including a Monte-Carlo simulator
  that rolls its own dice and must agree with the exact engine. It is
  deliberately an independent implementation — **do not make it share code.**
- Browser tests need Playwright and fall back to a preinstalled Chromium at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. They skip rather than
  fail if neither is available.
- The optimiser needs the simulator checked out as a sibling directory, or
  `NECRO_SIM` pointed at its `index.html`.
- Gang list weapons are **off by default** in the simulator, behind a tick box
  and a per-House dropdown, so the pickers are not swamped.
- The user reads the numbers carefully and has caught several real errors. When
  something looks wrong to them it usually is; check the data before defending
  the output.
