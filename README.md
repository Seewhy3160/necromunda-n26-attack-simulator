# Necromunda Attack Simulator

One offline HTML file with two calculators, ranged and melee. Give it an attacker,
a weapon profile and a target, and it returns the chance that the attack ends in a
flesh wound, a serious injury or out of action.

Open `index.html` in a browser. There is no build step, no server, no network
request and nothing written to storage.

This is a sibling project to the Offline Rulebook Reference, not an addition to it.
That project lists "no rules engine, dice roller or combat resolver" as a non-goal;
this is exactly that engine, so it ships as its own file.

## What it does

* **Two calculators on one page**, ranged and melee, each self-contained.
* **Every input is a dropdown of legal values** — Strength 1–10, AP 0 to −6, and so on.
* **Profile pickers** load the Trading Post weapons (p154–157) and a fighter profile
  into those dropdowns. Picking one only fills the fields; every field stays editable,
  and the line under the picker shows what was loaded so it can be checked against the book.
* **Three percentages**, worked out exactly by enumerating the dice. Nothing is rolled
  or sampled. Alongside them sit the chances of coming through unharmed or merely
  wounded, so the five outcomes add up to 100%.
* **Recomputes on every change.** There is no submit button.

It models one attacker, one weapon, one target, one activation. It does not roll dice,
track a game, or reproduce rules text.

## How the maths works

The three headline numbers are the probability that the target ends the activation in
each state, not the chance of a single die rolling a given way. The whole attack is
pushed through an exact distribution over target states — wounds remaining, condition,
plus Webbed and Blind flags — so a multi-wound target, a rapid-fire burst and a
three-attack melee flurry are all handled by the same chain:

1. **Hit roll** (p72, p74). Natural 1 always misses, natural 6 always hits. A Seriously
   Injured target applies its −1 automatically.
2. **Rapid Fire** (p73). One hit roll turns into a number of hits equal to the total
   bullet holes across X Firepower dice.
3. **Wound roll** (p76), from the Strength versus Toughness table, or replaced by
   Toxin, Shock, Graviton Pulse or Flash where a trait says so.
4. **Save roll** (p76). AP, cover and characteristic bumps fold into one modifier; the
   model takes whichever of its armour and invulnerable saves is better, because only
   one save is rolled per hit. A natural 1 or 2 always fails.
5. **Injury dice** (p77). An unsaved wound that drops the target to zero Wounds means
   Lethality Injury dice, of which the attacker **selects one** — so the best available
   result is taken, and a Serious Injury does nothing to a model already Seriously Injured.

In melee each Attack dice is resolved in sequence, so the target's wounds and condition
carry from one attack to the next.

### Traits that change the numbers

Rapid Fire, Toxin, Rending, Shred, Breaching, Shock, Blaze, Gas (and respirators), Web,
Flash, Graviton Pulse, Damage (X), Template, Light, Paired (X), Parry and Shield on the
target's side, and Unwieldy only in as much as it does not affect the odds.

### Traits that do not

Blast scatter, running out of ammo and jams, Knockback, Concussive, Drag, Rad-phage,
Cursed, Reckless, Smoke, Twin-linked, Stray Shots, Target Priority, Nerve checks,
Initiative order and return attacks, skills, and the Lasting Injury table. When a picked
weapon carries one of these, the page names it under the results rather than dropping it
silently.

## Assumptions, and two things worth checking against your book

* **Injury dice faces.** The core rules name the three faces (p77) but not how many of
  each. The tool assumes the usual 1 Out of Action / 2 Serious Injury / 3 Injured, and
  the spread is a dropdown in the Assumptions panel if your book says otherwise.
* **The short/long range save modifier.** The cover table on p76 is transcribed as
  printed: +1 to the save within the weapon's Short Range, +2 within Long Range. A
  better save at short range reads oddly, so it is worth a look at the book. The free
  "other save modifier" dropdown is there if your reading differs.
* **Rapid Fire** assumes the maximum X Firepower dice are rolled.
* **Twin-linked** is not modelled, because rerolling Firepower dice needs a policy for
  when the attacker would choose to.
* **Fighter profiles.** The core rules print exactly one full fighter profile (the Escher
  Gang Sister, p50), and it is labelled as such. The other entries in the picker are
  rounded archetypes for quick setup, marked "not book profiles".
* Weapon variants that differ only by traits with no effect on the odds — the warp round
  versions of the autogun, autopistol and stub gun — are left out of the picker.

## Tests

```
npm install     # only needed for the browser tests
npm test        # everything
npm run test:fast   # engine and data only, no dependencies
```

* `test/engine.test.mjs` — the rules maths, checked against hand-worked figures.
* `test/data.test.mjs` — the transcribed Trading Post tables and the trait parser.
* `test/montecarlo.test.mjs` — an independent dice simulator, sharing no code with the
  engine, run over two million trials per case to cross-check the exact probabilities
  on awkward trait stacks.
* `test/browser.test.mjs` — loads the file over `file://` in Chromium and drives the
  real controls. Skips itself if Playwright is not installed.

The tests read the `<script>` blocks straight out of `index.html`, so the single file
stays the only source of truth.

---

Unofficial fan-made tool. Necromunda is a trademark of Games Workshop Ltd. Page
references are to the N26 core rules; no rules text is reproduced here.
