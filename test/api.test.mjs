/* The supported surface. These tests are the contract: if one fails, a
   consumer downstream breaks, so change them only deliberately. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApi } from './load.mjs';

const N = loadApi();
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !== ${b}`);
const sums = (r) => r.unharmed + r.wounded + r.fleshWound + r.serious + r.outOfAction;

test('the surface is what it claims to be', () => {
  assert.match(N.version, /^\d+\.\d+\.\d+$/);
  for (const fn of ['shoot', 'fight', 'survive', 'catalogue', 'priceModel', 'valueOf']) {
    assert.equal(typeof N[fn], 'function', `${fn} should be callable`);
  }
  assert.ok(Array.isArray(N.gangs) && N.gangs.length >= 5);
});

test('a weapon can be named or spelled out, and both agree', () => {
  const byName = N.shoot({ bs: 4, weapon: 'Boltgun', target: 'Ganger' });
  const spelled = N.shoot({ bs: 4, target: { T: 3, W: 1, sv: 6 },
    weapon: { str: 4, ap: -1, lethality: 2, rapidFire: 1 } });
  near(byName.outOfAction, spelled.outOfAction);
  near(sums(byName), 1);
});

test('outcomes always account for the whole probability', () => {
  for (const r of [
    N.shoot({ bs: 3, weapon: 'Meltagun', target: 'Brute' }),
    N.fight({ ws: 3, strength: 4, weapon: 'Power fist', attacks: 3, target: 'Leader' }),
    N.shoot({ bs: 5, weapon: 'Frag grenades', target: 'Ganger' })
  ]) near(sums(r), 1, 1e-9);
});

test('a wielder-Strength weapon needs the attacker Strength, and says so', () => {
  assert.throws(() => N.fight({ ws: 3, weapon: 'Power sword', attacks: 1, target: 'Ganger' }),
    /Strength/);
  // Against a single-wound target, so one attack can actually finish it —
  // a Brute has four wounds and a Lethality 1 weapon never gets there.
  const tough = { T: 4, W: 1, sv: 4 };
  const weak = N.fight({ ws: 3, strength: 3, weapon: 'Power sword', attacks: 1, target: tough });
  const strong = N.fight({ ws: 3, strength: 6, weapon: 'Power sword', attacks: 1, target: tough });
  assert.ok(strong.outOfAction > weak.outOfAction,
    `S3 gave ${weak.outOfAction}, S6 gave ${strong.outOfAction}`);
});

test('survive() threads each attack into the next', () => {
  const target = 'Champion';
  const one = N.survive({ target, attacks: [{ bs: 4, weapon: 'Boltgun' }] });
  const two = N.survive({ target, attacks: [{ bs: 4, weapon: 'Boltgun' }, { bs: 4, weapon: 'Boltgun' }] });
  const three = N.survive({ target, attacks: Array.from({ length: 3 }, () => ({ bs: 4, weapon: 'Boltgun' })) });

  // A second shot must raise the risk and cut the chance of coming through clean.
  assert.ok(two.outOfAction > one.outOfAction, 'two shots should be deadlier than one');
  assert.ok(three.outOfAction > two.outOfAction, 'three deadlier than two');
  assert.ok(two.unharmed < one.unharmed, 'and less likely to leave them untouched');
  near(one.outOfAction, N.shoot({ bs: 4, weapon: 'Boltgun', target }).outOfAction);
  near(one.survives, 1 - one.outOfAction);
  for (const r of [one, two, three]) near(sums(r), 1);
});

test('survive() mixes shooting and close combat', () => {
  const r = N.survive({ target: 'Champion', attacks: [
    { bs: 4, weapon: 'Boltgun' },
    { ws: 4, strength: 3, weapon: 'Chainsword', attacks: 2 }
  ]});
  near(sums(r), 1);
  assert.ok(r.outOfAction > 0 && r.outOfAction < 1);
});

test('gang material stays behind the gang option', () => {
  assert.throws(() => N.shoot({ bs: 4, weapon: 'Storm welder', target: 'Ganger' }), /gang/i);
  const ok = N.shoot({ bs: 4, weapon: 'Storm welder', target: 'Ganger', gang: true });
  near(sums(ok), 1);
  const goliathOnly = N.catalogue({ gang: 'Goliath' });
  assert.ok(goliathOnly.ranged.some(w => w.name === 'Storm welder'));
  assert.ok(!goliathOnly.ranged.some(w => w.name === 'Flechette pistol'), 'that one is Delaque');
});

test('the catalogue carries what a list builder needs', () => {
  const c = N.catalogue();
  const bolt = c.ranged.find(w => w.name === 'Boltgun');
  assert.equal(bolt.credits, 55);
  assert.equal(bolt.tradePoints, 2);
  assert.equal(bolt.kind, 'ranged');
  assert.match(bolt.traits, /Rapid Fire/);
  const sister = c.fighters.find(f => f.fromBook);
  assert.ok(sister && sister.T === 3 && sister.sv === 6);
  // Everything is priced except the notional hand weapon, which is free.
  const unpriced = c.ranged.concat(c.melee).filter(w => w.credits === null);
  assert.deepEqual(unpriced.map(w => w.name), ['Hand weapon']);
});

test('the price model is reported with its own error bars', () => {
  const m = N.priceModel();
  assert.ok(m.ranged.weaponsFitted >= 40);
  assert.ok(m.ranged.meanErrorCredits > 0 && m.ranged.meanErrorCredits < 10);
  assert.equal(m.ranged.shape, 'flat rates');
  const tpl = m.ranged.coefficients.find(c => c.feature === 'Template');
  assert.ok(tpl.credits > 0 && tpl.weaponsCarrying > 0);
  const melta = N.valueOf('Meltagun');
  assert.equal(melta.credits, 140);
  near(melta.difference, melta.credits - melta.modelSays, 1e-6);
});

test('a bad call fails loudly rather than returning nonsense', () => {
  assert.throws(() => N.shoot({ bs: 4, target: 'Ganger' }), /weapon/);
  assert.throws(() => N.shoot({ weapon: 'Boltgun', target: 'Ganger' }), /bs/);
  assert.throws(() => N.shoot({ bs: 4, weapon: 'Not A Gun', target: 'Ganger' }), /no weapon/);
  assert.throws(() => N.shoot({ bs: 4, weapon: 'Boltgun', target: 'Nobody' }), /no fighter/);
  assert.throws(() => N.survive({ target: 'Ganger' }), /attacks/);
});
