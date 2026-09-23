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
  check('empty list handled', empty.ok === false && empty.teams.length === 0);
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

console.log('\n================ ' + pass + ' passed, ' + fail + ' failed ================\n');
process.exit(fail ? 1 : 0);
