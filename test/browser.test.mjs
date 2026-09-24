/* Loads the single file in a real browser over file:// — the way it will
   actually be used — and checks that the page computes, reacts to every
   change without a submit button, and that the profile pickers only fill
   fields in. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

/* These tests need Playwright and a Chromium build. Where neither is present
   they skip rather than fail, so `npm test` still works on a bare checkout. */
let chromium = null, skip = false;
try {
  ({ chromium } = await import('playwright'));
} catch {
  skip = 'playwright is not installed - run `npm install`';
}

/* Fall back to a Chromium already on the machine when the build Playwright
   expects is not the one that is installed. */
const PREINSTALLED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOpts = fs.existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {};

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = 'file://' + path.join(root, 'index.html');

let browser, page, errors;
test.before(async () => {
  if (skip) return;
  try {
    browser = await chromium.launch(launchOpts);
  } catch (e) {
    skip = 'no Chromium available - run `npx playwright install chromium`';
    return;
  }
  page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
});
test.after(async () => { if (browser) await browser.close(); });

/* A thin wrapper so a missing browser skips the body instead of throwing. */
const t = (name, fn) => test(name, async (ctx) => {
  if (skip) { ctx.skip(skip); return; }
  await fn(ctx);
});

const odds = async (panel) => {
  const vals = await page.$$eval(`#${panel} .odd .v`, ns => ns.map(n => n.textContent));
  return { flesh: vals[0], serious: vals[1], ooa: vals[2] };
};
const setSel = (panel, bind, value) =>
  page.selectOption(`#${panel} [data-bind="${bind}"]`, String(value));
const check = (panel, bind, on) =>
  page.setChecked(`#${panel} [data-bind="${bind}"]`, on);

t('the page loads and computes without errors', async () => {
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(await page.title(), 'Necromunda (N26) Attack Simulator');
  const o = await odds('panel-ranged');
  assert.match(o.flesh, /%$/);
  assert.match(o.ooa, /%$/);
});

t('the default ranged shot matches the hand-worked figure', async () => {
  // BS 4+, Str 4 vs T3, Sv 6+, W1, Lethality 1: 3/6 x 4/6 x 5/6 unsaved, then
  // one Injury dice - 1-2 Flesh Wound, 3-5 Seriously Injured, 6 Out of Action.
  const o = await odds('panel-ranged');
  assert.equal(o.flesh, '9.3%');
  assert.equal(o.serious, '13.9%');
  assert.equal(o.ooa, '4.6%');
});

t('every change recomputes on the spot, with no submit button', async () => {
  assert.equal(await page.$('#panel-ranged button[type=submit]'), null);
  const before = await odds('panel-ranged');
  await setSel('panel-ranged', 'a.skill', 2);
  const after = await odds('panel-ranged');
  assert.notDeepEqual(before, after);
  await setSel('panel-ranged', 'a.skill', 4);
  assert.deepEqual(await odds('panel-ranged'), before);
});

t('picking a weapon fills the fields, which stay editable', async () => {
  await setSel('panel-ranged', 'pick.weapon', 'Boltgun');
  assert.equal(await page.inputValue('#panel-ranged [data-bind="w1.str"]'), '4');
  assert.equal(await page.inputValue('#panel-ranged [data-bind="w1.ap"]'), '-1');
  assert.equal(await page.inputValue('#panel-ranged [data-bind="w1.lethality"]'), '2');
  assert.equal(await page.inputValue('#panel-ranged [data-bind="w1.rapidFire"]'), '1');
  const filled = await odds('panel-ranged');

  // Editing a filled-in field is respected rather than snapped back.
  await setSel('panel-ranged', 'w1.str', 8);
  const edited = await odds('panel-ranged');
  assert.notDeepEqual(filled, edited);
  assert.equal(await page.inputValue('#panel-ranged [data-bind="w1.str"]'), '8');
  assert.equal(await page.inputValue('#panel-ranged [data-bind="pick.weapon"]'), 'Boltgun');
});

t('a template weapon reports that hit modifiers no longer apply', async () => {
  await setSel('panel-ranged', 'pick.weapon', 'Flamer');
  assert.equal(await page.isChecked('#panel-ranged [data-bind="w1.autoHit"]'), true);
  assert.equal(await page.inputValue('#panel-ranged [data-bind="w1.blaze"]'), '5');
  const warn = await page.textContent('#panel-ranged [data-notes]');
  assert.match(warn, /hit automatically/);
  assert.match(warn, /Not part of this calculation: Ammo \(6\+\)/);
});

t('an out-of-action-only outcome is reachable and totals stay sane', async () => {
  await setSel('panel-ranged', 'pick.weapon', 'Meltagun');
  await setSel('panel-ranged', 'a.skill', 2);
  await setSel('panel-ranged', 't.sv', 0);
  const o = await odds('panel-ranged');
  const nums = [o.flesh, o.serious, o.ooa].map(v => parseFloat(v));
  assert.ok(nums.every(n => n >= 0 && n <= 100));
  assert.ok(nums[2] > 20, 'a meltagun at BS2+ against an unarmoured target should often kill');
});

t('the melee tab switches in and works on its own', async () => {
  await page.click('#tab-melee');
  assert.equal(await page.isVisible('#panel-melee'), true);
  assert.equal(await page.isVisible('#panel-ranged'), false);
  const o = await odds('panel-melee');
  assert.match(o.ooa, /%$/);
});

t('melee: charging adds an attack dice and raises the odds', async () => {
  await setSel('panel-melee', 'pick.weapon', 'Chainsword');
  await setSel('panel-melee', 'a.A', 2);
  const before = await odds('panel-melee');
  await check('panel-melee', 'a.charge', true);
  const after = await odds('panel-melee');
  assert.ok(parseFloat(after.ooa) > parseFloat(before.ooa));
  assert.match(await page.textContent('#panel-melee [data-notes]'), /Attack dice: 3/);
});

t('melee: the secondary weapon panel appears only when it is in use', async () => {
  assert.equal(await page.isVisible('#panel-melee [data-only="secondary"]'), false);
  await check('panel-melee', 'a.useSecondary', true);
  assert.equal(await page.isVisible('#panel-melee [data-only="secondary"]'), true);
  assert.match(await page.textContent('#panel-melee [data-notes]'), /1 with the secondary/);
  await check('panel-melee', 'a.useSecondary', false);
  assert.equal(await page.isVisible('#panel-melee [data-only="secondary"]'), false);
});

t('melee: a wielder-Strength weapon tracks the fighter Strength', async () => {
  await setSel('panel-melee', 'pick.weapon', 'Power fist');
  assert.equal(await page.inputValue('#panel-melee [data-bind="w1.str"]'), 'S+3');
  await setSel('panel-melee', 't.T', 6);   // tough enough that S+3 still has work to do
  await setSel('panel-melee', 'a.S', 3);
  const weak = await odds('panel-melee');
  await setSel('panel-melee', 'a.S', 6);
  const strong = await odds('panel-melee');
  assert.ok(parseFloat(strong.ooa) > parseFloat(weak.ooa),
    `S3 gave ${weak.ooa}, S6 gave ${strong.ooa}`);
  await setSel('panel-melee', 't.T', 3);
});

t('a Light weapon is held to a single attack however many dice there are', async () => {
  await setSel('panel-melee', 'pick.weapon', 'Laspistol');
  await setSel('panel-melee', 'a.A', 4);
  const warn = await page.textContent('#panel-melee [data-notes]');
  assert.match(warn, /Attack dice: 1 with the primary/);
  assert.match(warn, /only one attack/);
});

t('nothing on the page reaches the network or storage', async () => {
  const src = await page.content();
  assert.equal(/<script[^>]+src=/.test(src), false);
  assert.equal(/<link[^>]+href="http/.test(src), false);
  const used = await page.evaluate(() => {
    try { return localStorage.length + sessionStorage.length; } catch (e) { return -1; }
  });
  assert.ok(used <= 0);
});

t('it lays out on a phone without sideways scrolling', async () => {
  await page.setViewportSize({ width: 320, height: 640 });
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `overflows by ${overflow}px`);
  await page.setViewportSize({ width: 390, height: 780 });
});

t('no console or page errors were raised throughout', () => {
  assert.equal(errors.length, 0, errors.join('\n'));
});

t('the unmodelled-trait note covers the secondary weapon too', async () => {
  await page.click('#tab-melee');
  await setSel('panel-melee', 'pick.weapon', 'Power fist');
  await setSel('panel-melee', 'pick.weapon2', 'Plasma pistol');
  const notes = await page.textContent('#panel-melee [data-notes]');
  assert.match(notes, /Concussive \(5\+\)/);   // from the power fist
  assert.match(notes, /Ammo \(6\+\)/);         // from the plasma pistol
  assert.match(notes, /Unstable: on a natural 1/);
  await check('panel-melee', 'a.useSecondary', false);
  assert.doesNotMatch(await page.textContent('#panel-melee [data-notes]'), /Ammo \(6\+\)/);
});


t('a Blast weapon scatters, and says so in as many words', async () => {
  await page.click('#tab-ranged');
  await setSel('panel-ranged', 'pick.weapon', 'Frag grenades');
  assert.equal(await page.isChecked('#panel-ranged [data-bind="w1.blast"]'), true);

  const notes = await page.textContent('#panel-ranged [data-notes]');
  assert.match(notes, /scatter of 1" or 2" is counted as a hit/);
  assert.match(notes, /misfire/);
  assert.doesNotMatch(notes, /Not part of this calculation:.*Blast/);

  const withScatter = await odds('panel-ranged');
  await check('panel-ranged', 'w1.blast', false);
  const without = await odds('panel-ranged');
  assert.ok(parseFloat(withScatter.ooa) > parseFloat(without.ooa),
    'counting 1-2" scatters should make a blast weapon deadlier');
  assert.doesNotMatch(await page.textContent('#panel-ranged [data-notes]'), /scatter of 1"/);
});

t('Unstable in the Ballistic Skill list resolves the hit on the firer', async () => {
  await page.click('#tab-ranged');
  await setSel('panel-ranged', 'pick.weapon', 'Plasma gun');
  assert.equal(await page.inputValue('#panel-ranged [data-bind="w1.rapidFire"]'), '1');

  // Before switching, the weapon's note points at the self-hit mode.
  assert.match(await page.textContent('#panel-ranged [data-notes]'),
    /Pick .*Unstable.* in the Ballistic Skill list/);

  await setSel('panel-ranged', 'a.skill', 'unstable');
  const notes = await page.textContent('#panel-ranged [data-notes]');
  assert.match(notes, /one confirmed hit, with no hit roll and no Firepower dice/);
  assert.match(notes, /across all shots fired/);
  assert.doesNotMatch(notes, /Rapid Fire \(1\): assumes/);   // firepower is off for the self-hit
  assert.doesNotMatch(notes, /Template: the target is hit automatically/);
  // Unstable is the calculation here, so it is not listed as left out of it.
  assert.match(notes, /Not part of this calculation: Ammo \(6\+\)\./);

  // Exactly one hit, and it is certain.
  const minor = await page.textContent('#panel-ranged [data-minor]');
  assert.match(minor, /At least one hit\s*100\.0%/);
  assert.match(minor, /Expected hits\s*1\.00/);
  assert.doesNotMatch(minor, /by scatter/);

  // Rapid Fire stays on the weapon, so switching back restores the normal shot.
  await setSel('panel-ranged', 'a.skill', 4);
  assert.match(await page.textContent('#panel-ranged [data-minor]'), /Expected hits\s*0\.8/);
});

t('the Value tab prices each stat from the Trading Post', async () => {
  await page.click('#tab-value');
  assert.equal(await page.isVisible('#panel-value'), true);
  assert.equal(await page.isVisible('#panel-ranged'), false);

  const text = await page.textContent('#panel-value');
  assert.match(text, /Template/);
  assert.match(text, /AP, per point/);
  assert.match(text, /Lethality/);
  assert.match(text, /Rapid Fire, per die/);
  assert.match(text, /Explains 9\d\.\d% of the price/);

  // Light and Limited are the two discounts that survive; they must read negative.
  const rows = await page.$$eval('#panel-value table.val tr', trs => trs.map(tr =>
    [...tr.children].map(td => td.textContent)));
  const light = rows.find(r => r[0] === 'Light');
  assert.ok(light && light[1].startsWith('−'), `Light read ${light && light[1]}`);

  // The confounding caveat must be stated, not buried.
  assert.match(text, /do not come out as discounts/);
  assert.match(text, /45% of a weapon/);
});

t('multi-profile purchases are kept out of the standout lists', async () => {
  const names = await page.$$eval('#panel-value table.val td:first-child',
    tds => tds.map(td => td.textContent));
  for (const n of names) {
    assert.doesNotMatch(n, /^Grenade launcher/, 'grenade launcher rounds should be held out');
    assert.doesNotMatch(n, /^Combat shotgun/, 'shotgun ammo types should be held out');
  }
});

t('all three tabs still switch cleanly', async () => {
  for (const [tab, panel] of [['tab-ranged', 'panel-ranged'], ['tab-melee', 'panel-melee'],
                              ['tab-value', 'panel-value']]) {
    await page.click('#' + tab);
    assert.equal(await page.isVisible('#' + panel), true);
    assert.equal(await page.getAttribute('#' + tab, 'aria-selected'), 'true');
  }
  await page.click('#tab-ranged');
});

t('(X+) traits are priced per threshold, not as a flag', async () => {
  await page.click('#tab-value');
  const rows = await page.$$eval('#panel-value table.val tr', trs => trs.map(tr =>
    [...tr.children].map(td => td.textContent)));
  const find = (n) => rows.find(r => r[0] === n);

  // The panel must show each threshold, in the right order. The exact ratio is
  // checked in pricing.test.mjs, where figures are not rounded for display.
  const val = (c) => parseFloat(c.replace('−', '-').replace('+', ''));
  for (const [low, high] of [['Breaching (6+)', 'Breaching (5+)'],
                             ['Shock (6+)', 'Shock (5+)'],
                             ['Toxin (4+)', 'Toxin (3+)'],
                             ['Blast (3″)', 'Blast (5″)'],
                             ['Lethality 2', 'Lethality 3'],
                             ['Damage 2', 'Damage 3']]) {
    const a = find(low), b = find(high);
    assert.ok(a && b, `both ${low} and ${high} should be listed`);
    assert.ok(val(b[1]) > val(a[1]), `${high} ${b[1]} should cost more than ${low} ${a[1]}`);
  }

  assert.ok(!find('Breaching / Shock'), 'Breaching and Shock must not be merged');
  assert.match(await page.textContent('#panel-value'), /More of a good thing never prices for less/);
  assert.match(await page.textContent('#panel-value'), /priced by the ground it covers/);
});
