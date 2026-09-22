/* An independent, deliberately naive dice simulator written straight from the
   rules text. It shares no code with the engine; it exists to catch mistakes
   in the exact maths on trait combinations that are awkward to work out by
   hand. Tolerances are set for 2,000,000 trials per case. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from './load.mjs';

const E = loadScript('engine');
const FACES = { ooa: 1, si: 2, inj: 3 };
const TRIALS = 2_000_000;
const TOL = 0.0035;

/* A tiny deterministic PRNG keeps failures reproducible. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function makeSim(rand) {
  const d6 = () => 1 + Math.floor(rand() * 6);
  const injuryDie = () => {            // 1 Out of Action, 2 Serious, 3 Injured
    const f = d6();
    return f === 1 ? 3 : (f <= 3 ? 2 : 1);
  };
  const firepowerDie = () => [1, 2, 3, 1][Math.floor(rand() * 4)];

  function woundTarget(S, T) {
    if (S >= 2 * T) return 2;
    if (S > T) return 3;
    if (S === T) return 4;
    if (2 * S <= T) return 6;
    return 5;
  }

  /* state: {w, cond} with cond 0 none, 1 injured, 2 serious, 3 out of action */
  function resolveHit(st, w, t, autoWound, blazeAllowed) {
    if (st.cond === 3) return st;

    if (w.flash) {
      if (d6() > t.initiative) st = { ...st, blind: true };
      return st;
    }

    let wounded, natural = 0;
    if (w.graviton) {
      wounded = d6() > t.strength;
      if (wounded && t.inv && d6() >= Math.max(3, t.inv)) wounded = false;
      if (!wounded) return st;
      return damage(st, w.damage, w.lethality);
    }

    natural = autoWound ? 6 : d6();
    let target;
    if (w.toxin) target = t.isVehicle ? 6 : w.toxin;
    else target = woundTarget(w.str, t.T);
    wounded = autoWound || natural >= target;

    const blaze = w.blaze && natural >= w.blaze;
    let out = st;

    if (wounded) {
      const rending = w.rending && natural >= w.rending;
      const shred = w.shred && natural >= w.shred;
      const breaching = w.breaching && natural >= w.breaching;
      let inv = t.inv;
      if (w.gas && t.respirator) inv = inv ? Math.min(inv, 5) : 5;
      const armourAllowed = !w.gas && !w.web && !breaching;
      const armourNeed = t.sv ? Math.max(3, t.sv - (w.ap + (rending ? -1 : 0) + t.saveMods)) : 99;
      const invNeed = inv ? Math.max(3, inv) : 99;
      const need = Math.min(armourAllowed ? armourNeed : 99, invNeed);
      const saved = need <= 6 && d6() >= need;
      if (!saved) {
        if (w.web) out = { ...st, web: true };
        else out = damage(st, w.damage, w.lethality + (shred ? 1 : 0));
      }
    }
    if (blaze && blazeAllowed) out = resolveHit(out, w, t, false, false);
    return out;
  }

  function damage(st, dmg, L) {
    const nw = Math.max(0, st.w - dmg);
    if (nw > 0) return { ...st, w: nw };
    let best = 1;                                   // worst case for the attacker
    for (let i = 0; i < Math.max(1, L); i++) best = Math.max(best, L <= 0 ? 1 : injuryDie());
    let cond = st.cond;
    if (best === 3) cond = 3;
    else if (best === 2) cond = Math.max(cond, 2);
    else cond = Math.max(cond, 1);
    return { ...st, w: 0, cond };
  }

  return { d6, firepowerDie, resolveHit };
}

function simulateRanged(cfg, trials, seed) {
  const rand = rng(seed);
  const sim = makeSim(rand);
  const tally = { fleshWound: 0, serious: 0, outOfAction: 0, wounded: 0, unharmed: 0, webbed: 0, blinded: 0 };
  const w = cfg.weapon, t = cfg.target;
  const start = t.status === 'seriously' ? { w: 0, cond: 2 } : (t.status === 'injured' ? { w: 0, cond: 1 } : { w: t.W, cond: 0 });
  const mod = cfg.hitMod + (t.status === 'seriously' ? -1 : 0);

  for (let i = 0; i < trials; i++) {
    let st = { ...start };
    let hits = 0, shock = false;
    if (w.autoHit) { hits = 1; }
    else {
      const f = sim.d6();
      if (f === 6 || (f !== 1 && f + mod >= cfg.skill)) { hits = 1; shock = w.shock && f >= w.shock; }
    }
    if (hits) {
      let n = 1;
      if (w.rapidFire > 0) { n = 0; for (let k = 0; k < w.rapidFire; k++) n += sim.firepowerDie(); }
      for (let k = 0; k < n; k++) st = sim.resolveHit(st, w, t, !!shock, true);
    }
    record(tally, st, start);
  }
  for (const k of Object.keys(tally)) tally[k] /= trials;
  return tally;
}

function simulateMelee(cfg, trials, seed) {
  const rand = rng(seed);
  const sim = makeSim(rand);
  const tally = { fleshWound: 0, serious: 0, outOfAction: 0, wounded: 0, unharmed: 0, webbed: 0, blinded: 0 };
  const t = cfg.target;
  const start = t.status === 'seriously' ? { w: 0, cond: 2 } : (t.status === 'injured' ? { w: 0, cond: 1 } : { w: t.W, cond: 0 });

  for (let i = 0; i < trials; i++) {
    let st = { ...start };
    for (const entry of cfg.weapons) {
      const w = entry.weapon;
      for (let a = 0; a < entry.attacks; a++) {
        if (w.autoHit) { st = sim.resolveHit(st, w, t, false, true); continue; }
        const f = sim.d6();
        if (f === 6 || (f !== 1 && f + entry.hitMod >= entry.skill)) {
          st = sim.resolveHit(st, w, t, !!(w.shock && f >= w.shock), true);
        }
      }
    }
    record(tally, st, start);
  }
  for (const k of Object.keys(tally)) tally[k] /= trials;
  return tally;
}

function record(tally, st, start) {
  if (st.web) tally.webbed++;
  if (st.blind) tally.blinded++;
  if (st.cond === 3) tally.outOfAction++;
  else if (st.cond === 2) tally.serious++;
  else if (st.cond === 1) tally.fleshWound++;
  else if (st.w < start.w) tally.wounded++;
  else tally.unharmed++;
}

function weapon(o = {}) {
  return Object.assign({
    str: 4, ap: 0, lethality: 1, damage: 1, rapidFire: 0,
    toxin: 0, rending: 0, shred: 0, breaching: 0, shock: 0, blaze: 0,
    gas: false, web: false, flash: false, graviton: false, autoHit: false, unstable: false
  }, o);
}
function target(o = {}) {
  return Object.assign({
    T: 3, W: 1, sv: 0, inv: 0, saveMods: 0, status: 'active',
    isVehicle: false, initiative: 4, strength: 3, respirator: false
  }, o);
}

const RANGED_CASES = [
  ['boltgun at a ganger', { skill: 4, hitMod: 0, weapon: weapon({ str: 4, ap: -1, lethality: 2, rapidFire: 1 }), target: target({ T: 3, W: 1, sv: 5 }) }],
  ['heavy bolter, rapid fire 2, into cover', { skill: 3, hitMod: -1, weapon: weapon({ str: 5, ap: -2, lethality: 2, rapidFire: 2 }), target: target({ T: 4, W: 2, sv: 4, saveMods: 2 }) }],
  ['meltagun, Damage (3), into a refractor field', { skill: 4, hitMod: 0, weapon: weapon({ str: 8, ap: -4, lethality: 3, damage: 3 }), target: target({ T: 5, W: 3, sv: 4, inv: 5 }) }],
  ['flamer: template auto-hit with Blaze (5+)', { skill: 6, hitMod: 0, weapon: weapon({ str: 4, ap: -1, lethality: 1, autoHit: true, blaze: 5 }), target: target({ T: 3, W: 2, sv: 5 }) }],
  ['combat shotgun shredder: template, rapid fire, Shred (6+)', { skill: 4, hitMod: 0, weapon: weapon({ str: 3, lethality: 1, rapidFire: 1, shred: 6, autoHit: true }), target: target({ T: 3, W: 1, sv: 6 }) }],
  ['needle rifle: Toxin (3+) against a tough target', { skill: 4, hitMod: 0, weapon: weapon({ str: null, ap: -1, lethality: 1, toxin: 3 }), target: target({ T: 6, W: 2, sv: 4 }) }],
  ['choke gas grenade: Gas plus Toxin against a respirator', { skill: 4, hitMod: -1, weapon: weapon({ str: null, lethality: 1, toxin: 3, gas: true }), target: target({ T: 4, W: 1, sv: 4, respirator: true }) }],
  ['grav gun against a strong target', { skill: 4, hitMod: 0, weapon: weapon({ str: null, lethality: 2, graviton: true }), target: target({ strength: 4, W: 2, sv: 3 }) }],
  ['web gun against an invulnerable save', { skill: 4, hitMod: 0, weapon: weapon({ str: 5, lethality: 0, web: true, autoHit: true }), target: target({ T: 3, sv: 4, inv: 5 }) }],
  ['photon flash grenade', { skill: 4, hitMod: 0, weapon: weapon({ str: null, flash: true }), target: target({ initiative: 3 }) }],
  ['rapid fire 2 into an already Seriously Injured target', { skill: 3, hitMod: 0, weapon: weapon({ str: 4, ap: -1, lethality: 2, rapidFire: 2 }), target: target({ T: 3, sv: 5, status: 'seriously' }) }],
  ['plasma gun, Damage (2), Lethality 2, W3 target', { skill: 4, hitMod: 0, weapon: weapon({ str: 5, ap: -2, lethality: 2, damage: 2, rapidFire: 1 }), target: target({ T: 4, W: 3, sv: 4, inv: 5 }) }]
];

const MELEE_CASES = [
  ['chainsword, three attacks on the charge', {
    weapons: [{ weapon: weapon({ str: 3, lethality: 1, shred: 5 }), attacks: 3, skill: 3, hitMod: 0 }],
    target: target({ T: 3, W: 1, sv: 5, saveMods: 1 })
  }],
  ['power fist plus a laspistol secondary', {
    weapons: [
      { weapon: weapon({ str: 6, ap: -3, lethality: 2, damage: 2, breaching: 6 }), attacks: 2, skill: 4, hitMod: 0 },
      { weapon: weapon({ str: 3, lethality: 1 }), attacks: 1, skill: 4, hitMod: 0 }
    ],
    target: target({ T: 4, W: 2, sv: 4, inv: 5 })
  }],
  ['shock stave with Shock (5+) against a heavy save', {
    weapons: [{ weapon: weapon({ str: 4, lethality: 1, shock: 5 }), attacks: 3, skill: 4, hitMod: -1 }],
    target: target({ T: 5, W: 2, sv: 3, saveMods: 1 })
  }],
  ['stiletto knife: Toxin (3+), four attacks', {
    weapons: [{ weapon: weapon({ str: null, lethality: 1, toxin: 3 }), attacks: 4, skill: 3, hitMod: 1 }],
    target: target({ T: 3, W: 2, sv: 4 })
  }],
  ['everything at once: Shock, Shred, Rending, Blaze, Damage 2', {
    weapons: [{ weapon: weapon({ str: 5, ap: -1, lethality: 2, damage: 2, shock: 6, shred: 5, rending: 4, blaze: 4 }), attacks: 3, skill: 4, hitMod: 0 }],
    target: target({ T: 4, W: 3, sv: 4, inv: 6 })
  }]
];

for (const [name, cfg] of RANGED_CASES) {
  test(`monte carlo, ranged: ${name}`, () => {
    const exact = E.computeRanged({ ...cfg, faces: FACES });
    const sim = simulateRanged(cfg, TRIALS, 0x9e3779b9);
    compare(name, exact, sim);
  });
}

for (const [name, cfg] of MELEE_CASES) {
  test(`monte carlo, melee: ${name}`, () => {
    const exact = E.computeMelee({ ...cfg, faces: FACES });
    const sim = simulateMelee(cfg, TRIALS, 0x85ebca6b);
    compare(name, exact, sim);
  });
}

function compare(name, exact, sim) {
  for (const k of ['fleshWound', 'serious', 'outOfAction', 'wounded', 'unharmed', 'webbed', 'blinded']) {
    assert.ok(Math.abs(exact[k] - sim[k]) < TOL,
      `${name}: ${k} exact ${exact[k].toFixed(5)} vs simulated ${sim[k].toFixed(5)}`);
  }
}
