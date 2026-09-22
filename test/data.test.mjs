/* Guards the transcribed Trading Post tables (p154-157) and the trait parser
   that turns the printed trait text into engine flags. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from './load.mjs';

const D = loadScript('data');
const find = (list, name) => {
  const p = list.find(x => x.name === name);
  assert.ok(p, `no profile named ${name}`);
  return p;
};

test('every profile is structurally sound', () => {
  for (const p of D.ranged.concat(D.melee)) {
    assert.ok(p.name && p.cat, `unnamed profile: ${JSON.stringify(p)}`);
    assert.ok(p.str === null || typeof p.str === 'number' || /^S(\+[123])?$/.test(p.str), `${p.name}: bad Str ${p.str}`);
    assert.ok(p.lethality === null || (p.lethality >= 1 && p.lethality <= 3), `${p.name}: bad Lethality`);
    assert.ok(p.ap <= 0 && p.ap >= -4, `${p.name}: bad AP ${p.ap}`);
    assert.equal(typeof p.traits.damage, 'number');
  }
});

test('no duplicate weapon names in either list', () => {
  for (const list of [D.ranged, D.melee]) {
    const names = list.map(p => p.name);
    assert.equal(new Set(names).size, names.length);
  }
});

test('spot checks against the printed tables', () => {
  const bolt = find(D.ranged, 'Boltgun');            // p154
  assert.deepEqual([bolt.sr, bolt.lr, bolt.str, bolt.ap, bolt.lethality], ['12"', '24"', 4, -1, 2]);
  assert.equal(bolt.traits.rapidFire, 1);

  const hb = find(D.ranged, 'Heavy bolter');         // p154
  assert.deepEqual([hb.str, hb.ap, hb.lethality, hb.traits.rapidFire, hb.traits.heavy], [5, -2, 2, 2, true]);

  const melta = find(D.ranged, 'Meltagun');          // p155
  assert.deepEqual([melta.str, melta.ap, melta.lethality, melta.traits.damage], [8, -4, 3, 3]);

  const flamer = find(D.ranged, 'Flamer');           // p154
  assert.deepEqual([flamer.sr, flamer.lr, flamer.traits.autoHit, flamer.traits.blaze], ['T', '-', true, 5]);

  const needle = find(D.ranged, 'Needle rifle');     // p156
  assert.deepEqual([needle.str, needle.ap, needle.traits.toxin], [null, -1, 3]);

  const web = find(D.ranged, 'Web gun');             // p156
  assert.deepEqual([web.str, web.lethality, web.traits.web, web.traits.autoHit], [5, null, true, true]);

  const grav = find(D.ranged, 'Grav gun');           // p154
  assert.deepEqual([grav.str, grav.lethality, grav.traits.graviton, grav.traits.blast], [null, 2, true, true]);

  const fist = find(D.melee, 'Power fist');          // p157
  assert.deepEqual([fist.str, fist.ap, fist.lethality, fist.traits.damage,
                    fist.traits.breaching, fist.traits.unwieldy], ['S+3', -3, 2, 2, 6, true]);

  const stiletto = find(D.melee, 'Stiletto sword');  // p157
  assert.deepEqual([stiletto.str, stiletto.ap, stiletto.traits.toxin, stiletto.traits.parry], [null, -1, 3, true]);

  const hammer = find(D.melee, 'Two-handed hammer'); // p157
  assert.deepEqual([hammer.str, hammer.lethality, hammer.traits.unwieldy], ['S+1', 3, true]);

  const hand = find(D.melee, 'Hand weapon');         // p74, for a fighter with nothing else
  assert.deepEqual([hand.str, hand.lethality, hand.traits.melee], ['S', 1, true]);
});

test('every shotgun and grenade launcher ammo type is listed separately', () => {
  for (const n of ['Combat shotgun - salvo ammo', 'Combat shotgun - shredder ammo',
                   'Sawn-off shotgun - scatter shot', 'Sawn-off shotgun - solid shot',
                   'Shotgun - scatter ammo', 'Shotgun - solid ammo',
                   'Grenade launcher - frag', 'Grenade launcher - krak',
                   'Grenade launcher - photon flash', 'Grenade launcher - smoke']) {
    find(D.ranged, n);
  }
  const shredder = find(D.ranged, 'Combat shotgun - shredder ammo');
  assert.equal(shredder.traits.shred, 6);
  assert.equal(shredder.traits.rapidFire, 1);
  assert.equal(shredder.traits.autoHit, true);
});

test('the melee list carries pistols, because Light weapons can be swung (p74)', () => {
  find(D.melee, 'Laspistol');
  find(D.melee, 'Plasma pistol');
  assert.equal(find(D.melee, 'Laspistol').traits.light, true);
  for (const p of D.ranged.filter(x => x.traits.light)) find(D.melee, p.name);
  for (const p of D.melee) assert.ok(p.traits.melee || p.traits.light, `${p.name} is neither Melee nor Light`);
});

test('the trait parser reads the printed forms', () => {
  const t = D.parseTraits('Ammo (3+), Blast (3"), Damage (2), Rapid Fire (2), Shred (6+), Toxin (4+), Template, Unwieldy');
  assert.equal(t.damage, 2);
  assert.equal(t.rapidFire, 2);
  assert.equal(t.shred, 6);
  assert.equal(t.toxin, 4);
  assert.equal(t.autoHit, true);
  assert.equal(t.unwieldy, true);
  assert.equal(t.blast, true);
  assert.equal(D.parseTraits('').damage, 1);        // no Damage (X) means one wound
  assert.equal(D.parseTraits('Melee').rapidFire, 0);
});

test('fighter profiles say which one is actually from the book', () => {
  const book = D.fighters.filter(f => f.book);
  assert.equal(book.length, 1);
  assert.match(book[0].name, /p50/);
  assert.deepEqual([book[0].ws, book[0].bs, book[0].S, book[0].T, book[0].W, book[0].I, book[0].A, book[0].sv],
                   [4, 4, 3, 3, 1, 4, 1, 6]);
  for (const f of D.fighters) {
    for (const k of ['ws', 'bs', 'S', 'T', 'W', 'I', 'A']) assert.ok(f[k] >= 1, `${f.name}.${k}`);
  }
});

test('the common fighter types carry the stats they were given', () => {
  const by = (name) => D.fighters.find(f => f.name === name);
  const core = (f) => [f.S, f.T, f.W, f.sv];
  assert.deepEqual(core(by('Ganger')), [3, 3, 1, 6]);
  assert.deepEqual(core(by('Champion')), [3, 3, 2, 5]);
  assert.deepEqual(core(by('Leader')), [3, 3, 3, 5]);
  assert.deepEqual(core(by('Brute')), [5, 4, 4, 4]);
});
