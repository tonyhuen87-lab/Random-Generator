/* Node test harness for team-maker solver. Run: node test-solver.js */
const S = require('./solver.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
const teamOfName = (res, name) => res.teams.findIndex(t => t.members.some(m => m.name === name));

console.log('\n[1] basic: 12 people, 3 teams, 3 cannot-pairs, 1 must-pair');
{
  const people = S.parsePeople(
    '陳大文 3\n李小明 2\n黃小美 3\n張三 1\n王五 2\n趙六 3\n錢七 1\n孫八 2\n周九 3\n吳十 1\n鄭一 2\n馮二 3'
  ).people;
  const cannot = S.parsePairs('陳大文 ! 李小明\n黃小美 ! 趙六\n張三 ! 孫八').pairs;
  const must = S.parsePairs('李小明 + 王五').pairs;
  const res = S.solve({ people, teams: 3, cannotPairs: cannot, mustPairs: must, balance: true, seed: 42 });

  check('no conflicts reported', res.conflicts.length === 0, res.conflicts);
  check('zero rule violations', res.violations.length === 0, res.violations);
  check('ok = true', res.ok === true);

  const names = res.teams.flatMap(t => t.members.map(m => m.name));
  check('everyone assigned exactly once', names.length === 12 && new Set(names).size === 12, names.length);

  check('must-pair 李小明+王五 same team', teamOfName(res, '李小明') === teamOfName(res, '王五'),
    [teamOfName(res, '李小明'), teamOfName(res, '王五')]);
  check('cannot 陳大文!=李小明', teamOfName(res, '陳大文') !== teamOfName(res, '李小明'));
  check('cannot 黃小美!=趙六', teamOfName(res, '黃小美') !== teamOfName(res, '趙六'));
  check('cannot 張三!=孫八', teamOfName(res, '張三') !== teamOfName(res, '孫八'));

  const w = res.teams.map(t => t.weight);
  const spread = Math.max(...w) - Math.min(...w);
  check('weight spread <= 3 (balanced)', spread <= 3, { weights: w, spread });
  console.log('     teams:', JSON.stringify(w), 'spread', spread, 'imbalance', res.imbalance);
}

console.log('\n[2] contradictory rules: must-together AND cannot-together');
{
  const people = S.parsePeople('A\nB\nC\nD').people;
  const res = S.solve({
    people, teams: 2,
    cannotPairs: S.parsePairs('A ! B').pairs,
    mustPairs: S.parsePairs('A + B').pairs, seed: 7
  });
  check('conflict detected', res.conflicts.length === 1, res.conflicts);
  check('ok = false', res.ok === false);
  check('warns about contradiction', res.warnings.some(w => w.includes('打架')), res.warnings);
  check('A and B still together (must wins)', teamOfName(res, 'A') === teamOfName(res, 'B'));
}

console.log('\n[3] deterministic: same seed → same result');
{
  const people = S.parsePeople('a 1\nb 2\nc 3\nd 4\ne 5\nf 6').people;
  const r1 = S.solve({ people, teams: 2, seed: 12345 });
  const r2 = S.solve({ people, teams: 2, seed: 12345 });
  const sig = r => r.teams.map(t => t.members.map(m => m.name).join(',')).join('|');
  check('identical output', sig(r1) === sig(r2), [sig(r1), sig(r2)]);
  const r3 = S.solve({ people, teams: 2, seed: 999 });
  check('different seed can differ', typeof sig(r3) === 'string');
}

console.log('\n[4] balance OFF still respects hard rules');
{
  const people = S.parsePeople('p1\np2\np3\np4\np5\np6').people;
  const res = S.solve({ people, teams: 2, cannotPairs: S.parsePairs('p1 ! p2\np3 ! p4').pairs, balance: false, seed: 3 });
  check('zero violations', res.violations.length === 0, res.violations);
  check('all 6 assigned', res.teams.flatMap(t => t.members).length === 6);
}

console.log('\n[5] edge: more teams than groups');
{
  const people = S.parsePeople('x + y\na\nb').people; // "x + y" → name "x + y"? no: weight parse
  const ppl = S.parsePeople('x\ny\na\nb').people;
  const res = S.solve({ people: ppl, teams: 5, mustPairs: S.parsePairs('x + y').pairs, seed: 5 });
  check('warns about empty teams', res.warnings.some(w => w.includes('空隊')), res.warnings);
  check('4 people placed', res.teams.flatMap(t => t.members).length === 4);
  check('x and y together', teamOfName(res, 'x') === teamOfName(res, 'y'));
}

console.log('\n[6] bad input handling');
{
  const parsed = S.parsePeople('Alice\nAlice\nBob -2');
  check('duplicate name dropped + warned', parsed.people.length === 2 && parsed.warnings.some(w => w.includes('重複')), parsed.people.map(p => p.name));
  check('bad weight coerced to 1', parsed.people.find(p => p.name === 'Bob').weight === 1);
  const pairs = S.parsePairs('unknown ! Alice\nsolo line');
  const res = S.solve({ people: parsed.people, teams: 2, cannotPairs: pairs.pairs, seed: 1 });
  check('unknown name warned', res.warnings.some(w => w.includes('唔喺名單')), res.warnings);
  check('malformed rule warned at parse time', pairs.warnings.some(w => w.includes('格式')), pairs.warnings);
  check('name containing x not split', S.parsePairs('x + y').pairs.length === 1, S.parsePairs('x + y').pairs);
  const empty = S.solve({ people: [], teams: 2 });
  check('empty list now returns an empty seat layout', empty.ok === true && empty.teams.length === 2 && empty.warnings.length === 0,
    { ok: empty.ok, teams: empty.teams.length, warnings: empty.warnings });
}

console.log('\n[7] weight parsing variants');
{
  const p = S.parsePeople('Alpha 3\nBeta,2\nGamma*4\nDelta(5)\nEpsilon = 6\nZeta').people;
  const got = Object.fromEntries(p.map(x => [x.name, x.weight]));
  check('space 3', got.Alpha === 3, got);
  check('comma 2', got.Beta === 2, got);
  check('star 4', got.Gamma === 4, got);
  check('paren 5', got.Delta === 5, got);
  check('equals 6', got.Epsilon === 6, got);
  check('default 1', got.Zeta === 1, got);
}

console.log('\n[8] stress: 40 people, 8 cannot-pairs, 4 teams');
{
  const lines = [];
  for (let i = 1; i <= 40; i++) lines.push('P' + i + ' ' + (1 + (i % 5)));
  const people = S.parsePeople(lines.join('\n')).people;
  const cannot = S.parsePairs('P1 ! P2\nP3 ! P4\nP5 ! P6\nP7 ! P8\nP9 ! P10\nP11 ! P12\nP13 ! P14\nP15 ! P16').pairs;
  const t0 = Date.now();
  const res = S.solve({ people, teams: 4, cannotPairs: cannot, seed: 2026 });
  const ms = Date.now() - t0;
  check('zero violations', res.violations.length === 0, res.violations);
  const w = res.teams.map(t => t.weight);
  const spread = Math.max(...w) - Math.min(...w);
  check('balanced (spread <= 5)', spread <= 5, { w, spread });
  check('runtime < 8s', ms < 8000, ms + 'ms');
  console.log('     40p/4 teams:', JSON.stringify(w), 'spread', spread, ms + 'ms');
}

console.log('\n[9] repeatable members (跨隊重複)');
{
  const people = S.parsePeople('A 3\nB 2\nC 3\nD 1\nE 2\nF 3\n教練 2\n助手 1').people;
  const rep = S.parseRepeat('教練\n助手 2').items;
  check('parseRepeat: plain name = every team', rep[0].teams === 0, rep);
  check('parseRepeat: "助手 2" = max 2', rep[1].teams === 2, rep);

  const res = S.solve({ people, teams: 3, repeat: rep, seed: 11 });
  const teamsOf = n => res.teams.map((t, i) => t.members.some(m => m.name === n) ? i : -1).filter(i => i >= 0);
  check('coach appears in all 3 teams', teamsOf('教練').length === 3, teamsOf('教練'));
  check('assistant in 1–2 teams', teamsOf('助手').length >= 1 && teamsOf('助手').length <= 2, teamsOf('助手'));
  check('everyone else appears exactly once', ['A', 'B', 'C', 'D', 'E', 'F'].every(n => teamsOf(n).length === 1),
    ['A', 'B', 'C', 'D', 'E', 'F'].map(n => n + ':' + teamsOf(n).length));
  check('no rule violations', res.violations.length === 0, res.violations);
  check('repeats summary reported', !!res.repeats && res.repeats.length === 2 && res.repeats[0].every === true, res.repeats);
  const uniq = res.teams.map(t => t.members.filter(m => !m.repeat).reduce((s, m) => s + m.weight, 0));
  const spread = Math.max(...uniq) - Math.min(...uniq);
  check('core members balanced despite repeats (spread <= 3)', spread <= 3, { uniq, spread });
  console.log('     weights per team:', JSON.stringify(res.teams.map(t => t.weight)), 'core-only:', JSON.stringify(uniq));
}

console.log('\n[10] repeat + rule edge cases');
{
  const people = S.parsePeople('X\nY\nZ\nHelper').people;
  const res = S.solve({
    people, teams: 2, repeat: S.parseRepeat('Helper').items,
    cannotPairs: S.parsePairs('Helper ! X\nX ! Y').pairs,
    mustPairs: S.parsePairs('Helper + Z').pairs, seed: 4
  });
  check('drops cannot-rule against an every-team member', res.warnings.some(w => w.includes('每隊都有')), res.warnings);
  check('drops must-pair involving a repeat member', res.warnings.some(w => w.includes('必須同隊')), res.warnings);
  const tOf = n => res.teams.findIndex(t => t.members.some(m => m.name === n));
  check('Helper is in both teams', res.teams.every(t => t.members.some(m => m.name === 'Helper')));
  check('remaining hard rule still enforced (X != Y)', tOf('X') !== tOf('Y'), [tOf('X'), tOf('Y')]);

  const bad = S.solve({ people, teams: 2, repeat: S.parseRepeat('Nobody').items, seed: 1 });
  check('unknown repeat name warned', bad.warnings.some(w => w.includes('唔喺名單')), bad.warnings);
  const maxed = S.solve({ people, teams: 2, repeat: S.parseRepeat('Helper 9').items, seed: 1 });
  check('max > team count becomes every team', maxed.teams.every(t => t.members.some(m => m.name === 'Helper')));
}

console.log('\n[11] max members per team (每隊最多)');
{
  const people = S.parsePeople('A\nB\nC\nD\nE\nF\nG\nH\nI').people;
  const res = S.solve({ people, teams: 3, maxPerTeam: 3, seed: 5 });
  check('every team within the cap', res.teams.every(t => t.count <= 3), res.teams.map(t => t.count));
  check('all 9 placed', res.teams.reduce((s, t) => s + t.count, 0) === 9, res.teams.map(t => t.count));
  check('no capacity warning when it fits', !res.warnings.some(w => w.includes('超出')), res.warnings);
  check('maxPerTeam echoed back', res.maxPerTeam === 3, res.maxPerTeam);

  const tight = S.solve({ people, teams: 2, maxPerTeam: 3, seed: 5 });
  check('warns when 9 people cannot fit in 2x3', tight.warnings.some(w => w.includes('超出')), tight.warnings);
  check('still places everyone when infeasible', tight.teams.reduce((s, t) => s + t.count, 0) === 9);

  const withCoach = S.solve({
    people: S.parsePeople('A\nB\nC\nD\nE\nF\n教練').people,
    teams: 3, maxPerTeam: 3, repeat: S.parseRepeat('教練').items, seed: 7
  });
  check('every-team member counts toward the cap', withCoach.teams.every(t => t.count <= 3), withCoach.teams.map(t => t.count));
  const tighter = S.solve({
    people: S.parsePeople('A\nB\nC\nD\nE\nF\n教練').people,
    teams: 3, maxPerTeam: 2, repeat: S.parseRepeat('教練').items, seed: 7
  });
  check('warns when the every-team member busts the cap', tighter.warnings.some(w => w.includes('超出')), tighter.warnings);
}

console.log('\n[12] names may be left off the list (seats only)');
{
  check('autoTeams(9,3) = 3', S.autoTeams(9, 3) === 3, S.autoTeams(9, 3));
  check('autoTeams(10,3) = 4', S.autoTeams(10, 3) === 4, S.autoTeams(10, 3));
  check('autoTeams(0,0) >= 2', S.autoTeams(0, 0) >= 2, S.autoTeams(0, 0));

  const seats = S.solve({ people: [], teams: 4, maxPerTeam: 5, seed: 1 });
  check('empty list still lays out 4 teams', seats.teams.length === 4, seats.teams.length);
  check('teams are empty (no invented names)', seats.teams.every(t => t.members.length === 0));
  check('ok = true and silent', seats.ok === true && seats.warnings.length === 0, seats.warnings);

  const partial = S.solve({ people: S.parsePeople('Ann\nBen\nCal').people, teams: 3, maxPerTeam: 4, seed: 2 });
  check('3 names into 3x4 keeps teams under cap', partial.teams.every(t => t.count <= 4));
  check('only real names are placed', partial.teams.reduce((s, t) => s + t.count, 0) === 3, partial.teams.map(t => t.count));
}

console.log('\n[13] random team sizes (每隊人數隨機 1–10)');
{
  const people = S.parsePeople(Array.from({ length: 24 }, (_, i) => 'P' + (i + 1)).join('\n')).people;
  const res = S.solve({ people, teams: 6, sizeMin: 1, sizeMax: 10, seed: 99 });
  check('caps returned per team', !!res.caps && res.caps.length === 6, res.caps);
  check('every size within 1–10', res.caps.every(c => c >= 1 && c <= 10), res.caps);
  check('sizes really vary (random)', new Set(res.caps).size > 1, res.caps);
  check('total capacity covers everybody', res.caps.reduce((s, c) => s + c, 0) >= 24, res.caps);
  check('each team within its own cap', res.teams.every((t, i) => t.count <= res.caps[i]), res.teams.map((t, i) => t.count + '/' + res.caps[i]));
  check('all 24 placed exactly once', res.teams.reduce((s, t) => s + t.count, 0) === 24);
  check('sizeRange echoed back', !!res.sizeRange && res.sizeRange.min === 1 && res.sizeRange.max === 10, res.sizeRange);
  check('no overflow warning when it fits', !res.warnings.some(w => w.includes('超出')), res.warnings);
  check('same seed → same sizes',
    JSON.stringify(S.solve({ people, teams: 6, sizeMin: 1, sizeMax: 10, seed: 99 }).caps) === JSON.stringify(res.caps));
  console.log('     random sizes:', JSON.stringify(res.caps), 'total', res.caps.reduce((s, c) => s + c, 0));

  const tight = S.solve({ people, teams: 2, sizeMin: 1, sizeMax: 3, seed: 1 });
  check('warns when 24 people cannot fit in 2×3', tight.warnings.some(w => w.includes('唔夠放') || w.includes('超出')), tight.warnings);

  const seats = S.solve({ people: [], teams: 4, sizeMin: 2, sizeMax: 6, seed: 3 });
  check('empty list still gets random seat sizes', seats.teams.length === 4 && seats.caps.every(c => c >= 2 && c <= 6), seats.caps);

  const withCoach = S.solve({
    people: S.parsePeople('A\nB\nC\nD\nE\nF\nG\nH\n教練').people,
    teams: 3, sizeMin: 3, sizeMax: 4, repeat: S.parseRepeat('教練').items, seed: 8
  });
  check('every-team member counted against random caps',
    withCoach.teams.every((t, i) => t.count <= withCoach.caps[i]), withCoach.teams.map((t, i) => t.count + '/' + withCoach.caps[i]));
}

console.log('\n[14] 3+ people all in different teams (一行寫晒)');
{
  const people = S.parsePeople('A\nB\nC\nD\nE\nF').people;
  const pairs = S.parsePairs('A ! B ! C').pairs;
  check('a 3-name line expands to 3 pairwise rules', pairs.length === 3, pairs);

  const res = S.solve({ people, teams: 3, cannotPairs: pairs, seed: 21 });
  const tOf = n => res.teams.findIndex(t => t.members.some(m => m.name === n));
  check('A, B and C all in DIFFERENT teams', new Set([tOf('A'), tOf('B'), tOf('C')]).size === 3, [tOf('A'), tOf('B'), tOf('C')]);
  check('no violations', res.violations.length === 0, res.violations);

  const four = S.solve({ people, teams: 4, cannotPairs: S.parsePairs('A,B,C,D').pairs, seed: 22 });
  const t4 = n => four.teams.findIndex(t => t.members.some(m => m.name === n));
  check('4-name line keeps all four apart', new Set(['A', 'B', 'C', 'D'].map(t4)).size === 4, ['A', 'B', 'C', 'D'].map(t4));

  const tight = S.solve({ people, teams: 2, cannotPairs: pairs, seed: 21 });
  check('honest warning when 2 teams cannot hold 3 apart', tight.warnings.some(w => w.includes('冇完美解')), tight.warnings);
  check('parse note explains the expansion', S.parsePairs('A ! B ! C').warnings.some(w => w.includes('互相都唔同隊')),
    S.parsePairs('A ! B ! C').warnings);
}

console.log('\n[15] bilingual output (lang: "en" / default zh)');
{
  const people = S.parsePeople('Alice 3\nBob 2\nCarol 1').people;
  const clash = S.solve({ people, teams: 2, cannotPairs: S.parsePairs('Alice ! Bob').pairs, mustPairs: S.parsePairs('Alice + Bob').pairs, lang: 'en', seed: 1 });
  check('EN contradiction message', clash.warnings.some(w => w.includes('contradict')), clash.warnings);
  const clashZh = S.solve({ people, teams: 2, cannotPairs: S.parsePairs('Alice ! Bob').pairs, mustPairs: S.parsePairs('Alice + Bob').pairs, seed: 1 });
  check('ZH default unchanged', clashZh.warnings.some(w => w.includes('打架')), clashZh.warnings);

  const cap = S.solve({ people, teams: 2, maxPerTeam: 1, lang: 'en', seed: 1 });
  check('EN capacity warning', cap.warnings.some(w => w.includes('exceed the per-team limit')), cap.warnings);

  const pe = S.parsePeople('A\nA\nB -2', 'en');
  check('EN parse warnings (duplicate + bad weight)',
    pe.warnings.some(w => w.includes('Duplicate')) && pe.warnings.some(w => w.includes('Weight on')), pe.warnings);
  const pr = S.parsePairs('A ! B ! C', 'en');
  check('EN 3-name note', pr.warnings.some(w => w.includes('all-separate')), pr.warnings);

  const rres = S.solve({ people, teams: 2, repeat: S.parseRepeat('Nope', 'en').items, lang: 'en', seed: 1 });
  check('EN repeatable-unknown warning', rres.warnings.some(w => w.includes('not in the list')), rres.warnings);

  const seats = S.solve({ people: [], teams: 2, sizeMin: 2, sizeMax: 4, lang: 'en', seed: 1 });
  check('EN empty list stays silent', seats.warnings.length === 0, seats.warnings);
  check('solve() accepts lang without changing results',
    JSON.stringify(S.solve({ people, teams: 2, seed: 5, lang: 'en' }).teams.map(t => t.members.map(m => m.name))) ===
    JSON.stringify(S.solve({ people, teams: 2, seed: 5 }).teams.map(t => t.members.map(m => m.name))));
}

console.log('\n[16] pick-a-team helper (後加嘅揀隊功能)');
{
  check('randomIndex(0) = -1', S.randomIndex(0) === -1, S.randomIndex(0));
  const a = S.randomIndex(5, 42), b = S.randomIndex(5, 42);
  check('same seed → same pick', a === b && a >= 0 && a < 5, [a, b]);
  const many = Array.from({ length: 200 }, (_, i) => S.randomIndex(4, i + 1));
  check('always inside 0..n-1', many.every(x => x >= 0 && x < 4), [...new Set(many)].sort());
  check('can land on more than one team', new Set(many).size > 1, [...new Set(many)].sort());
  check('no seed still returns a valid index', (() => { const x = S.randomIndex(3); return x >= 0 && x < 3; })());
}

console.log('\n[17] min/max range must never invent a number (bug fix)');
{
  const a = S.normalizeRange(5, 0);
  check('min 5 / max blank → 5–5 (no silent 10)', a.min === 5 && a.max === 5 && a.note === 'blank', a);
  check('blank max is reported as fixed', a.fixed === true);
  const b = S.normalizeRange(1, 10);
  check('1–10 stays a real range', b.min === 1 && b.max === 10 && b.note === null && b.fixed === false, b);
  const c = S.normalizeRange(5, 3);
  check('max below min is clamped up', c.min === 5 && c.max === 5 && c.note === 'clamped', c);
  const d = S.normalizeRange('', '');
  check('empty inputs → 1–1', d.min === 1 && d.max === 1, d);
  const e = S.normalizeRange(5, 5);
  check('equal min/max → fixed', e.fixed === true && e.max === 5, e);

  // end-to-end: min 5, blank max, 12 people → no team may exceed 5 (and not 10)
  const people = S.parsePeople(Array.from({ length: 12 }, (_, i) => 'P' + (i + 1)).join('\n')).people;
  const r = S.normalizeRange(5, 0);
  const res = S.solve({ people, teams: 3, sizeMin: r.min, sizeMax: r.max, seed: 3 });
  check('every team ≤ 5 when the user asked for 5', res.teams.every(t => t.count <= 5), res.teams.map(t => t.count));
  check('caps all equal 5', res.caps.every(c => c === 5), res.caps);
}

console.log('\n================ ' + pass + ' passed, ' + fail + ' failed ================\n');
process.exit(fail ? 1 : 0);
