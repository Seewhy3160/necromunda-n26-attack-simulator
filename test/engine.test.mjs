import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from './load.mjs';

const E = loadScript('engine');
/* The Injury dice, per the dice symbols chart. */
const FACES = E.INJURY_DICE;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !== ${b}`);

/** Minimal weapon with every trait switched off. */
function weapon(o = {}) {
  return Object.assign({
    str: 4, ap: 0, lethality: 1, damage: 1, rapidFire: 0,
    toxin: 0, rending: 0, shred: 0, breaching: 0, shock: 0, blaze: 0,
    gas: false, web: false, flash: false, graviton: false,
    autoHit: false, unstable: false
  }, o);
}
function target(o = {}) {
  return Object.assign({
    T: 3, W: 1, sv: 0, inv: 0, saveMods: 0, status: 'active',
    initiative: 4, strength: 3, respirator: false
  }, o);
}
const ranged = (o = {}) => E.computeRanged(Object.assign(
  { skill: 4, hitMod: 0, weapon: weapon(), target: target(), faces: FACES }, o));
const melee = (weapons, o = {}) => E.computeMelee(Object.assign(
  { weapons, target: target(), faces: FACES }, o));
const mw = (o = {}, attacks = 1, skill = 4, hitMod = 0) =>
  ({ weapon: weapon(o), attacks, skill, hitMod });

test('wound roll table (p76)', () => {
  assert.equal(E.woundTarget(6, 3), 2);   // twice T or greater
  assert.equal(E.woundTarget(8, 3), 2);
  assert.equal(E.woundTarget(4, 3), 3);   // greater than T
  assert.equal(E.woundTarget(3, 3), 4);   // equal to T
  assert.equal(E.woundTarget(3, 4), 5);   // lower than T
  assert.equal(E.woundTarget(2, 4), 6);   // half T or lower
  assert.equal(E.woundTarget(1, 10), 6);
  assert.equal(E.woundTarget(10, 1), 2);
});

test('hit roll: natural 1 always misses, natural 6 always hits (p72)', () => {
  assert.equal(E.isHit(1, 4, +3), false);
  assert.equal(E.isHit(6, 4, -3), true);
  assert.equal([1,2,3,4,5,6].filter(f => E.isHit(f, 4, 0)).length, 3);   // 4+
  assert.equal([1,2,3,4,5,6].filter(f => E.isHit(f, 2, 0)).length, 5);   // 2+, nat 1 still misses
  assert.equal([1,2,3,4,5,6].filter(f => E.isHit(f, 6, +2)).length, 3);  // 6+ at +2 -> 4,5,6
  assert.equal([1,2,3,4,5,6].filter(f => E.isHit(f, 3, -2)).length, 2);  // 3+ at -2 -> 5,6
});

test('save roll: AP, cover, natural 1-2 auto-fail, best of armour/invuln (p76)', () => {
  near(E.saveProb(5, 0, 0, true), 2 / 6);
  near(E.saveProb(5, -1, 0, true), 1 / 6);     // AP -1
  near(E.saveProb(5, -3, 0, true), 0);         // AP -3 washes it out
  near(E.saveProb(5, +2, 0, true), 4 / 6);     // long range cover, capped by nat 1-2
  near(E.saveProb(2, 0, 0, true), 4 / 6);      // 2+ can never beat the auto-fail rule
  near(E.saveProb(6, -2, 5, true), 2 / 6);     // invuln ignores AP and wins
  near(E.saveProb(4, +2, 0, false), 0);        // armour disallowed (Gas / Breaching)
  near(E.saveProb(4, +2, 5, false), 2 / 6);    // ...but the invuln still stands
});

test('the Injury dice matches the dice symbols chart', () => {
  // 1-2 Flesh Wound, 3-5 Seriously Injured, 6 Out of Action.
  assert.deepEqual(E.INJURY_DICE, { ooa: 1, si: 3, inj: 2 });
  assert.equal(E.INJURY_DICE.ooa + E.INJURY_DICE.si + E.INJURY_DICE.inj, 6);
});

test('injury dice: attacker rolls Lethality and picks the best (p77)', () => {
  const l1 = E.injuryPick(1, FACES);
  near(l1.ooa, 1 / 6); near(l1.si, 3 / 6); near(l1.inj, 2 / 6);
  const l2 = E.injuryPick(2, FACES);
  near(l2.ooa, 1 - Math.pow(5 / 6, 2));                       // 11/36
  near(l2.inj, Math.pow(2 / 6, 2));                           // 4/36
  near(l2.si, Math.pow(5 / 6, 2) - Math.pow(2 / 6, 2));       // 21/36
  near(l2.ooa + l2.si + l2.inj, 1);
  const l3 = E.injuryPick(3, FACES);
  near(l3.ooa, 1 - Math.pow(5 / 6, 3));
  near(E.injuryPick(0, FACES).inj, 1);         // no dice -> Injured at 0 wounds
});

test('firepower dice: a D6 of 1, 1, 1, 2, 2, 3 hits (p72)', () => {
  const d1 = E.firepowerDist(1);
  near(d1.get(1), 3 / 6); near(d1.get(2), 2 / 6); near(d1.get(3), 1 / 6);
  near([...d1.entries()].reduce((a, [n, p]) => a + n * p, 0), 10 / 6);
  const d2 = E.firepowerDist(2);
  near(d2.get(2), (3 / 6) * (3 / 6));           // 1+1
  near(d2.get(6), (1 / 6) * (1 / 6));           // 3+3
  near([...d2.values()].reduce((a, b) => a + b), 1);
  near([...d2.entries()].reduce((a, [n, p]) => a + n * p, 0), 20 / 6);
  near(E.firepowerDist(0).get(0), 1);
});

test('plain shot end to end: BS4+ S4 vs T3 Sv6+ W1', () => {
  const r = ranged({ target: target({ sv: 6 }) });
  const pUnsaved = (3 / 6) * (4 / 6) * (5 / 6);
  near(r.outOfAction, pUnsaved * 1 / 6);
  near(r.serious, pUnsaved * 3 / 6);
  near(r.fleshWound, pUnsaved * 2 / 6);
  near(r.unharmed, 1 - pUnsaved);
  near(r.total, 1);
});

test('outcomes always sum to one', () => {
  for (const cfg of [
    ranged({ weapon: weapon({ rapidFire: 2, shred: 5, rending: 4, blaze: 5 }), target: target({ W: 3, sv: 4 }) }),
    ranged({ weapon: weapon({ str: 8, ap: -4, lethality: 3, damage: 3 }), target: target({ W: 2, sv: 3, inv: 5 }) }),
    ranged({ weapon: weapon({ web: true }), target: target({ sv: 5 }) }),
    ranged({ weapon: weapon({ flash: true }) }),
    ranged({ weapon: weapon({ graviton: true, str: null }) }),
    melee([mw({ shock: 5 }, 3), mw({ toxin: 3 }, 1)], { target: target({ W: 2, sv: 4 }) })
  ]) {
    near(cfg.total, 1, 1e-9);
    const sum = cfg.fleshWound + cfg.serious + cfg.outOfAction + cfg.wounded + cfg.unharmed;
    near(sum, 1, 1e-9);
  }
});

test('a W2 target needs two unsaved wounds before injury dice (p77)', () => {
  const r = ranged({ skill: 2, weapon: weapon({ str: 10, rapidFire: 1 }), target: target({ W: 2 }) });
  // Str 10 vs T3 wounds on 2+, no save: every hit past the first takes them down.
  const pHit = 5 / 6, pW = 5 / 6;
  // one hit: never reaches 0 wounds
  const fp = E.firepowerDist(1);
  let pDown = 0;
  for (const [n, pn] of fp) {
    // number of unsaved wounds out of n, need >= 2
    let p2 = 0;
    for (let k = 2; k <= n; k++) {
      p2 += binom(n, k) * Math.pow(pW, k) * Math.pow(1 - pW, n - k);
    }
    pDown += pn * p2;
  }
  near(r.fleshWound + r.serious + r.outOfAction, pHit * pDown, 1e-9);
});

test('Damage (X) drops several wounds at once (p162)', () => {
  const plain = ranged({ skill: 2, weapon: weapon({ str: 10 }), target: target({ W: 3 }) });
  const dmg3  = ranged({ skill: 2, weapon: weapon({ str: 10, damage: 3 }), target: target({ W: 3 }) });
  near(plain.fleshWound + plain.serious + plain.outOfAction, 0);   // one wound off three
  near(dmg3.fleshWound + dmg3.serious + dmg3.outOfAction, (5 / 6) * (5 / 6));
});

test('Toxin ignores Strength versus Toughness entirely (p165)', () => {
  const tough = ranged({ skill: 2, weapon: weapon({ str: null, toxin: 3 }), target: target({ T: 10 }) });
  near(tough.perHit.pWound, 4 / 6);
  const frail = ranged({ skill: 2, weapon: weapon({ str: null, toxin: 3 }), target: target({ T: 1 }) });
  near(frail.perHit.pWound, 4 / 6);
});

test('Breaching and Gas deny armour saves but not invulnerable saves (p162-163)', () => {
  const breach = ranged({ skill: 2, weapon: weapon({ str: 10, breaching: 2 }), target: target({ sv: 2 }) });
  near(breach.unharmed, 1 - (5 / 6) * (5 / 6));            // wound on 2+, breach on 2+, no save
  const gas = ranged({ skill: 2, weapon: weapon({ str: 10, gas: true }), target: target({ sv: 2, respirator: true }) });
  near(gas.unharmed, 1 - (5 / 6) * (5 / 6) * (4 / 6));     // 5+ invuln from the respirator
});

test('Shock auto-wounds and counts as a natural 6 for Shred (p164)', () => {
  // WS 6+, Shock (5+): a 5 hits only via the modifier, a 6 always hits.
  const r = melee([mw({ str: 1, shock: 5, shred: 6, lethality: 1 }, 1, 6, 0)], { target: target({ T: 10, W: 1 }) });
  // Only a natural 6 hits at WS6+; it triggers Shock, so it auto-wounds, and
  // the natural 6 also fires Shred, taking Lethality to 2.
  const l2 = E.injuryPick(2, FACES);
  near(r.outOfAction, (1 / 6) * l2.ooa);
  near(r.serious, (1 / 6) * l2.si);
});

test('a Seriously Injured target is harder to shoot and cannot get worse than Out of Action (p72, p77)', () => {
  const si = ranged({ skill: 4, weapon: weapon({ str: 10 }), target: target({ status: 'seriously' }) });
  near(si.pHit, 2 / 6);                                     // 4+ at -1
  near(si.fleshWound, 0);
  const l1 = E.injuryPick(1, FACES);
  near(si.outOfAction, (2 / 6) * (5 / 6) * l1.ooa);
  near(si.serious, 1 - si.outOfAction);                     // everything else leaves them where they were
});

test('melee: charge and a secondary weapon add attack dice (p74)', () => {
  const r = melee([mw({ str: 10 }, 3), mw({ str: 10 }, 1)], { target: target({ W: 5 }) });
  near(r.expectedHits, 4 * (3 / 6));
});

test('Web never inflicts an injury (p165)', () => {
  const r = ranged({ skill: 2, weapon: weapon({ str: 10, web: true, lethality: 0 }), target: target({ sv: 0 }) });
  near(r.fleshWound + r.serious + r.outOfAction, 0);
  near(r.webbed, (5 / 6) * (5 / 6));
});

test('Flash blinds on a failed Initiative check and never wounds (p162)', () => {
  const r = ranged({ skill: 2, weapon: weapon({ str: null, flash: true }), target: target({ initiative: 4 }) });
  near(r.blinded, (5 / 6) * (2 / 6));
  near(r.fleshWound + r.serious + r.outOfAction, 0);
});

test('Graviton Pulse wounds on a failed Strength check with no armour save (p163)', () => {
  const r = ranged({ skill: 2, weapon: weapon({ str: null, graviton: true, lethality: 2 }), target: target({ strength: 3, sv: 2 }) });
  const l2 = E.injuryPick(2, FACES);
  near(r.outOfAction, (5 / 6) * (3 / 6) * l2.ooa);
});

test('an unresolvable profile is reported rather than silently scoring zero', () => {
  const r = ranged({ weapon: weapon({ str: null }) });
  assert.equal(r.problems.length, 1);
  near(r.unharmed, 1);
});

function binom(n, k) {
  let r = 1;
  for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
  return r;
}
