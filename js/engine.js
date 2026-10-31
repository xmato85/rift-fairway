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
  /** 계정 합산 전투력(C-5 랭킹) = 4직업 전투력 합 */
  function accountCp(M, invItems) {
    return M.jobs.reduce(function (a, j) { return a + characterCp(M, j.id, invItems); }, 0);
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
   * 완료 틱 수(v0.5 B-18): 일반은 5분 틱·최대 96틱.
   * tutorial=true(세션 시드 'T-')면 시작 30초 뒤 12틱 고정(그 전 0), 최대 12틱(C-2).
   */
  function huntTicks(M, startedAtMs, nowMs, tutorial) {
    var el = nowMs - startedAtMs;
    if (tutorial) { var tu = M.tutorial; return el >= tu.trialWaitSeconds * 1000 ? tu.trialTicks : 0; }
    return Math.max(0, Math.min(M.huntConst.maxTicks, Math.floor(el / (M.huntConst.tickMinutes * 60000))));
  }
  function huntMaxTicks(M, tutorial) { return tutorial ? M.tutorial.trialTicks : M.huntConst.maxTicks; }
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
      // 균열 파편(C-3): 3~5성만, 틱당 specialDropProb × 효율
      if (t.specialDropProb > 0 && r() < t.specialDropProb * eff) out.materials[t.specialMaterialId] = (out.materials[t.specialMaterialId] || 0) + 1;
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
    if (rc.specialMaterialId && have(rc.specialMaterialId) < rc.specialQty) need.push({ id: rc.specialMaterialId, need: rc.specialQty, have: have(rc.specialMaterialId), special: true });
    if (Number(wallet.gold) < rc.gold) need.push({ id: 'GOLD', need: rc.gold, have: Number(wallet.gold) });
    return need;
  }
  function craftResult(M, itemId, seed) {
    var it = index(M).item[itemId], g = index(M).equipGrade[it.grade];
    var great = rng('craft:' + seed)() < g.greatProb;
    return { great: great, cp: Math.round(it.cp * (great ? 1 + g.greatBonus : 1)) };
  }
  /** 재료 소비량(제작 시 차감): { 재료ID: 수량 } */
  function craftCost(M, itemId) {
    var rc = index(M).recipe[itemId], o = {};
    o[rc.mainMaterialId] = rc.mainQty;
    if (rc.subMaterialId && rc.subQty) o[rc.subMaterialId] = (o[rc.subMaterialId] || 0) + rc.subQty;
    if (rc.specialMaterialId && rc.specialQty) o[rc.specialMaterialId] = (o[rc.specialMaterialId] || 0) + rc.specialQty;
    return o;
  }
  /** 5:1 상위 합성 비용. 기본 재료 2~5티어, 특수 재료 RIFT 4(결정)·5(핵). 하위 재료가 없으면 null */
  function composeCost(M, materialId) {
    var ix = index(M), m = ix.material[materialId];
    if (!m) return null;
    var row = M.compose.filter(function (c) { return c.resultTier === m.tier; })[0], fromId = 'MAT-' + m.family + '-' + (m.tier - 1);
    if (!row || !ix.material[fromId]) return null;
    return { fromId: fromId, qty: row.needQty, gold: row.gold };
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

  // ---------- v0.5 샷·스코어 연동 레이드 (C-6, C-7, C-9, D-3) ----------
  var QUALITIES = ['NORMAL', 'STRONG', 'CRIT'];
  var CLUB_NAME = { DRIVER: '드라이버', IRON: '아이언', WOOD: '우드', PUTTER: '퍼터' };
  // 결과에 따라 달라지는 스킬은 샷에 1, 홀 종료 T에서만 반영(C-6 K샷)
  var RATIO_DEP_SKILL = { THORNS: 1, WEAKNESS: 1, PAR3_DUEL: 1 };
  var DEFAULT_TEE = { 3: 150, 4: 350, 5: 480 };
  /** 홀 결과(타수−PAR)별 샷 품질 분포 [가정, F-1]: 일반/강타/크리티컬 */
  function qualityProb(off) {
    if (off <= -1) return [0.40, 0.40, 0.20];
    if (off === 0) return [0.55, 0.33, 0.12];
    if (off === 1) return [0.63, 0.29, 0.08];
    return [0.72, 0.24, 0.04];
  }
  /** 클럽 순서(C-6 자동치기): 첫 샷 PAR3 아이언·PAR4/5 드라이버, 마지막 퍼트 수, 그 사이 아이언·우드 */
  function clubSequence(par, strokes) {
    var putts = strokes >= 3 ? (strokes <= par - 2 ? 1 : 2) : (strokes === 2 ? 1 : 0);
    var out = [];
    for (var k = 0; k < strokes; k++) {
      if (k >= strokes - putts) out.push('PUTTER');
      else if (k === 0) out.push(par === 3 ? 'IRON' : 'DRIVER');
      else out.push('IRON');
    }
    return out;
  }
  function shotGradeOf(M, gradeCode) { return M.shotGrade[index(M).grade[gradeCode].group]; }
  /**
   * 샷 품질 판정(C-6 클럽별 간이 기준). data: {dist, angle, remain, ball_speed}
   * ctx: {holeout, prevRemain(직전 남은 거리 = 파3 티샷은 티 거리), puttIndex(1=첫 퍼트)}
   * 반환: 'NORMAL' | 'STRONG' | 'CRIT'
   * 홀아웃 샷도 일반 판정(E-23 변경): 퍼터는 퍼터 규칙, 퍼터가 아닌 홀아웃(칩인·홀인원)은 남은 거리 0이라 방향각만 본다.
   */
  function judgeShot(M, gradeCode, club, data, ctx) {
    ctx = ctx || {};
    var g = shotGradeOf(M, gradeCode)[club === 'WOOD' ? 'IRON' : club], ang = Math.abs(Number(data.angle));
    if (ctx.holeout && club !== 'PUTTER') return ang <= g.angle / 2 ? 'CRIT' : ang <= g.angle ? 'STRONG' : 'NORMAL';
    if (club === 'DRIVER') {
      if (data.dist >= g.critDist && ang <= g.angle / 2) return 'CRIT';
      if (data.dist >= g.strongDist && ang <= g.angle) return 'STRONG';
      return 'NORMAL';
    }
    if (club === 'PUTTER') {
      if (ctx.puttIndex === 1) {
        var feel = data.dist / ctx.prevRemain;
        if (feel >= g.feelCrit[0] && feel <= g.feelCrit[1] && ang <= g.angle) return 'CRIT';
        if (feel >= g.feelStrong[0] && feel <= g.feelStrong[1]) return 'STRONG';
        return 'NORMAL';
      }
      return ang <= g.angle ? 'STRONG' : 'NORMAL'; // 2번째 이후: 크리티컬 없음(최대 강타)
    }
    // 아이언·우드: 남은 거리 감소율 + 방향각, 크리티컬은 그린 근접 거리
    var reduce = (ctx.prevRemain - data.remain) / ctx.prevRemain;
    if (data.remain <= g.nearDist && ang <= g.angle / 2) return 'CRIT';
    if (reduce >= g.strongReduce && ang <= g.angle) return 'STRONG';
    return 'NORMAL';
  }
  function r1(x) { return Math.round(x * 10) / 10; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function shapeOf(club, angle) {
    if (club === 'PUTTER') return Math.abs(angle) <= 1 ? '퍼트 정타' : angle < 0 ? '퍼트 당김' : '퍼트 밀림';
    var a = Math.abs(angle);
    if (a <= 1.5) return '스트레이트';
    if (angle < 0) return a <= 6 ? '드로우' : '훅';
    return a <= 6 ? '페이드' : '슬라이스';
  }
  /** 품질에 맞는 샷데이터 1회 생성(반올림 전 값). role: 'layup' | 'approach'(다음이 퍼트) | 'holeout' */
  function rawShotData(g, club, q, role, prev, L, r) {
    var rr = function (a, b) { return a + r() * (b - a); }, sg = r() < 0.5 ? -1 : 1, d = {};
    if (club === 'DRIVER') {
      var a = g.angle, sd = g.strongDist, cd = g.critDist, pref = role === 'holeout' ? L : role === 'approach' ? L - rr(3, 15) : null, dist, ang;
      if (role === 'holeout') { dist = L; ang = holeoutAngle(q, a, rr); }
      else if (q === 'CRIT') { dist = Math.max(pref || 0, cd + rr(0.5, 15)); ang = rr(0, a * 0.45); }
      else if (q === 'STRONG') {
        dist = pref === null ? rr(sd + 0.5, cd - 0.5) : Math.max(pref, sd + rr(0.5, 6));
        ang = dist >= cd ? rr(a * 0.55, a * 0.95) : rr(0, a * 0.95);
      } else {
        dist = pref === null ? sd - rr(5, 45) : pref;
        ang = dist >= sd ? rr(a * 1.1, a * 2.2) : rr(0, a * 2);
      }
      d.dist = dist; d.angle = sg * ang; d.remain = role === 'holeout' ? 0 : Math.max(1, Math.abs(L - dist));
      d.ball_speed = dist / 3.3 + rr(-2, 2);
    } else if (club === 'IRON') {
      var ia = g.angle, ca = ia / 2, nd = g.nearDist, sr = g.strongReduce, cur, an;
      if (role === 'holeout') { cur = 0; an = holeoutAngle(q, ia, rr); }
      else if (q === 'CRIT') { cur = rr(0.5, Math.max(0.6, Math.min(nd, prev) * 0.9)); an = rr(0, ca * 0.9); }
      else if (q === 'STRONG') {
        var maxCur = prev * (1 - sr) * 0.97, lo = nd * 1.05 + 0.3;
        if (maxCur > lo + 0.5) { cur = role === 'approach' ? rr(lo, Math.min(maxCur, nd + 15)) : rr(Math.max(lo, maxCur * 0.5), maxCur); an = rr(0, ia * 0.95); }
        else { cur = rr(maxCur * 0.3, maxCur); an = rr(ca * 1.1, ia * 0.95); }
      } else {
        if (role === 'approach') { cur = rr(nd * 1.05 + 0.3, nd + 20); an = rr(ia * 1.1, ia * 2.5); }
        else {
          cur = Math.max(2, prev * (1 - rr(0.3, sr * 0.9)));
          an = (prev - cur) / prev >= sr * 0.97 || cur <= nd * 1.05 ? rr(ia * 1.1, ia * 2.5) : rr(0, ia * 1.5);
        }
      }
      d.dist = role === 'holeout' ? prev : Math.max(1, Math.abs(prev - cur)); d.angle = sg * an; d.remain = cur;
      d.ball_speed = 18 + d.dist / 3 + rr(-1.5, 1.5);
    } else { // PUTTER
      var pa = g.angle, feel, pan;
      if (q === 'CRIT') { feel = rr(g.feelCrit[0] + 0.01, g.feelCrit[1] - 0.01); pan = rr(0, pa * 0.9); }
      else if (q === 'STRONG') { feel = r() < 0.5 ? rr(g.feelStrong[0] + 0.005, g.feelCrit[0] - 0.005) : rr(g.feelCrit[1] + 0.005, g.feelStrong[1] - 0.005); pan = rr(0, pa * 2); }
      else { feel = r() < 0.5 ? rr(0.6, g.feelStrong[0] - 0.02) : rr(g.feelStrong[1] + 0.02, 1.5); pan = rr(0, pa * 2.5); }
      d.dist = prev * feel; d.angle = sg * pan; d.remain = null;
      d.ball_speed = 0.8 + d.dist * 0.35 + rr(-0.1, 0.1);
    }
    return d;
  }
  /** 퍼터가 아닌 홀아웃 샷의 방향각(품질별: 크리티컬 ≤ 허용치/2, 강타 ≤ 허용치, 일반 > 허용치) */
  function holeoutAngle(q, a, rr) { return q === 'CRIT' ? rr(0, a * 0.45) : q === 'STRONG' ? rr(a * 0.55, a * 0.95) : rr(a * 1.1, a * 2.2); }
  /** 2번째 이후 퍼트(방향각만 판정) */
  function rawLaterPutt(g, q, role, r) {
    var rr = function (a, b) { return a + r() * (b - a); }, sg = r() < 0.5 ? -1 : 1, pa = g.angle;
    var dist = rr(0.4, 3), ang = q === 'NORMAL' ? rr(pa * 1.1, pa * 3) : rr(0, pa * 0.95);
    return { dist: dist, angle: sg * ang, remain: null, ball_speed: 0.8 + dist * 0.35 };
  }
  /** 샷데이터 생성: 반올림한 값으로 judgeShot이 같은 품질을 돌려줄 때까지 재시도(결정적) */
  function makeShotData(M, gradeCode, club, q, role, prev, L, puttIndex, r) {
    var g = shotGradeOf(M, gradeCode)[club], ctx = { holeout: role === 'holeout', prevRemain: prev, puttIndex: puttIndex }, d, raw;
    for (var tries = 0; tries < 20; tries++) {
      raw = club === 'PUTTER' && puttIndex > 1 ? rawLaterPutt(g, q, role, r) : rawShotData(g, club, q, role, prev, L, r);
      d = { dist: club === 'PUTTER' ? r2(raw.dist) : r1(raw.dist), angle: r1(raw.angle), remain: raw.remain === null ? null : r2(raw.remain),
        ball_speed: r1(raw.ball_speed), head_speed: club === 'PUTTER' ? null : r1(raw.ball_speed / (club === 'DRIVER' ? 1.45 : 1.3)) };
      if (d.remain !== null && role !== 'holeout' && d.remain <= 0) d.remain = 0.05;
      if (judgeShot(M, gradeCode, club, d, ctx) === q) break;
      d = null;
    }
    if (!d) { d = raw; } // 반올림 때문에 경계를 넘는 드문 경우: 반올림하지 않은 값 사용
    d.shape = shapeOf(club, d.angle);
    return d;
  }
  /** 등급·PAR별 기대 타수 N̄·기대 결과 비율 R̄(M.shotExp, build_master.py가 등급 확률표에서 계산) */
  function shotExp(M, gradeCode, par) { return M.shotExp[gradeCode][String(par)]; }
  function teeLength(course, hole) {
    var t = course.tees && course.tees.White, v = t ? Number(t[hole - 1]) : 0;
    return v > 0 ? v : DEFAULT_TEE[course.par[hole - 1]] || 350;
  }

  /**
   * 라운드 계획(결정적, 캐시): 홀·참가자별 타수(v0.3과 같은 시드·autoStrokes) → 클럽·품질·샷데이터 → 이벤트 목록.
   * 이벤트: 홀마다 참가 순서로 1샷씩 돌아가며(홀아웃한 사람 건너뜀) → 홀 종료 1개. 샷 5초·홀 종료 3초(raidConst).
   */
  function buildPlan(M, round) {
    if (round._plan && round._plan.seed === round.seed) return round._plan;
    var ps = round.participants, n = ps.length, course = index(M).raidCourse[round.course_id], rc = M.raidConst;
    var partyJobs = {}; ps.forEach(function (p) { partyJobs[p.job_id] = true; });
    var holes = [], events = [], ends = [], t = 0, shotMs = rc.autoSecondsPerShot * 1000, endMs = rc.holeEndSeconds * 1000;
    for (var h = 1; h <= 18; h++) {
      var par = course.par[h - 1], L = teeLength(course, h), skillId = skillAtHole(round.skill_schedule, h);
      var players = ps.map(function (p, slot) {
        var r = rng('hole:' + round.seed + ':' + h + ':' + slot);
        var strokes = autoStrokes(M, p.grade_code, par, r);
        var res = holeResult(M, p.grade_code, par, strokes);
        var coef = skillCoef(M, skillId, { jobId: p.job_id, partyJobs: partyJobs, ratio: res.ratio, par: par, strokes: strokes }, r);
        var clubs = clubSequence(par, strokes), rq = rng('q:' + round.seed + ':' + h + ':' + slot), rd = rng('shot:' + round.seed + ':' + h + ':' + slot);
        var qp = qualityProb(strokes - par), prev = L, putt = 0, shots = [];
        for (var k = 0; k < strokes; k++) {
          var holeout = k === strokes - 1, club = clubs[k];
          var q = QUALITIES[pickIndexByProb(rq, qp)]; // 홀아웃 샷도 같은 분포(E-23 변경)
          var role = holeout ? 'holeout' : clubs[k + 1] === 'PUTTER' ? 'approach' : 'layup';
          if (club === 'PUTTER') putt++;
          if (club === 'PUTTER' && putt > 1 && q === 'CRIT') q = 'STRONG'; // 2번째 이후 퍼트는 최대 강타(C-6)
          var data = makeShotData(M, p.grade_code, club, q, role, prev, L, putt, rd);
          var shown = club === 'IRON' && prev >= 200 ? 'WOOD' : club;
          shots.push({ hole: h, slot: slot, seq: k + 1, club: club, club_name: CLUB_NAME[shown], quality: q, holeout: holeout,
            prev_remain: prev, putt_index: club === 'PUTTER' ? putt : 0, data: data });
          if (club !== 'PUTTER') prev = holeout ? 0 : data.remain;
        }
        var ex = shotExp(M, p.grade_code, par);
        return { slot: slot, strokes: strokes, result: res.label, result_key: res.key, ratio: res.ratio, coef: coef,
          coef_shot: RATIO_DEP_SKILL[skillId] ? 1 : coef, exp_n: ex.N, exp_r: ex.R, shots: shots };
      });
      var first = events.length, maxS = 0;
      players.forEach(function (x) { maxS = Math.max(maxS, x.strokes); });
      for (var turn = 0; turn < maxS; turn++) {
        for (var s = 0; s < n; s++) {
          if (turn < players[s].strokes) { events.push({ type: 'SHOT', hole: h, slot: s, seq: turn + 1 }); t += shotMs; ends.push(t); }
        }
      }
      events.push({ type: 'HOLE_END', hole: h, slot: null, seq: null }); t += endMs; ends.push(t);
      holes.push({ hole: h, par: par, tee: L, skill_id: skillId, first_event: first, end_event: events.length - 1, players: players });
    }
    var plan = { seed: round.seed, holes: holes, events: events, ends: ends, total: events.length, party_jobs: partyJobs };
    try { Object.defineProperty(round, '_plan', { value: plan, enumerable: false, configurable: true, writable: true }); } catch (e) { round._plan = plan; }
    return plan;
  }
  /** 현재 이벤트 번호(D-3): 시작 시각부터 누적 길이로 완료된 이벤트 수 */
  function indexAt(M, round, nowMs) {
    var plan = buildPlan(M, round), el = nowMs - round.started_at_ms, lo = 0, hi = plan.total;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (plan.ends[mid] <= el) lo = mid + 1; else hi = mid; }
    return lo;
  }
  /** 이벤트 i가 끝나는 시각(시작 기준 ms). i = 처리한 이벤트 수 → 다음 이벤트 완료 시각 */
  function eventEndMs(M, round, i) { var plan = buildPlan(M, round); return i < plan.total ? plan.ends[i] : null; }

  /**
   * 레이드 결정적 재생(C-6, C-7, D-3). 이벤트 0..untilEvent-1을 순서대로 처리한다.
   * spRequests: [{slot, atEvent}] — atEvent번째 이벤트 처리 직전에 적용(조건 불충족이면 무시).
   * 게스트는 SP 100 도달 즉시 자동 사용, 사용자(게스트 아님)는 요청으로만 사용.
   * 같은 입력이면 항상 같은 결과.
   */
  function simulateRound(M, round, untilEvent, spRequests) {
    var plan = buildPlan(M, round), ps = round.participants, n = ps.length, rc = M.raidConst, J = round.job_bonus;
    var limit = Math.max(0, Math.min(untilEvent, plan.total));
    var maxHp = round.boss_hp, hp = maxHp, regen = 0, total = 0, killedAt = null, spMax = M.sp.max;
    var P = ps.map(function (p) {
      return { slot: p.slot, B: p.base_damage, guest: !!p.is_guest, sp: 0, pending: null, damage: 0, shot_damage: 0, hole_damage: 0,
        carry: 0, shots_done: 0, hole_gain: 0, hole_d: 0, hole_s: 0, hole_shots: 0, sp_hole_start: 0, sp_uses: 0 };
    });
    var reqs = (spRequests || []).slice().sort(function (a, b) { return a.atEvent - b.atEvent; }), ri = 0;
    var holesOut = [], shotsOut = [], spLog = [];
    function holeOfEvent(i) { return i < plan.total ? plan.events[i].hole : null; }
    function useSp(x, i, auto) {
      var hole = holeOfEvent(i);
      if (hole === null || x.sp < spMax || x.pending !== null) return false;
      x.sp = 0; x.pending = hole; x.sp_uses++;
      spLog.push({ slot: x.slot, at_event: i, hole: hole, auto: !!auto });
      return true;
    }
    function applyReqs(i) {
      while (ri < reqs.length && reqs[ri].atEvent <= i) { var q = reqs[ri++], x = P[q.slot]; if (x) useSp(x, i, false); }
    }
    for (var i = 0; i < limit; i++) {
      applyReqs(i);
      var ev = plan.events[i], H = plan.holes[ev.hole - 1];
      if (i === H.first_event) { // 홀 시작: 재생(REGEN, v0.3과 같음)·홀 누적값 초기화
        if ((ev.hole - 1) % rc.bossSkillInterval === 0 && H.skill_id === 'REGEN' && !plan.party_jobs.ROG) {
          var heal = Math.min(Math.round(maxHp * 0.05), maxHp - Math.max(0, hp));
          if (hp > 0 && heal > 0) { hp += heal; regen += heal; }
        }
        P.forEach(function (x) { x.hole_gain = 0; x.hole_d = 0; x.hole_s = 0; x.hole_shots = 0; x.sp_hole_start = x.sp; });
      }
      if (ev.type === 'SHOT') {
        var x = P[ev.slot], pl = H.players[ev.slot], sh = pl.shots[ev.seq - 1], qi = QUALITIES.indexOf(sh.quality);
        var Q = rc.shotQuality[sh.quality], k = pl.coef_shot * (1 + J);
        var unit = rc.shotAlpha * x.B * pl.exp_r / pl.exp_n * k, cap = rc.shotCap * rc.shotAlpha * x.B * pl.exp_r * k;
        var d = unit * Q, room = Math.max(0, cap - x.hole_d), capped = false;
        if (d > room) { d = room; capped = true; }
        var s = d / Q;
        x.hole_d += d; x.hole_s += s; x.shot_damage += d; x.damage += d; x.shots_done++; x.hole_shots++;
        hp -= d; total += d;
        if (hp <= 0 && killedAt === null) killedAt = ev.hole;
        var gain = Math.max(0, Math.min(rc.spShotGain[sh.quality], rc.spHoleCap - x.hole_gain));
        x.hole_gain += gain; x.sp = Math.min(spMax, x.sp + gain);
        var auto = false;
        if (x.guest && x.sp >= spMax && x.pending === null) auto = useSp(x, i, true); // 게스트 자동 사용(C-7)
        shotsOut.push({ index: i, hole: ev.hole, slot: ev.slot, seq: ev.seq, club: sh.club, club_name: sh.club_name, quality: sh.quality, holeout: sh.holeout,
          prev_remain: sh.prev_remain, putt_index: sh.putt_index, data: sh.data, unit: unit, q: Q, d: d, s: s, capped: capped,
          sp_gain: gain, sp_after: x.sp, sp_auto_used: auto, quality_index: qi });
      } else { // 홀 종료 정산: 참가 순서대로 R·K·m → T → E → 이월
        var rows = H.players.map(function (pl2, slot) {
          var y = P[slot], m = 1, used = false;
          if (y.pending === ev.hole) { m = spMult(M, rng('sp:' + round.seed + ':' + ev.hole + ':' + slot)); y.pending = null; used = true; }
          var T = y.B * pl2.ratio * pl2.coef * (1 + J) * m, carryIn = y.carry;
          var E = Math.max(0, T - y.hole_s - carryIn), carryOut = Math.max(0, y.hole_s + carryIn - T);
          y.carry = carryOut; y.hole_damage += E; y.damage += E; hp -= E; total += E;
          if (hp <= 0 && killedAt === null) killedAt = ev.hole;
          return { slot: slot, strokes: pl2.strokes, result: pl2.result, result_key: pl2.result_key, ratio: pl2.ratio, skill_id: H.skill_id,
            coef: pl2.coef, coef_shot: pl2.coef_shot, base_damage: y.B, job_bonus: J, sp_mult: m, sp_used: used, sp_before: y.sp_hole_start,
            sp_after: y.sp, T: T, shot_damage: y.hole_d, settle: y.hole_s, E: E, carry_in: carryIn, carry_out: carryOut, damage: y.hole_d + E };
        });
        holesOut.push({ hole: ev.hole, par: H.par, skill_id: H.skill_id, event: i, players: rows });
      }
    }
    applyReqs(limit); // 아직 처리 전인 다음 이벤트 직전에 누른 요청도 상태에 반영
    var done = limit >= plan.total, next = done ? null : plan.events[limit];
    var curHole = next ? next.hole : 18, curH = plan.holes[curHole - 1], started = !done && limit > curH.first_event;
    var players = P.map(function (x) {
      var st = x.pending !== null ? (x.pending === curHole && started ? 'WAIT' : 'RESERVED') : (!done && x.sp >= spMax ? 'READY' : 'CHARGING');
      var hp2 = curH.players[x.slot];
      return { slot: x.slot, damage: x.damage, shot_damage: x.shot_damage, hole_damage: x.hole_damage, sp: x.sp, sp_state: st,
        pending_hole: x.pending, carry: x.carry, sp_uses: x.sp_uses, shots_done: x.shots_done,
        hole_shots: started || (done) ? x.hole_shots : 0, hole_strokes: hp2.strokes, holed_out: !done && started && x.hole_shots >= hp2.strokes };
    });
    return {
      processed: limit, total_events: plan.total, finished: done,
      position: { hole: curHole, next_type: next ? next.type : null, next_slot: next ? next.slot : null, next_seq: next ? next.seq : null, hole_started: started },
      holes: holesOut, shots: shotsOut, players: players, sp_log: spLog,
      boss_hp_left: Math.max(0, hp), boss_hp_raw: hp, max_hp: maxHp, regen: regen, killed_at: killedAt, total: total,
      ratio: total / (maxHp + regen)
    };
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
    // 특수 재료(C-8): 기존 내용에 더함. 난이도·인원 보너스 미적용. 기본 내용과 다른 시드라 v0.3 내용은 그대로
    var r2s = rng('chestsp:' + seed), special = {};
    (g.special || []).forEach(function (sp) {
      var q = randInt(r2s, sp.min, sp.max);
      if (q > 0) special[sp.materialId] = (special[sp.materialId] || 0) + q;
    });
    return { grade: gradeNo, gold: g.gold, materials: mats, special: special, items: items };
  }

  return {
    rng: rng, pickWeighted: pickWeighted, index: index,
    characterCp: characterCp, topSkill: topSkill, baseDamage: baseDamage,
    huntEfficiency: huntEfficiency, canEnterCourse: canEnterCourse, huntTicks: huntTicks, huntMaxTicks: huntMaxTicks, huntRewards: huntRewards,
    craftShortage: craftShortage, craftCost: craftCost, craftResult: craftResult, composeCost: composeCost, sellPrice: sellPrice,
    setupRound: setupRound, simulateRound: simulateRound, indexAt: indexAt, eventEndMs: eventEndMs, skillAtHole: skillAtHole,
    buildPlan: buildPlan, judgeShot: judgeShot, clubSequence: clubSequence, shotExp: shotExp, accountCp: accountCp,
    holeResult: holeResult, rewardGradeByRatio: rewardGradeByRatio, finalRewardGrade: finalRewardGrade,
    chestContents: chestContents, zoneOf: zoneOf, settingsScore: settingsScore
  };
})();
if (typeof module !== 'undefined') module.exports = Engine;
