/* The price model must never say that more of a good thing costs less. Where a
   trait has ordered levels the encoding is meant to guarantee that; these tests
   check the guarantee actually holds on the real price list. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPricing, loadScript } from './load.mjs';

const P = loadPricing();
const D = loadScript('data');
const M = P.build();
const at = (m, name) => m.coefficients.find(c => c.name === name);

test('the model fits well enough to report', () => {
  assert.ok(M.ranged.n >= 40, `only ${M.ranged.n} ranged weapons`);
  assert.ok(M.ranged.r2 > 0.9, `ranged R2 ${M.ranged.r2.toFixed(3)}`);
  assert.ok(M.ranged.mae < 8, `ranged error ${M.ranged.mae.toFixed(1)}c`);
  assert.ok(M.melee.r2 > 0.9, `melee R2 ${M.melee.r2.toFixed(3)}`);
});

test('every coefficient says how many weapons carry it', () => {
  for (const m of [M.ranged, M.melee]) {
    for (const c of m.coefficients) {
      assert.equal(typeof c.weapons, 'number', `${c.name} has no support count`);
      assert.ok(c.weapons >= 0);
    }
  }
});

/* Each entry: the model, and a list of names ordered from cheapest to dearest. */
const ORDERINGS = [
  ['ranged', ['Lethality 2', 'Lethality 3']],
  ['ranged', ['Damage 2', 'Damage 3']],
  ['ranged', ['Blast (3″)', 'Blast (5″)']],
  ['ranged', ['Toxin (4+)', 'Toxin (3+)']],
  ['ranged', ['Knockback (6+)', 'Knockback (5+)']],
  ['melee',  ['Lethality 2', 'Lethality 3']],
  ['melee',  ['Breaching (6+)', 'Breaching (5+)']],
  ['melee',  ['Shock (6+)', 'Shock (5+)']],
  ['melee',  ['Concussive (6+)', 'Concussive (5+)']]
];

for (const [which, order] of ORDERINGS) {
  test(`${which}: ${order.join(' < ')}`, () => {
    const vals = order.map(n => {
      const c = at(M[which], n);
      assert.ok(c, `${which} model has no "${n}" — did a feature get renamed?`);
      return c.credits;
    });
    for (let i = 1; i < vals.length; i++) {
      assert.ok(vals[i] > vals[i - 1],
        `${order[i]} (${vals[i].toFixed(1)}c) should cost more than ${order[i - 1]} (${vals[i - 1].toFixed(1)}c)`);
    }
  });
}

test('a lower (X+) threshold always prices above a higher one', () => {
  // Guaranteed by fitting the trigger rate rather than a flag, so this holds for
  // any threshold, including ones the current price list does not happen to use.
  for (const trait of ['Toxin', 'Knockback', 'Breaching', 'Shock', 'Concussive', 'Blaze']) {
    for (const m of [M.ranged, M.melee]) {
      const rows = m.coefficients.filter(c => c.name.indexOf(trait + ' (') === 0);
      const byX = rows.map(c => ({ x: +c.name.match(/\((\d)\+\)/)[1], v: c.credits }))
                      .sort((a, b) => b.x - a.x);
      for (let i = 1; i < byX.length; i++) {
        assert.ok(byX[i].v > byX[i - 1].v,
          `${trait} (${byX[i].x}+) must cost more than (${byX[i - 1].x}+)`);
      }
    }
  }
});

test('Blast is priced by the ground it covers', () => {
  const three = at(M.ranged, 'Blast (3″)'), five = at(M.ranged, 'Blast (5″)');
  const ratio = five.credits / three.credits;
  assert.ok(Math.abs(ratio - (25 / 9)) < 0.01,
    `5" should be (5/3)^2 = 2.78x the 3" marker, got ${ratio.toFixed(2)}x`);
});

test('Breaching and Shock are priced separately', () => {
  const names = M.melee.coefficients.map(c => c.name);
  assert.ok(!names.some(n => /Breaching \/ Shock/.test(n)));
  assert.ok(names.some(n => n.indexOf('Breaching (') === 0));
  assert.ok(names.some(n => n.indexOf('Shock (') === 0));
});

test('every priced weapon is scored, and nothing is NaN', () => {
  for (const m of [M.ranged, M.melee]) {
    for (const c of m.coefficients) assert.ok(Number.isFinite(c.credits), `${c.name} is ${c.credits}`);
    for (const r of m.residuals) {
      assert.ok(Number.isFinite(r.model), `${r.name} scored ${r.model}`);
      assert.equal(r.cost, D.costs[r.name]);
    }
  }
});

test('both a flat-rate and a multiplier fit are produced and compared in credits', () => {
  for (const m of [M.ranged, M.melee]) {
    assert.ok(Number.isFinite(m.additiveError) && m.additiveError > 0);
    assert.ok(Number.isFinite(m.multiplicativeError) && m.multiplicativeError > 0);
    assert.ok(['additive', 'multiplicative'].includes(m.better));
    // Whichever is reported as better must actually be the better of the two.
    const lower = m.multiplicativeError < m.additiveError ? 'multiplicative' : 'additive';
    assert.equal(m.better, lower);
    for (const c of m.coefficients) {
      assert.ok(Number.isFinite(c.factor) && c.factor > 0, `${c.name} factor ${c.factor}`);
    }
  }
});

test('Rapid Fire is an ordered level like the other counts', () => {
  const one = at(M.ranged, 'Rapid Fire 1'), two = at(M.ranged, 'Rapid Fire 2');
  assert.ok(one && two, 'both Rapid Fire levels should be listed');
  assert.ok(two.credits > one.credits,
    `Rapid Fire 2 (${two.credits.toFixed(1)}c) should cost more than 1 (${one.credits.toFixed(1)}c)`);
});

/* The rules already say which way each of these cuts, so the fit must not
   contradict them however the prices happen to fall. */
const DRAWBACKS = ['Ammo, chance of running dry', 'Unstable', 'Heavy', 'Unwieldy',
                   'Limited', 'Single Shot', 'Scarce'];
const BENEFITS = ['Strength', 'Strength over S', 'AP, per point', 'Template', 'Parry',
                  'Lethality 2', 'Lethality 3', 'Damage 2', 'Damage 3',
                  'Rapid Fire 1', 'Rapid Fire 2', 'Blast (3″)', 'Blast (5″)',
                  'Short range, per inch', 'Long range, per inch'];

test('no drawback is priced as a premium', () => {
  for (const m of [M.ranged, M.melee]) {
    for (const c of m.coefficients) {
      if (DRAWBACKS.includes(c.name)) {
        assert.ok(c.credits <= 1e-9,
          `${c.name} is a drawback but prices at +${c.credits.toFixed(1)}c`);
      }
    }
  }
});

test('no advantage is priced as a discount', () => {
  for (const m of [M.ranged, M.melee]) {
    for (const c of m.coefficients) {
      if (BENEFITS.includes(c.name) || /^(Toxin|Knockback|Breaching|Shock|Concussive|Blaze) \(/.test(c.name)) {
        assert.ok(c.credits >= -1e-9,
          `${c.name} is an advantage but prices at ${c.credits.toFixed(1)}c`);
      }
    }
  }
});

test('a coefficient held at its boundary is marked as such', () => {
  const unwieldy = at(M.melee, 'Unwieldy');
  assert.ok(unwieldy, 'Unwieldy should still be listed');
  assert.equal(unwieldy.pinned, true, 'Unwieldy should be reported as held at 0');
  assert.ok(Math.abs(unwieldy.credits) < 1e-9);
});
