/**
 * 균열의 페어웨이 — 게임 계산 엔진 (서버 Apps Script와 웹 클라이언트가 같은 파일을 사용)
 * 순수 함수만 둔다: 입력(master, 상태, 시드) → 결과. 저장·통신은 하지 않는다.
 * 규칙 번호(R-xx)는 기획 시트 '프로토타입 규칙' 탭 기준.
 */
var Engine = (function () {
  // ---------- 시드 난수 (같은 시드 = 같은 결과, R-22) ----------
  function hashSeed(str) {
    var h = 1779033703 ^ String(str).length;
    for (var i = 0; i < String(str).length; i++) {
      h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function rng(seed) {
    var a = hashSeed(seed)();
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pickWeighted(r, list, weightOf) {
    var total = 0, i;
    for (i = 0; i < list.length; i++) total += Math.max(0, weightOf(list[i]));
    var x = r() * total;
    for (i = 0; i < list.length; i++) {
      x -= Math.max(0, weightOf(list[i]));
      if (x < 0) return list[i];
    }
    return list[list.length - 1];
  }
  function pickIndexByProb(r, probs) {
    return pickWeighted(r, probs.map(function (p, i) { return { i: i, p: p }; }), function (o) { return o.p; }).i;
  }
  function randInt(r, min, max) { return min + Math.floor(r() * (max - min + 1)); }

  // ---------- 인덱스 ----------
  function index(M) {
    if (M._ix) return M._ix;
    var by = function (list, key) { var o = {}; list.forEach(function (x) { o[x[key]] = x; }); return o; };
    M._ix = {
      item: by(M.items, 'id'), recipe: by(M.recipes, 'itemId'), material: by(M.materials, 'id'),
      course: by(M.courses, 'id'), raidCourse: by(M.raidCourses, 'courseId'), region: by(M.regions, 'id'),
      boss: by(M.bosses, 'id'), job: by(M.jobs, 'id'), grade: by(M.grades, 'code'), guest: by(M.guests, 'id'),
      equipGrade: by(M.equipGrades, 'grade'), tier: by(M.huntTiers, 'star'), bossSkill: by(M.bossSkills, 'id'),
      rewardGrade: by(M.rewardGrades, 'grade')
    };
    return M._ix;
  }

  // ---------- 캐릭터·전투력 ----------
  /** 직업 전투력 = 기본 전투력 + 장착 장비 전투력 합 */
  function characterCp(M, jobId, invItems) {
    var cp = M.charBaseCp;
    invItems.forEach(function (it) {
      if (it.equipped_job_id === jobId && !it.sold_at) cp += Number(it.cp);
    });
    return cp;
  }
  /** 현재 전투력으로 쓸 수 있는 최고 스킬 (R-30: 매번 계산) */
  function topSkill(M, jobId, cp) {
    var best = null;
    M.skills.forEach(function (s) {
      if (s.jobId === jobId && cp >= s.unlockCp && (!best || s.stage > best.stage)) best = s;
    });
    return best;
  }
  /** 레이드 기준 데미지 (R-02) = 전투력 × 최고 스킬 계수 × 직업 계수 */
  function baseDamage(M, jobId, cp) {
    var s = topSkill(M, jobId, cp), job = index(M).job[jobId];
    return Math.round(cp * s.coef * job.dmgCoef);
  }

  // ---------- 사냥 (R-22) ----------
  function huntTierOf(M, course) { return index(M).tier[course.star]; }
  function huntEfficiency(M, cp, course) {
    var t = huntTierOf(M, course), k = M.huntConst;
    return Math.max(k.minEfficiency, Math.min(1, Math.pow(cp / t.recCp, 2)));
  }
  function canEnterCourse(M, cp, course) { return cp >= huntTierOf(M, course).entryCp; }
  function familyPick(M, r, regionId) {
    var reg = index(M).region[regionId], fams = ['IRON', 'LEATHER', 'CLOTH'];
    if (!reg || reg.mainFamily === 'ALL') return fams[Math.floor(r() * 3)];
    if (r() < M.huntConst.regionMainShare) return reg.mainFamily;
    var others = fams.filter(function (f) { return f !== reg.mainFamily; });
    return others[Math.floor(r() * others.length)];
  }
  /**
   * 완료 틱 수. tutorial=true면 1분=1틱, 최대 6틱(R-25).
   */
  function huntTicks(M, startedAtMs, nowMs, tutorial) {
    var tickMs = (tutorial ? 1 : M.huntConst.tickMinutes) * 60000;
    var max = tutorial ? 6 : M.huntConst.maxTicks;
    return Math.max(0, Math.min(max, Math.floor((nowMs - startedAtMs) / tickMs)));
  }
  /** 사냥 보상 계산: 세션 ID 시드로 틱마다 같은 결과 */
  function huntRewards(M, session, ticks) {
    var course = index(M).course[session.course_id], t = huntTierOf(M, course);
    var eff = huntEfficiency(M, Number(session.cp_at_start), course);
    var r = rng('hunt:' + session.seed), out = { gold: 0, materials: {}, items: [], ticks: ticks, efficiency: eff };
    for (var i = 0; i < ticks; i++) {
      out.gold += Math.round(t.goldPerTick * eff);
      for (var d = 0; d < t.dropsPerTick; d++) {
        if (r() >= eff) continue;
        var tier = pickIndexByProb(r, t.tierProb) + 1;
        var id = 'MAT-' + familyPick(M, r, course.regionId) + '-' + tier;
        out.materials[id] = (out.materials[id] || 0) + 1;
      }
      if (r() < t.equipDropProb * eff) out.items.push(randomItem(M, r, session.job_id, t.equipGrade).id);
    }
    return out;
  }
  function randomItem(M, r, jobId, grade) {
    var list = M.items.filter(function (x) { return x.jobId === jobId && x.grade === grade; });
    return list[Math.floor(r() * list.length)];
  }

  // ---------- 제작·합성·판매 ----------
  /** 부족 재료 목록(빈 배열이면 제작 가능) */
  function craftShortage(M, itemId, wallet, mats) {
    var rc = index(M).recipe[itemId], need = [];
    if (!rc) return [{ id: 'RECIPE', need: 1, have: 0 }];
    var have = function (id) { return Number(mats[id] || 0); };
    if (have(rc.mainMaterialId) < rc.mainQty) need.push({ id: rc.mainMaterialId, need: rc.mainQty, have: have(rc.mainMaterialId) });
    if (rc.subMaterialId && have(rc.subMaterialId) < rc.subQty) need.push({ id: rc.subMaterialId, need: rc.subQty, have: have(rc.subMaterialId) });
    if (Number(wallet.gold) < rc.gold) need.push({ id: 'GOLD', need: rc.gold, have: Number(wallet.gold) });
    return need;
  }
  function craftResult(M, itemId, seed) {
    var it = index(M).item[itemId], g = index(M).equipGrade[it.grade];
    var great = rng('craft:' + seed)() < g.greatProb;
    return { great: great, cp: Math.round(it.cp * (great ? 1 + g.greatBonus : 1)) };
  }
  function composeCost(M, materialId) {
    var m = index(M).material[materialId];
    var row = M.compose.filter(function (c) { return c.resultTier === m.tier; })[0];
    if (!row) return null;
    return { fromId: 'MAT-' + m.family + '-' + (m.tier - 1), qty: row.needQty, gold: row.gold };
  }
  function sellPrice(M, itemId) { return index(M).equipGrade[index(M).item[itemId].grade].sellPrice; }

  // ---------- 레이드 준비 ----------
  function settingScore(M, key) {
    var s = M.settingOptions.filter(function (o) { return o.key === key; })[0];
    return s ? s.score : 0;
  }
  function randomSettings(M, r, scope, gender) {
    var items = {};
    M.settingOptions.forEach(function (o) {
      if (o.scope !== scope) return;
      if (o.item.indexOf('티 위치') === 0 && o.item !== '티 위치(' + (gender === 'F' ? '여' : '남') + ')') return;
      (items[o.item] = items[o.item] || []).push(o);
    });
    var out = {};
    Object.keys(items).forEach(function (k) { out[k] = pickWeighted(r, items[k], function (o) { return o.weight; }).option; });
    return out;
  }
  function settingsScore(M, settings) {
    var sum = 0;
    Object.keys(settings).forEach(function (k) { sum += settingScore(M, k + '|' + settings[k]); });
    return sum;
  }
  function zoneOf(M, score) {
    var z = M.diffZones.slice().sort(function (a, b) { return a.minScore - b.minScore; }), out = z[0];
    z.forEach(function (x) { if (score >= x.minScore) out = x; });
    return out;
  }
  function partyRow(M, size) { return M.partySize.filter(function (p) { return p.size === size; })[0]; }
  function varietyBonus(M, jobs) {
    var n = {}; jobs.forEach(function (j) { n[j] = 1; });
    var k = Object.keys(n).length, b = 0;
    M.jobVarietyBonus.forEach(function (v) { if (k >= v.distinctJobs) b = v.dmgBonus; });
    return b;
  }
  /**
   * 라운드 준비(R-10): 참가자 스냅샷 + 코스·설정·구간·보스 HP를 시드로 고정.
   * participants: [{slot, member_id|guest_id, nickname, is_guest, job_id, cp, grade_code, gender}]
   * opts.demo = true 이면 고정 시나리오(R-36)
   */
  function setupRound(M, participants, seed, opts) {
    opts = opts || {};
    var ix = index(M), r = rng('round:' + seed);
    var course = opts.courseId ? ix.raidCourse[opts.courseId]
      : pickWeighted(r, M.raidCourses, function (c) { return c.weight; });
    var room = opts.roomSettings || randomSettings(M, r, 'ROOM');
    var ps = participants.map(function (p) {
      var personal = p.personal_settings || randomSettings(M, r, 'PERSONAL', p.gender);
      var sk = topSkill(M, p.job_id, Number(p.cp));
      return Object.assign({}, p, {
        personal_settings: personal, personal_score: settingsScore(M, personal),
        top_skill_id: sk.id, base_damage: baseDamage(M, p.job_id, Number(p.cp))
      });
    });
    var personalAvg = Math.round(ps.reduce(function (a, p) { return a + p.personal_score; }, 0) / ps.length * 10) / 10;
    var courseScore = (course.courseDiff + course.greenDiff) * M.raidConst.diffScoreMult;
    var diffScore = Math.round((courseScore + settingsScore(M, room) + personalAvg) * 10) / 10;
    var zone = zoneOf(M, diffScore), boss = ix.boss[ix.region[course.regionId].bossId];
    var size = partyRow(M, ps.length);
    var hp = Math.round(ps.reduce(function (a, p) { return a + p.base_damage; }, 0) * 18 * M.raidConst.targetRatio
      * zone.hpCoef * size.hpCoef * (course.regionId === 'VIRTUAL' ? M.raidConst.finalBossHpMult : 1));
    return {
      course_id: course.courseId, course_name: course.name, region_id: course.regionId, boss_id: boss.id,
      room_settings: room, diff_score: diffScore, course_score: courseScore, personal_avg: personalAvg,
      zone: zone.zone, boss_hp: hp, participants: ps,
      job_bonus: varietyBonus(M, ps.map(function (p) { return p.job_id; })),
      skill_schedule: bossSkillSchedule(M, seed)
    };
  }
  /** 3홀마다 보스 스킬(1·4·7·10·13·16번 홀 시작) 순수 랜덤 */
  function bossSkillSchedule(M, seed) {
    var r = rng('bossskill:' + seed), out = [], every = M.raidConst.bossSkillInterval;
    for (var h = 1; h <= 18; h += every) out.push({ fromHole: h, skillId: pickWeighted(r, M.bossSkills, function (s) { return s.weight; }).id });
    return out;
  }
  function skillAtHole(schedule, hole) {
    var cur = null;
    schedule.forEach(function (s) { if (hole >= s.fromHole) cur = s; });
    return cur ? cur.skillId : null;
  }

  // ---------- 자동치기·홀 결과 ----------
  var BUCKETS = [['eagle', -2], ['birdie', -1], ['par', 0], ['bogey', 1], ['double', 2], ['triple', 3], ['quad', 4]];
  /** 등급 확률표로 타수 추첨 + 의외성(버디~트리플 균등) */
  function autoStrokes(M, gradeCode, par, r) {
    var g = index(M).grade[gradeCode], off;
    if (r() < M.autoplay.surpriseProb) off = randInt(r, -1, 3);
    else off = BUCKETS[pickIndexByProb(r, BUCKETS.map(function (b) { return g.prob[b[0]] || 0; }))][1];
    return Math.min(par * 2, Math.max(1, par + off));
  }
  /** 결과 분류(R-03): 타수 ≥ 파×2 → 양파 */
  function holeResult(M, gradeCode, par, strokes) {
    var g = index(M).grade[gradeCode], key = strokes >= par * 2 ? 'DOUBLE_PAR' : String(Math.max(-3, Math.min(4, strokes - par)));
    var row = M.scoreRatios[key];
    return { key: key, label: row.result, ratio: row[g.group] };
  }
  /** 보스 스킬 계수(R-04) */
  function skillCoef(M, skillId, ctx, r) {
    var job = index(M).job[ctx.jobId], at = job.attackType, has = ctx.partyJobs;
    switch (skillId) {
      case 'SHIELD': return has.WAR ? 0.85 : 0.7;
      case 'MAGIC_BARRIER': return at === 'MAGIC' ? 0.5 : at === 'MIXED' ? 0.75 : 1;
      case 'PHYS_BARRIER': return at === 'PHYS' ? 0.5 : at === 'MIXED' ? 0.75 : 1;
      case 'THORNS': return ctx.ratio < 1 ? 0.5 : 1;
      case 'WEAKNESS': return ctx.ratio > 1 ? (has.ARC ? 2.5 : 2.0) : 1;
      case 'FOG': return Math.round((0.8 + r() * 0.4) * 100) / 100;
      case 'PAR3_DUEL': return ctx.par === 3 && ctx.strokes <= 3 ? 1.5 : 1;
      default: return 1;
    }
  }
  function spMult(M, r) { return pickWeighted(r, M.sp.mults, function (m) { return m.weight; }).mult; }
  function spGain(M, ratio) { return Math.ceil(ratio * 100 * M.sp.recoverRatio); }

  /**
   * 레이드 진행 시뮬레이션(R-01, R-05~R-09, R-11, R-12).
   * round: setupRound 결과 + seed + is_demo. untilIndex: 확정할 결과 개수(홀×인원 순서, 0..18*n).
   * spRequests: [{slot, atIndex}] — 결과 index atIndex 시점에 누른 SP 사용(R-07).
   * 같은 입력이면 항상 같은 결과를 돌려준다(시드 고정).
   */
  function simulateRound(M, round, untilIndex, spRequests) {
    var ps = round.participants, n = ps.length, course = index(M).raidCourse[round.course_id];
    var partyJobs = {}; ps.forEach(function (p) { partyJobs[p.job_id] = true; });
    var maxHp = round.boss_hp, hp = maxHp, regen = 0, total = 0, killedAt = null;
    var sp = ps.map(function () { return 0; }), pending = ps.map(function () { return false; });
    var reqs = (spRequests || []).slice().sort(function (a, b) { return a.atIndex - b.atIndex; }), ri = 0;
    var results = [], spLog = [];
    var limit = Math.min(untilIndex, 18 * n);
    for (var idx = 0; idx < limit; idx++) {
      var hole = Math.floor(idx / n) + 1, slot = idx % n, p = ps[slot], par = course.par[hole - 1];
      // 이 결과 확정 전에 들어온 SP 사용 요청 반영
      while (ri < reqs.length && reqs[ri].atIndex <= idx) {
        var q = reqs[ri++];
        if (sp[q.slot] >= M.sp.max && !pending[q.slot]) { pending[q.slot] = true; sp[q.slot] = 0; spLog.push({ slot: q.slot, atIndex: q.atIndex }); }
      }
      var skillId = skillAtHole(round.skill_schedule, hole);
      if (slot === 0 && (hole - 1) % M.raidConst.bossSkillInterval === 0 && skillId === 'REGEN' && !partyJobs.ROG) {
        var heal = Math.min(Math.round(maxHp * 0.05), maxHp - Math.max(0, hp));
        if (hp > 0 && heal > 0) { hp += heal; regen += heal; }
      }
      var r = rng('hole:' + round.seed + ':' + hole + ':' + slot);
      var strokes = autoStrokes(M, p.grade_code, par, r);
      var res = holeResult(M, p.grade_code, par, strokes);
      var coef = skillCoef(M, skillId, { jobId: p.job_id, partyJobs: partyJobs, ratio: res.ratio, par: par, strokes: strokes }, r);
      var mult = 1, spBefore = sp[slot], used = false;
      if (pending[slot]) { mult = spMult(M, r); pending[slot] = false; used = true; }
      var dmg = Math.round(p.base_damage * res.ratio * coef * (1 + round.job_bonus) * mult);
      sp[slot] = Math.min(M.sp.max, sp[slot] + spGain(M, res.ratio));
      if (p.is_guest && sp[slot] >= M.sp.max && !pending[slot]) { pending[slot] = true; sp[slot] = 0; } // 게스트 자동 사용(R-07)
      total += dmg;
      results.push({ index: idx, hole: hole, slot: slot, par: par, strokes: strokes, result: res.label, result_key: res.key,
        ratio: res.ratio, boss_skill_id: skillId, skill_coef: coef, sp_before: spBefore, sp_used: used, sp_mult: mult,
        sp_after: sp[slot], damage: dmg, base_damage: p.base_damage, job_bonus: round.job_bonus });
      if (slot === n - 1) { // 홀 단위 차감(R-08)
        var holeDmg = results.slice(-n).reduce(function (a, x) { return a + x.damage; }, 0);
        hp -= holeDmg;
        if (hp <= 0 && killedAt === null) killedAt = hole;
      }
    }
    // 아직 결과가 확정되지 않은 시점에 누른 SP 사용도 '예약' 상태로 반영
    while (ri < reqs.length && reqs[ri].atIndex <= limit) {
      var q2 = reqs[ri++];
      if (sp[q2.slot] >= M.sp.max && !pending[q2.slot]) { pending[q2.slot] = true; sp[q2.slot] = 0; spLog.push({ slot: q2.slot, atIndex: q2.atIndex }); }
    }
    var done = limit >= 18 * n;
    return {
      results: results, confirmed: limit, total_damage: total, boss_hp_left: Math.max(0, hp), boss_hp_max: maxHp,
      regen_total: regen, killed_at: killedAt, sp: sp, sp_pending: pending, sp_log: spLog, finished: done,
      ratio: total / (maxHp + regen)
    };
  }
  /** 결과 확정 시각(R-11): 결과 index i는 시작 + (i+1) × 1인 시간 */
  function indexAt(M, round, nowMs) {
    var per = (round.is_demo ? M.raidConst.demoSecondsPerPlayerHole : M.raidConst.autoMinutesPerPlayerHole * 60) * 1000;
    return Math.max(0, Math.min(18 * round.participants.length, Math.floor((nowMs - round.started_at_ms) / per)));
  }

  // ---------- 보상 (R-09, R-16, R-31) ----------
  function rewardGradeByRatio(M, ratio) {
    var g = M.rewardGrades[0];
    M.rewardGrades.forEach(function (x) { if (ratio >= x.minRatio) g = x; });
    return g;
  }
  function finalRewardGrade(M, ratio, zoneId) {
    var zone = M.diffZones.filter(function (z) { return z.zone === zoneId; })[0];
    var byRatio = rewardGradeByRatio(M, ratio);
    return index(M).rewardGrade[Math.min(byRatio.grade, zone.maxRewardGrade)];
  }
  /** 상자 내용 확정(R-31). jobIds: 참가한 내 캐릭터 직업 */
  function chestContents(M, gradeNo, zoneId, partySize, regionId, jobId, seed) {
    var g = index(M).rewardGrade[gradeNo], zone = M.diffZones.filter(function (z) { return z.zone === zoneId; })[0];
    var r = rng('chest:' + seed), bonus = zone.rewardBonus + partyRow(M, partySize).rewardBonus;
    var qty = Math.round(randInt(r, g.qtyMin, g.qtyMax) * (1 + bonus)), mats = {};
    for (var i = 0; i < qty; i++) {
      var tier = pickIndexByProb(r, g.tierProb) + 1, id = 'MAT-' + familyPick(M, r, regionId) + '-' + tier;
      mats[id] = (mats[id] || 0) + 1;
    }
    var items = r() < g.equipDropProb ? [randomItem(M, r, jobId, g.equipGrade).id] : [];
    return { grade: gradeNo, gold: g.gold, materials: mats, items: items };
  }

  return {
    rng: rng, pickWeighted: pickWeighted, index: index,
    characterCp: characterCp, topSkill: topSkill, baseDamage: baseDamage,
    huntEfficiency: huntEfficiency, canEnterCourse: canEnterCourse, huntTicks: huntTicks, huntRewards: huntRewards,
    craftShortage: craftShortage, craftResult: craftResult, composeCost: composeCost, sellPrice: sellPrice,
    setupRound: setupRound, simulateRound: simulateRound, indexAt: indexAt, skillAtHole: skillAtHole,
    holeResult: holeResult, rewardGradeByRatio: rewardGradeByRatio, finalRewardGrade: finalRewardGrade,
    chestContents: chestContents, zoneOf: zoneOf, settingsScore: settingsScore
  };
})();
if (typeof module !== 'undefined') module.exports = Engine;
