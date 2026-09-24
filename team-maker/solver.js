/* Team Maker — pure solver (no DOM).
   Works in the browser (window.TeamSolver) and in Node (module.exports).

   Splits a weighted list into T teams while:
     (a) never putting a "cannot be together" pair in the same team,
     (b) keeping "must be together" pairs in the same team,
     (c) balancing total weight per team,
     (d) letting some people be "repeatable": in every team, or in up to N teams.
*/
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TeamSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- user-facing messages (zh-Hant / en) ---------- */
  var MSG = {
    zh: {
      badWeight: function (line) { return '「' + line + '」權重唔合理，當 1 計'; },
      dupName: function (n) { return '重複名「' + n + '」，只用第一個'; },
      pairTooMany: function (line, k) { return '「' + line + '」有 ' + k + ' 個名 → 當佢咁互相都唔同隊'; },
      pairMalformed: function (line) { return '「' + line + '」格式唔啱（要 A ! B）'; },
      repeatNoName: function (line) { return '「' + line + '」冇名字，已略過'; },
      repeatOne: function (n) { return '「' + n + '」寫咗 1 隊，即係唔會重複，已當普通成員'; },
      repeatUnknown: function (n) { return '「' + n + '」設定咗可重複，但唔喺名單，已略過'; },
      repeatOnly: function () { return '只剩可重複嘅人，冇普通成員可分'; },
      neverSeparate: function (a, b) { return '「' + a + '」每隊都有，所以同「' + b + '」冇可能唔同隊 → 已略過呢條規則'; },
      repeatMust: function (a, b) { return '「' + a + ' / ' + b + '」涉及可重複嘅人，唔支援「必須同隊」，已略過'; },
      unknownCannot: function (a, b) { return '唔可以同隊「' + a + ' / ' + b + '」入面有名字唔喺名單，已略過'; },
      unknownMust: function (a, b) { return '必須同隊「' + a + ' / ' + b + '」入面有名字唔喺名單，已略過'; },
      ruleClash: function (k) { return '規則本身打架：有 ' + k + ' 對同時「必須同隊」又「唔可以同隊」，冇可能同時滿足'; },
      tooManyTeams: function (T, B) { return '隊數（' + T + '）多過可以獨立分嘅組數（' + B + '），會有空隊'; },
      notEnoughSeats: function (mx, T, tot, need) { return '每隊最多 ' + mx + ' 人 × ' + T + ' 隊 = ' + tot + ' 個位，唔夠放 ' + need + ' 人 —— 加隊數或者提高上限'; },
      stillOverlap: function (k) { return '有 ' + k + ' 對「唔可以同隊」仍然有重疊（規則太多／衝突，冇完美解）'; },
      overCap: function (k) { return '有 ' + k + ' 個人超出每隊人數上限 —— 隊數唔夠，加多幾隊或者提高上限'; },
      emptyList: function () { return '名單係空嘅'; }
    },
    en: {
      badWeight: function (line) { return 'Weight on "' + line + '" looks wrong — using 1'; },
      dupName: function (n) { return 'Duplicate name "' + n + '" — keeping the first one'; },
      pairTooMany: function (line, k) { return '"' + line + '" lists ' + k + ' names → treated as all-separate'; },
      pairMalformed: function (line) { return '"' + line + '" looks wrong (use A ! B)'; },
      repeatNoName: function (line) { return '"' + line + '" has no name — skipped'; },
      repeatOne: function (n) { return '"' + n + '" says 1 team, so it does not repeat — treated as a normal member'; },
      repeatUnknown: function (n) { return '"' + n + '" is marked repeatable but is not in the list — skipped'; },
      repeatOnly: function () { return 'Only repeatable members left — there is nothing to split'; },
      neverSeparate: function (a, b) { return '"' + a + '" is in every team, so it can never be apart from "' + b + '" — rule dropped'; },
      repeatMust: function (a, b) { return '"' + a + ' / ' + b + '" involves a repeatable member — "must be together" is not supported, rule dropped'; },
      unknownCannot: function (a, b) { return 'Cannot-be-together "' + a + ' / ' + b + '" mentions a name that is not in the list — skipped'; },
      unknownMust: function (a, b) { return 'Must-be-together "' + a + ' / ' + b + '" mentions a name that is not in the list — skipped'; },
      ruleClash: function (k) { return 'Rules contradict each other: ' + k + ' pair(s) are both "must be together" and "cannot be together"'; },
      tooManyTeams: function (T, B) { return 'More teams (' + T + ') than independent groups (' + B + ') — some teams will stay empty'; },
      notEnoughSeats: function (mx, T, tot, need) { return 'Max ' + mx + ' per team × ' + T + ' teams = ' + tot + ' seats — not enough for ' + need + ' people. Add teams or raise the limit'; },
      stillOverlap: function (k) { return k + ' "cannot be together" pair(s) still share a team (too many or conflicting rules — no perfect solution)'; },
      overCap: function (k) { return k + ' people exceed the per-team limit — add teams or raise the limit'; },
      emptyList: function () { return 'The list is empty'; }
    }
  };
  function msg(lang, key) {
    var cat = MSG[lang === 'en' ? 'en' : 'zh'];
    var fn = cat[key] || MSG.zh[key];
    return fn.apply(null, Array.prototype.slice.call(arguments, 2));
  }

  /* ---------- seeded RNG (mulberry32) ---------- */
  function makeRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- parsing ---------- */
  // "陳大文" -> 1 ; "陳大文 3" / "陳大文,3" / "陳大文*3" / "陳大文(3)" / "陳大文=3" -> 3
  function parsePeople(text, lang) {
    var out = [], warnings = [];
    String(text || '').split(/\r?\n/).forEach(function (raw, i) {
      var line = raw.trim();
      if (!line || line.charAt(0) === '#') return;
      var name = line, weight = 1;
      var m = line.match(/^(.*?)[\s]*[\(\[,;*x×=]\s*(-?\d+(?:\.\d+)?)\s*[\)\]]?$/i);
      if (m && m[1].trim()) {
        name = m[1].trim();
        weight = parseFloat(m[2]);
      } else {
        m = line.match(/^(.*?)\s+(-?\d+(?:\.\d+)?)$/);
        if (m && m[1].trim()) { name = m[1].trim(); weight = parseFloat(m[2]); }
      }
      if (!isFinite(weight) || weight <= 0) {
        warnings.push(msg(lang, 'badWeight', line));
        weight = 1;
      }
      if (weight > 100) { weight = 100; }
      out.push({ name: name, weight: weight, line: i + 1 });
    });
    var seen = Object.create(null), dedup = [];
    out.forEach(function (p) {
      var k = p.name.toLowerCase();
      if (seen[k]) { warnings.push(msg(lang, 'dupName', p.name)); return; }
      seen[k] = 1; dedup.push(p);
    });
    return { people: dedup, warnings: warnings };
  }

  // "A ! B" -> [A, B]. Separators: ! ！ + × , ， / | 、 -> → 與 同 和
  // NOTE: a bare "x" is deliberately NOT a separator — names like "x" or "Max" must survive.
  function splitPair(line) {
    return line.split(/\s*(?:!|！|\+|×|,|，|\/|\||、|->|→|與|同|和)\s*/i)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }
  function parsePairs(text, lang) {
    var pairs = [], warnings = [];
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim();
      if (!line || line.charAt(0) === '#') return;
      var parts = splitPair(line);
      if (parts.length === 2) {
        pairs.push([parts[0], parts[1]]);
      } else if (parts.length > 2) {
        for (var i = 0; i < parts.length; i++) {
          for (var j = i + 1; j < parts.length; j++) pairs.push([parts[i], parts[j]]);
        }
        warnings.push(msg(lang, 'pairTooMany', line, parts.length));
      } else {
        warnings.push(msg(lang, 'pairMalformed', line));
      }
    });
    return { pairs: pairs, warnings: warnings };
  }

  /* Repeatable people: "Name" = in EVERY team; "Name 2" / "Name x2" / "Name 最多2" = up to 2 teams. */
  function parseRepeat(text, lang) {
    var items = [], warnings = [];
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim();
      if (!line || line.charAt(0) === '#') return;
      var name = line, teams = 0; // 0 = every team
      var m = line.match(/^(.*?)[\s]*(?:x|×|\*|=|max|最多|可|每)\s*(\d+)\s*$/i)
           || line.match(/^(.*?)\s+(\d+)\s*$/);
      if (m && m[1].trim()) { name = m[1].trim(); teams = parseInt(m[2], 10); }
      if (!name) { warnings.push(msg(lang, 'repeatNoName', line)); return; }
      if (teams === 1) { warnings.push(msg(lang, 'repeatOne', name)); }
      items.push({ name: name, teams: teams > 1 ? teams : 0 });
    });
    return { items: items, warnings: warnings };
  }

  /* ---------- union-find ---------- */
  function DSU(n) { this.p = []; for (var i = 0; i < n; i++) this.p.push(i); }
  DSU.prototype.find = function (x) {
    while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; }
    return x;
  };
  DSU.prototype.union = function (a, b) {
    a = this.find(a); b = this.find(b);
    if (a !== b) this.p[b] = a;
  };

  /* ---------- solve ---------- */
  function solve(opts) {
    opts = opts || {};
    var T = Math.max(1, Math.min(20, parseInt(opts.teams, 10) || 2));
    var iterations = Math.max(200, Math.min(200000, parseInt(opts.iterations, 10) || 6000));
    var restarts = Math.max(1, Math.min(50, parseInt(opts.restarts, 10) || 10));
    var balance = opts.balance !== false;
    var lang = opts.lang === 'en' ? 'en' : 'zh';
    var maxPerTeam = Math.max(0, parseInt(opts.maxPerTeam, 10) || 0);
    var sizeRange = null;
    if (parseInt(opts.sizeMax, 10) > 0) {
      var sMin = Math.max(1, parseInt(opts.sizeMin, 10) || 1);
      var sMax = Math.max(sMin, parseInt(opts.sizeMax, 10) || sMin);
      sizeRange = { min: sMin, max: sMax };
    }
    var seed = (parseInt(opts.seed, 10) || 1) >>> 0;
    var people = (opts.people || []).slice();
    var warnings = [];

    var index = Object.create(null);
    people.forEach(function (p, i) { index[p.name.toLowerCase()] = i; });

    if (people.length === 0) {
      // No names at all: still lay out the teams so the empty seats can be planned/filled in later.
      var seatCaps = null;
      if (sizeRange) {
        var sr = makeRng((seed ^ 0x5bf03635) >>> 0);
        seatCaps = [];
        for (var sc = 0; sc < T; sc++) seatCaps.push(sizeRange.min + Math.floor(sr() * (sizeRange.max - sizeRange.min + 1)));
      } else if (maxPerTeam > 0) {
        seatCaps = [];
        for (var sc2 = 0; sc2 < T; sc2++) seatCaps.push(maxPerTeam);
      }
      var seatTeams = [];
      for (var s0 = 0; s0 < T; s0++) seatTeams.push({ id: s0, members: [], count: 0, weight: 0, cap: seatCaps ? seatCaps[s0] : 0 });
      return { teams: seatTeams, repeats: [], violations: [], conflicts: [], warnings: [], imbalance: 0, maxPerTeam: maxPerTeam, caps: seatCaps, sizeRange: sizeRange, ok: true };
    }

    /* ---- split repeatable people out of the core ---- */
    var repeatOf = Object.create(null);   // lowercased name -> {max}   (max 0 = every team)
    var repeatList = [];                  // ordered repeat names
    (opts.repeat || []).forEach(function (spec) {
      var key = String(spec.name).toLowerCase();
      if (index[key] === undefined) {
        warnings.push(msg(lang, 'repeatUnknown', spec.name));
        return;
      }
      var max = parseInt(spec.teams, 10) || 0;
      if (max > T) max = 0;               // asking for more teams than exist = every team
      if (max === 1) max = 0;
      if (repeatOf[key] === undefined) repeatList.push(key);
      repeatOf[key] = { max: max, name: people[index[key]].name, weight: people[index[key]].weight };
    });

    var core = [], coreByName = Object.create(null);
    people.forEach(function (p) {
      if (repeatOf[p.name.toLowerCase()] === undefined) {
        coreByName[p.name.toLowerCase()] = core.length;
        core.push(p);
      }
    });
    repeatList.forEach(function (k) {
      if (core.length === 0) warnings.push(msg(lang, 'repeatOnly'));
    });

    /* ---- resolve rules ---- */
    var cannotCore = [], repeatForbid = Object.create(null);
    function forbid(repKey, other) {
      var f = repeatForbid[repKey] || (repeatForbid[repKey] = { core: {}, rep: {} });
      if (other.core !== undefined) f.core[other.core] = 1;
      if (other.rep !== undefined) f.rep[other.rep] = 1;
    }

    function resolveCannot(pairs) {
      pairs.forEach(function (pr) {
        var ka = pr[0].toLowerCase(), kb = pr[1].toLowerCase();
        var ra = repeatOf[ka], rb = repeatOf[kb];
        if (ra || rb) {
          if (ra && ra.max === 0) {
            warnings.push(msg(lang, 'neverSeparate', ra.name, pr[1]));
            return;
          }
          if (rb && rb.max === 0) {
            warnings.push(msg(lang, 'neverSeparate', rb.name, pr[0]));
            return;
          }
          if (ra && rb) { forbid(ka, { rep: kb }); forbid(kb, { rep: ka }); return; }
          if (ra && coreByName[kb] !== undefined) { forbid(ka, { core: coreByName[kb] }); return; }
          if (rb && coreByName[ka] !== undefined) { forbid(kb, { core: coreByName[ka] }); return; }
          return; // repeats only, no core side -> nothing to enforce
        }
        var ia = coreByName[ka], ib = coreByName[kb];
        if (ia === undefined || ib === undefined) {
          warnings.push(msg(lang, 'unknownCannot', pr[0], pr[1]));
          return;
        }
        if (ia !== ib) cannotCore.push([ia, ib]);
      });
    }
    function resolveMust(pairs) {
      var out = [];
      pairs.forEach(function (pr) {
        var ka = pr[0].toLowerCase(), kb = pr[1].toLowerCase();
        var ra = repeatOf[ka], rb = repeatOf[kb];
        if (ra || rb) {
          warnings.push(msg(lang, 'repeatMust', pr[0], pr[1]));
          return;
        }
        var ia = coreByName[ka], ib = coreByName[kb];
        if (ia === undefined || ib === undefined) {
          warnings.push(msg(lang, 'unknownMust', pr[0], pr[1]));
          return;
        }
        if (ia !== ib) out.push([ia, ib]);
      });
      return out;
    }
    var mustPairs = resolveMust(opts.mustPairs || []);
    resolveCannot(opts.cannotPairs || []);

    if (core.length === 0) {
      var emptyTeams = [];
      for (var e = 0; e < T; e++) emptyTeams.push({ id: e, members: [], count: 0, weight: 0 });
      repeatEntryTeams(repeatList, repeatOf, T).forEach(function (entry) {
        entry.teamIds.forEach(function (t) {
          emptyTeams[t].members.push({ name: entry.name, weight: entry.weight, repeat: entry.label });
        });
      });
      emptyTeams.forEach(function (tm) {
        tm.count = tm.members.length;
        tm.weight = Math.round(tm.members.reduce(function (s, m) { return s + m.weight; }, 0) * 100) / 100;
      });
      return { teams: emptyTeams, violations: [], conflicts: [], warnings: warnings, imbalance: 0, ok: true };
    }

    /* ---- blocks: must-be-together groups ---- */
    var dsu = new DSU(core.length);
    mustPairs.forEach(function (p) { dsu.union(p[0], p[1]); });
    var blockIndexOf = Object.create(null), blocks = [], blockWeight = [], blockMembers = [];
    core.forEach(function (p, i) {
      var r = dsu.find(i);
      if (blockIndexOf[r] === undefined) {
        blockIndexOf[r] = blocks.length;
        blocks.push([]); blockWeight.push(0); blockMembers.push([]);
      }
      var b = blockIndexOf[r];
      blocks[b].push(i); blockWeight[b] += p.weight; blockMembers[b].push(p.name);
    });
    var blockOf = core.map(function (_, i) { return blockIndexOf[dsu.find(i)]; });

    var conflicts = [];
    cannotCore.forEach(function (p) {
      if (blockOf[p[0]] === blockOf[p[1]]) {
        conflicts.push({ a: core[p[0]].name, b: core[p[1]].name });
      }
    });
    if (conflicts.length) {
      warnings.push(msg(lang, 'ruleClash', conflicts.length));
    }
    if (T > blocks.length) {
      warnings.push(msg(lang, 'tooManyTeams', T, blocks.length));
    }

    var maxRepeat = 0;
    repeatList.forEach(function (k) { var m = repeatOf[k].max; if (m > maxRepeat) maxRepeat = m; });

    /* ---- per-team capacities: a fixed cap, or a random size in [min,max] ---- */
    var caps = null;
    if (sizeRange) {
      var needed = core.length;
      repeatList.forEach(function (k) { var s = repeatOf[k]; needed += (s.max === 0 ? T : s.max); });
      var capsRng = makeRng((seed ^ 0x5bf03635) >>> 0);
      caps = [];
      for (var ci = 0; ci < T; ci++) {
        caps.push(sizeRange.min + Math.floor(capsRng() * (sizeRange.max - sizeRange.min + 1)));
      }
      var capTotal = 0, gi;
      for (gi = 0; gi < T; gi++) capTotal += caps[gi];
      var guard = 0;
      while (capTotal < needed && guard++ < 20000) {
        var grow = -1;
        for (gi = 0; gi < T; gi++) if (caps[gi] < sizeRange.max && (grow === -1 || caps[gi] < caps[grow])) grow = gi;
        if (grow === -1) break;
        caps[grow]++; capTotal++;
      }
      if (capTotal < needed) {
        warnings.push(msg(lang, 'notEnoughSeats', sizeRange.max, T, capTotal, needed));
      }
    } else if (maxPerTeam > 0) {
      caps = [];
      for (var ci2 = 0; ci2 < T; ci2++) caps.push(maxPerTeam);
    }

    /* ---- cost ---- */
    function costOf(teamOf, repTeams) {
      var loads = new Array(T).fill(0), counts = new Array(T).fill(0);
      var i, t;
      for (i = 0; i < blocks.length; i++) {
        t = teamOf[i];
        if (t >= 0 && t < T) { loads[t] += blockWeight[i]; counts[t] += blockMembers[i].length; }
      }
      // repeat people: "every team" adds a headcount but no balance weight; "up to N" adds both
      for (i = 0; i < repeatList.length; i++) {
        var spec = repeatOf[repeatList[i]];
        var w = spec.weight, n = spec.max;
        if (n > 0) {
          repTeams[i].forEach(function (tt) { loads[tt] += w; counts[tt] += 1; });
        } else {
          for (t = 0; t < T; t++) counts[t] += 1;
        }
      }
      var violations = [];
      for (i = 0; i < cannotCore.length; i++) {
        var pr = cannotCore[i];
        if (teamOf[blockOf[pr[0]]] === teamOf[blockOf[pr[1]]]) {
          violations.push({ a: core[pr[0]].name, b: core[pr[1]].name });
        }
      }
      for (i = 0; i < repeatList.length; i++) {
        var key = repeatList[i], f = repeatForbid[key];
        if (!f) continue;
        var mine = repeatOf[key].max === 0
          ? allTeams(T)
          : repTeams[i];
        var mineSet = Object.create(null); mine.forEach(function (x) { mineSet[x] = 1; });
        Object.keys(f.core).forEach(function (ci) {
          var bt = teamOf[blockOf[ci]];
          if (mineSet[bt]) violations.push({ a: repeatOf[key].name, b: core[ci].name });
        });
        Object.keys(f.rep).forEach(function (rk) {
          var j = repeatList.indexOf(rk);
          var other = repeatOf[rk].max === 0 ? allTeams(T) : repTeams[j];
          if (other.some(function (x) { return mineSet[x]; })) {
            violations.push({ a: repeatOf[key].name, b: repeatOf[rk].name });
          }
        });
      }
      var imbalance = 0;
      if (balance) {
        var mean = loads.reduce(function (s, v) { return s + v; }, 0) / T;
        for (t = 0; t < T; t++) { var d = loads[t] - mean; imbalance += d * d; }
        imbalance = imbalance / T;
        var cmean = counts.reduce(function (s, v) { return s + v; }, 0) / T;
        for (t = 0; t < T; t++) { var dc = counts[t] - cmean; imbalance += dc * dc * 0.01; }
      }
      var overflow = 0;
      if (caps) {
        for (t = 0; t < T; t++) if (counts[t] > caps[t]) overflow += counts[t] - caps[t];
      }
      return { score: violations.length * 1e6 + overflow * 1e4 + imbalance, imbalance: imbalance, loads: loads, counts: counts, violations: violations, overflow: overflow };
    }

    var rng = makeRng(seed);
    var best = null, bestTeamOf = null, bestRepTeams = null;

    for (var r = 0; r < restarts; r++) {
      var order = blocks.map(function (_, i) { return i; });
      if (r === 0) order.sort(function (a, b) { return blockWeight[b] - blockWeight[a]; });
      else for (var k = order.length - 1; k > 0; k--) { var j = Math.floor(rng() * (k + 1)); var tmp = order[k]; order[k] = order[j]; order[j] = tmp; }

      var teamOf = new Array(blocks.length).fill(-1), loads = new Array(T).fill(0);
      order.forEach(function (b) {
        var pick = 0;
        if (r === 0 && balance) { for (var t = 1; t < T; t++) if (loads[t] < loads[pick] - 1e-9) pick = t; }
        else pick = Math.floor(rng() * T);
        teamOf[b] = pick; loads[pick] += blockWeight[b];
      });

      // seed the limited-repeat people onto the lightest teams
      var repTeams = repeatList.map(function (key) {
        var n = repeatOf[key].max;
        if (n === 0) return [];
        var ranked = allTeams(T).sort(function (a, b) { return loads[a] - loads[b]; }).slice(0, n);
        ranked.forEach(function (t) { loads[t] += repeatOf[key].weight; });
        return ranked.sort(function (a, b) { return a - b; });
      });

      var cur = costOf(teamOf, repTeams);
      var localBest = cur.score, localTeamOf = teamOf.slice(), localRep = repTeams.map(function (a) { return a.slice(); });

      for (var it = 0; it < iterations; it++) {
        var cand = teamOf.slice(), candRep = repTeams.map(function (a) { return a.slice(); });
        var roll = rng();
        if (maxRepeat > 0 && roll < 0.25) {
          // move a limited-repeat person to a different team
          var idxs = [];
          repeatList.forEach(function (kk, ii) { if (repeatOf[kk].max > 0) idxs.push(ii); });
          if (!idxs.length) continue;
          var ri = idxs[Math.floor(rng() * idxs.length)];
          var set = candRep[ri];
          var free = allTeams(T).filter(function (t) { return set.indexOf(t) === -1; });
          if (!free.length) continue;
          var to = free[Math.floor(rng() * free.length)];
          var drop = Math.floor(rng() * set.length);
          set[drop] = to;
          set.sort(function (a, b) { return a - b; });
        } else if (blocks.length > 1 && roll < 0.75) {
          var b1 = Math.floor(rng() * blocks.length), b2 = Math.floor(rng() * blocks.length);
          if (b1 === b2 || cand[b1] === cand[b2]) continue;
          var tt = cand[b1]; cand[b1] = cand[b2]; cand[b2] = tt;
        } else {
          if (T < 2) continue;
          var bm = Math.floor(rng() * blocks.length), nt = Math.floor(rng() * T);
          if (cand[bm] === nt) continue;
          cand[bm] = nt;
        }
        var c = costOf(cand, candRep);
        if (c.score <= cur.score) { teamOf = cand; repTeams = candRep; cur = c; }
        if (c.score < localBest) { localBest = c.score; localTeamOf = cand.slice(); localRep = candRep.map(function (a) { return a.slice(); }); }
      }
      var finalCost = costOf(localTeamOf, localRep);
      if (!best || finalCost.score < best.score) { best = finalCost; bestTeamOf = localTeamOf.slice(); bestRepTeams = localRep; }
      if (best.violations.length === 0 && best.imbalance < 1e-6) break;
    }

    /* ---- build output ---- */
    var teams = [];
    for (var t2 = 0; t2 < T; t2++) teams.push({ id: t2, members: [], weight: 0, cap: caps ? caps[t2] : 0 });
    blocks.forEach(function (_, b) {
      var t3 = bestTeamOf[b];
      if (t3 < 0 || t3 >= T) t3 = 0;
      blocks[b].forEach(function (pi) { teams[t3].members.push({ name: core[pi].name, weight: core[pi].weight }); });
    });
    repeatList.forEach(function (key, i) {
      var spec = repeatOf[key];
      var ids = spec.max === 0 ? allTeams(T) : bestRepTeams[i];
      ids.forEach(function (t4) {
        teams[t4].members.push({ name: spec.name, weight: spec.weight, repeat: spec.max === 0 ? 'all' : spec.max });
      });
    });
    teams.forEach(function (tm) {
      tm.members.sort(function (a, b) { return (b.repeat ? 1 : 0) - (a.repeat ? 1 : 0) || b.weight - a.weight || (a.name < b.name ? -1 : 1); });
      tm.count = tm.members.length;
      tm.weight = Math.round(tm.members.reduce(function (s, m) { return s + m.weight; }, 0) * 100) / 100;
    });

    var repeats = repeatList.map(function (key) {
      var spec = repeatOf[key];
      return { name: spec.name, teams: spec.max === 0 ? T : spec.max, every: spec.max === 0 };
    });

    if (best.violations.length) {
      warnings.push(msg(lang, 'stillOverlap', best.violations.length));
    }
    if (caps && best.overflow > 0) {
      warnings.push(msg(lang, 'overCap', best.overflow));
    }

    return {
      teams: teams,
      repeats: repeats,
      maxPerTeam: maxPerTeam,
      caps: caps,
      sizeRange: sizeRange,
      violations: best.violations,
      conflicts: conflicts,
      warnings: warnings,
      imbalance: Math.round(best.imbalance * 100) / 100,
      ok: best.violations.length === 0 && conflicts.length === 0
    };
  }

  function allTeams(T) { var a = []; for (var i = 0; i < T; i++) a.push(i); return a; }

  // How many teams are needed so that nobody exceeds maxPerTeam? (0 = unlimited)
  function autoTeams(n, maxPerTeam) {
    var max = parseInt(maxPerTeam, 10) || 0;
    if (max <= 0) return Math.max(2, Math.min(20, n || 2));
    return Math.max(1, Math.min(20, Math.ceil((n || 1) / max)));
  }

  // Pick one index 0..n-1. Same seed → same pick (handy for tests and re-rolls).
  function randomIndex(n, seed) {
    if (!(n > 0)) return -1;
    var r = makeRng((parseInt(seed, 10) >>> 0) || (Date.now() & 0x7fffffff));
    return Math.floor(r() * n);
  }

  // repeatable people that are in EVERY team (used when there is no core list)
  function repeatEntryTeams(repeatList, repeatOf, T) {
    return repeatList.map(function (k) {
      var s = repeatOf[k];
      return { name: s.name, weight: s.weight, teams: s.max === 0 ? T : s.max, label: s.max === 0 ? 'all' : s.max, teamIds: allTeams(T) };
    });
  }

  // Turn the two min/max inputs into a real range. The MAX box is always authoritative:
  // blank/0 max → same as min; min above max → the min is lowered (never raise the max).
  function normalizeRange(minInput, maxInput) {
    var mn = Math.max(1, parseInt(minInput, 10) || 1);
    var raw = parseInt(maxInput, 10) || 0;
    var mx, note = null;
    if (raw <= 0) { mx = mn; note = 'blank'; }
    else {
      mx = raw;
      if (mx < mn) { mn = mx; note = 'minLowered'; }
    }
    return { min: mn, max: mx, note: note, fixed: mx === mn };
  }

  // Cap mode reads ONLY the max box. A leftover "min" value must never leak into it.
  function parseCap(v) {
    var n = parseInt(v, 10);
    return (isFinite(n) && n > 0) ? n : 0;   // 0 = no limit
  }

  // How many teams are needed to hold `n` members at `perTeam` each? (0 = no limit → 0)
  function teamsNeeded(n, perTeam) {
    var cap = parseInt(perTeam, 10) || 0;
    if (cap <= 0) return 0;
    var people = parseInt(n, 10) || 0;
    if (people <= 0) return 1;
    return Math.max(1, Math.min(20, Math.ceil(people / cap)));
  }

  // Head count to seat: n core members PLUS every repeatable member (0 teams = in all T teams).
  function neededSeats(n, repeats, T) {
    var need = Math.max(0, parseInt(n, 10) || 0);
    var teams = Math.max(1, parseInt(T, 10) || 1);
    (repeats || []).forEach(function (s) {
      var k = parseInt(s && s.teams, 10) || 0;
      need += (k === 0 ? teams : Math.min(k, teams));
    });
    return need;
  }

  // Decide the final team count. `pinned` = the number the user typed (0 = auto).
  // autoGrow ON  → a hard per-team cap wins, so teams are added until everyone fits.
  // autoGrow OFF → the user's team count always wins, even if that breaks the cap.
  function planTeams(opts) {
    opts = opts || {};
    var pinned = parseInt(opts.pinned, 10) || 0;
    var cap = parseInt(opts.cap, 10) || 0;
    var core = Math.max(0, parseInt(opts.core, 10) || 0);
    var reps = opts.repeats || [];
    var autoGrow = opts.autoGrow !== false;
    var T = pinned > 0 ? Math.max(1, Math.min(20, pinned)) : autoTeams(core, cap);
    var started = T;
    if (cap > 0 && autoGrow) {
      for (var i = 0; i < 8; i++) {
        var need = neededSeats(core, reps, T);
        var fit = teamsNeeded(need, cap);
        if (fit <= T) break;
        T = fit;
      }
    }
    var minRequired = cap > 0 ? teamsNeeded(neededSeats(core, reps, T), cap) : 0;
    return { teams: T, pinned: pinned, cap: cap, grew: T > started, minRequired: minRequired, ok: cap <= 0 || T >= minRequired };
  }

  return { solve: solve, parsePeople: parsePeople, parsePairs: parsePairs, parseRepeat: parseRepeat, makeRng: makeRng, autoTeams: autoTeams, randomIndex: randomIndex, normalizeRange: normalizeRange, parseCap: parseCap, teamsNeeded: teamsNeeded, neededSeats: neededSeats, planTeams: planTeams };
});
