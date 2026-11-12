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
  /** 외형 단계·세트 효과(v0.6 B-30, C-2): 등급 g 이상 장비가 minParts(4)부위면 외형 g(0 기본~5 전설),
   *  현재 외형 등급 이상 부위 수가 setParts[k](6, 8…) 이상이면 세트 k+1. 부위가 늘면 setParts만 늘리면 됨 */
  function lookOf(M, jobId, invItems) {
    var L = M.lookStage || { minParts: 4, setParts: [6, 8] }, ix = index(M), grades = [];
    invItems.forEach(function (it) {
      if (it.equipped_job_id === jobId && !it.sold_at && ix.item[it.item_id]) grades.push(ix.item[it.item_id].grade);
    });
    var stage = 0;
    for (var g = 5; g >= 1; g--) if (grades.filter(function (x) { return x >= g; }).length >= L.minParts) { stage = g; break; }
    var n = stage ? grades.filter(function (x) { return x >= stage; }).length : 0, set = 0;
    L.setParts.forEach(function (p, k) { if (stage && n >= p) set = k + 1; });
    return { stage: stage, set: set, count: n, parts: grades.length };
  }
  /** 게스트처럼 장비 정보가 없는 참가자: 전투력 구간으로 외형 추정(기획 시트에서 바꿀 수 있음) */
  function lookByCp(M, cp) {
    var t = (M.lookStage && M.lookStage.guestCp) || [0, 400, 800, 1500, 2400, 3500], s = 0;
    t.forEach(function (v, i) { if (cp >= v) s = i; });
    return { stage: s, set: 0 };
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
      if (r() < bal(M).huntEquipProb * eff) out.items.push(randomItem(M, r, session.job_id, t.equipGrade).id); // v1.0: 완제품은 아주 희소하게
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

  // ---------- v1.0 밸런스(실연동 기준: 레이드 1회 = 1인 1시간 + 매장 비용) ----------
  // master.json에 balance가 있으면 그 값을, 없으면 아래 기본값을 씀(기획 시트 '밸런스 v1.0' 탭과 같은 값)
  var BAL10 = {
    huntEquipProb: 0.0003,                                   // 사냥 5분 1회당 완제품 확률(모든 별)
    chestQty: { 1: 15, 2: 20, 3: 25, 4: 30, 5: 40 },          // 상자 등급별 재료 수
    chestJobShare: 0.7,                                      // 대표(참가) 직업 필요 재료 비율
    chestTargetTierShare: 0.7,                               // 다음 제작 등급 재료 비율(나머지는 한 단계 아래)
    chestGoldRate: { 1: 0.25, 2: 0.35, 3: 0.4, 4: 0.5, 5: 0.7 }, // 다음 등급 장비 1개 평균 골드 대비
    chestEquipProb: { 1: 0.005, 2: 0.01, 3: 0.02, 4: 0.03, 5: 0.05 },
    // 다음 제작 등급별 특수 재료 [재료, 최소, 최대, 확률] (상자 등급 1~5)
    chestSpecial: {
      3: { id: 'MAT-RIFT-3', rows: [[0, 1, 1], [0, 1, 1], [1, 1, 1], [1, 1, 1], [1, 2, 1]] },
      4: { id: 'MAT-RIFT-4', rows: [[1, 1, 0.2], [1, 1, 0.4], [1, 1, 0.6], [1, 1, 0.8], [1, 1, 1]] },
      5: { id: 'MAT-RIFT-5', rows: [[1, 1, 0], [1, 1, 0.2], [1, 1, 0.35], [1, 1, 0.5], [1, 1, 1]] }
    },
    // 대표 캐릭터 선택 시 지급(무기 1개 + 체험 사냥 뒤 첫 제작이 바로 되도록)
    starter: { WAR: { 'MAT-IRON-1': 20, 'MAT-LEATHER-1': 10, 'MAT-CLOTH-1': 10 }, MAG: { 'MAT-IRON-1': 15, 'MAT-CLOTH-1': 20, 'MAT-LEATHER-1': 5 },
      ARC: { 'MAT-IRON-1': 15, 'MAT-LEATHER-1': 20, 'MAT-CLOTH-1': 5 }, ROG: { 'MAT-IRON-1': 15, 'MAT-LEATHER-1': 20, 'MAT-CLOTH-1': 5 } },
    tutorialRegion: { WAR: 'METRO', MAG: 'CHUNGCHEONG', ARC: 'GANGWON', ROG: 'JEJU' },
    tutorialParts: ['HELM', 'ARMOR', 'GLOVES']              // 던전 체험 상자: 무기 외 일반 3부위 재료
  };
  function bal(M) { var b = M.balance || {}, o = {}; Object.keys(BAL10).forEach(function (k) { o[k] = b[k] !== undefined ? b[k] : BAL10[k]; }); return o; }
  /** 다음 제작 등급: 그 직업 8부위 중 가장 낮은 장착 등급 + 1(빈 칸 = 0) */
  function targetGrade(M, jobId, invItems) {
    var ix = index(M), min = 5;
    M.parts.forEach(function (pt) {
      var g = 0; invItems.forEach(function (x) { var it = ix.item[x.item_id]; if (it && x.equipped_job_id === jobId && !x.sold_at && it.partId === pt.id && it.grade > g) g = it.grade; });
      if (g < min) min = g;
    });
    return Math.min(5, min + 1);
  }
  /** 그 직업·등급 8부위 레시피의 재료 계열 비중 {IRON: n, ...} */
  function jobFamilyWeights(M, jobId, grade) {
    var ix = index(M), w = { IRON: 0, LEATHER: 0, CLOTH: 0 };
    M.items.forEach(function (it) {
      if (it.jobId !== jobId || it.grade !== grade) return;
      var rc = ix.recipe[it.id], f = rc.mainMaterialId.split('-')[1];
      if (w[f] !== undefined) w[f] += rc.mainQty;
    });
    return w;
  }
  /** 던전 체험(튜토리얼 보스) 상자: 대표 직업 일반 3부위 재료·골드 정확히(계정당 1회) */
  function tutorialChest(M, jobId) {
    var ix = index(M), mats = {}, gold = 0;
    bal(M).tutorialParts.forEach(function (part) {
      var it = M.items.filter(function (x) { return x.jobId === jobId && x.grade === 1 && x.partId === part; })[0], rc = ix.recipe[it.id];
      mats[rc.mainMaterialId] = (mats[rc.mainMaterialId] || 0) + rc.mainQty; gold += rc.gold;
    });
    return { grade: 2, gold: gold, materials: mats, special: {}, items: [], tutorial: true };
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
  /** 상자 내용 확정(R-31 → v1.0): 상자 등급 × 참가 직업의 '다음 제작 등급'에 맞춘 재료·골드·특수 재료, 완제품은 희소
   *  target: 다음 제작 등급(1~5, 없으면 2). 같은 시드 → 같은 결과 */
  /** 상자 등급 × 목표 등급 → 특수 재료 {id, min, max, prob} | null (미리보기·확률 안내와 실제 지급이 같은 표를 씀, v1.0.2) */
  function chestSpecialRow(M, gradeNo, target) {
    var B = bal(M), tg = Math.max(1, Math.min(5, target || 2)), sp = B.chestSpecial[tg];
    if (!sp && tg <= 2 && gradeNo >= 3) sp = { id: 'MAT-RIFT-3', rows: [[0, 0, 0], [0, 0, 0], [1, 1, 0.5], [1, 1, 0.7], [1, 1, 1]] }; // 희귀 준비
    if (!sp) return null;
    var row = sp.rows[gradeNo - 1]; if (!row || !row[2] || !row[1]) return null;
    return { id: sp.id, min: row[0], max: row[1], prob: row[2] };
  }
  function chestContents(M, gradeNo, zoneId, partySize, regionId, jobId, seed, target) {
    var B = bal(M), ix = index(M), r = rng('chest10:' + seed), tg = Math.max(1, Math.min(5, target || 2));
    var zone = M.diffZones.filter(function (z) { return z.zone === zoneId; })[0] || { rewardBonus: 0 };
    var bonus = (zone.rewardBonus || 0) + (partyRow(M, partySize).rewardBonus || 0);
    var qty = Math.round(B.chestQty[gradeNo] * (1 + bonus)), mats = {}, w = jobFamilyWeights(M, jobId, tg), fams = Object.keys(w);
    var wsum = fams.reduce(function (a, f) { return a + w[f]; }, 0) || 1;
    for (var i = 0; i < qty; i++) {
      var fam;
      if (r() < B.chestJobShare) { var x = r() * wsum; fam = fams[0]; for (var k = 0; k < fams.length; k++) { x -= w[fams[k]]; if (x < 0) { fam = fams[k]; break; } } }
      else fam = familyPick(M, r, regionId);
      var tier = r() < B.chestTargetTierShare || tg === 1 ? tg : tg - 1, id = 'MAT-' + fam + '-' + tier;
      mats[id] = (mats[id] || 0) + 1;
    }
    var itemsTg = M.items.filter(function (it) { return it.jobId === jobId && it.grade === tg; });
    var avgGold = itemsTg.reduce(function (a, it) { return a + ix.recipe[it.id].gold; }, 0) / (itemsTg.length || 1);
    var gold = Math.round(avgGold * B.chestGoldRate[gradeNo] / 10) * 10;
    var items = r() < B.chestEquipProb[gradeNo] ? [randomItem(M, r, jobId, tg).id] : [];
    var special = {}, row = chestSpecialRow(M, gradeNo, tg);
    if (row) { if (r() < row.prob) { var q = randInt(r, row.min, row.max); if (q > 0) special[row.id] = q; } }
    return { grade: gradeNo, gold: gold, materials: mats, special: special, items: items, target_grade: tg, v: 10 };
  }

  // ---------- v1.1 3홀 챌린지: 유저 임팩트 입력으로만 진행하는 모드(DAILY_3HOLE) ----------
  // 실제 GS 레이드의 시간 기반 자동치기와 분리한다. 입력(p) 하나가 샷 1개를 확정한다.
  // 게임용 가상 샷·스코어이며 실제 GS 샷·핸디캡 기록과 섞지 않는다.
  var CHW = 300;                                  // 지도 좌표 단위: x = 0~300, y = 0~300×aspect(이미지 높이/너비)
  var CH_GREEN_MIN = 20, CH_GREEN_MAX = 32;       // 그린 반경(m) 허용 범위: 이미지의 그린 원 크기를 실제 홀 거리 기준 미터로 바꾼 값을 이 범위로 제한
  // 16종 레이아웃: GPT가 그린 지도 이미지(ch_map_{id}.webp)에서 tools/trace_layouts.js로 추출한 메타데이터
  //  pts = 티 → 홀컵 중심 경로(이미지 크기 기준 0~1), ws = 각 점의 페어웨이 폭(300 단위), gr = 그린 반경(300 단위)
  var CH_LAYOUTS = [
    { id: "P3_01", par: 3, name: "짧은 직선형", aspect: 1.4055, gr: 32.9,
      pts: [[0.4975,0.863],[0.4995,0.8043],[0.495,0.7454],[0.495,0.6864],[0.495,0.6273],[0.495,0.5682],[0.495,0.5092],[0.495,0.4501],[0.495,0.391],[0.4953,0.332],[0.4969,0.2729]],
      ws: [43.2,48,60,60,60,60,60,60,60,57.7,57.7] },
    { id: "P3_02", par: 3, name: "좌측 사선형", aspect: 1.2, gr: 34.5,
      pts: [[0.675,0.8625],[0.6612,0.7936],[0.6039,0.7402],[0.5647,0.6765],[0.5261,0.6124],[0.4869,0.5486],[0.4472,0.485],[0.4089,0.4209],[0.368,0.3578],[0.3306,0.2932]],
      ws: [44.730000000000004,49.7,59.4,59.4,59.4,59.4,59.4,59.4,55.7,55.7] },
    { id: "P3_03", par: 3, name: "우측 사선형", aspect: 1.2, gr: 34.6,
      pts: [[0.3175,0.8625],[0.3301,0.7936],[0.3812,0.7374],[0.4212,0.6748],[0.46,0.6117],[0.4999,0.5491],[0.5395,0.4863],[0.5796,0.4237],[0.6198,0.3613],[0.6573,0.2976]],
      ws: [48.6,54,61.1,59.4,59.4,59.4,59.4,59.4,54.2,54.2] },
    { id: "P3_04", par: 3, name: "완만한 좌측 곡선형", aspect: 1.2, gr: 34.7,
      pts: [[0.6175,0.8396],[0.6065,0.7688],[0.5623,0.7058],[0.5284,0.6376],[0.4861,0.5732],[0.4274,0.5178],[0.405,0.4492],[0.407,0.3754],[0.4161,0.3019]],
      ws: [45.9,51,60.7,60,58.1,59.4,60,54.2,54.2] },
    { id: "P3_05", par: 3, name: "완만한 우측 곡선형", aspect: 1.2, gr: 34.2,
      pts: [[0.3775,0.8625],[0.3859,0.7953],[0.4283,0.7375],[0.4577,0.6738],[0.4897,0.611],[0.5405,0.5579],[0.587,0.5028],[0.59,0.4347],[0.585,0.3667],[0.5738,0.299]],
      ws: [45.9,51,61.2,61.2,60.4,58.1,61.7,57,53.7,53.7] },
    { id: "P4_01", par: 4, name: "직선형", aspect: 1.2, gr: 18.4,
      pts: [[0.4975,0.8792],[0.5,0.8051],[0.5,0.7307],[0.5,0.6564],[0.495,0.5822],[0.495,0.5079],[0.495,0.4335],[0.495,0.3592],[0.495,0.2848],[0.495,0.2104],[0.4972,0.1361]],
      ws: [48.6,54,54,54,51,51,54,54,54,54,54] },
    { id: "P4_02", par: 4, name: "좌측 도그레그형", aspect: 1.4055, gr: 22.7,
      pts: [[0.6002,0.8751],[0.6,0.8135],[0.6,0.752],[0.6,0.6905],[0.6,0.629],[0.6,0.5674],[0.595,0.5061],[0.5695,0.4478],[0.5205,0.3972],[0.4634,0.351],[0.4074,0.3042],[0.3574,0.2543],[0.3333,0.1957],[0.3321,0.1342]],
      ws: [45.9,51,51,51,51,51,56,57.4,56.9,55.1,56.9,59.7,59,59] },
    { id: "P4_03", par: 4, name: "우측 도그레그형", aspect: 1.2, gr: 20.1,
      pts: [[0.3975,0.8792],[0.3964,0.806],[0.395,0.7325],[0.395,0.6589],[0.395,0.5853],[0.4081,0.513],[0.4516,0.4495],[0.5109,0.3951],[0.5705,0.3407],[0.6232,0.2818],[0.6522,0.2126],[0.6553,0.1392]],
      ws: [45.9,51,51,51,51,54,52.7,50.9,50.9,54.4,53.5,53.5] },
    { id: "P4_04", par: 4, name: "완만한 S자형", aspect: 1.4055, gr: 24.1,
      pts: [[0.4929,0.8737],[0.471,0.8192],[0.4115,0.7769],[0.375,0.7246],[0.375,0.6646],[0.3946,0.6074],[0.436,0.5553],[0.4781,0.5035],[0.5199,0.4515],[0.5646,0.4007],[0.6021,0.3473],[0.605,0.2875],[0.5889,0.23],[0.5385,0.1821],[0.4842,0.1363]],
      ws: [40.5,45,58.1,59.5,59.5,61.1,59.4,61.1,59.4,59.4,62.4,60,61.1,59.4,59.4] },
    { id: "P4_05", par: 4, name: "넓은 전반부·좁은 후반부형", aspect: 1.4055, gr: 22,
      pts: [[0.4975,0.8808],[0.5,0.8192],[0.4966,0.7575],[0.495,0.6956],[0.495,0.6337],[0.495,0.5718],[0.495,0.5099],[0.495,0.4479],[0.495,0.386],[0.495,0.3241],[0.495,0.2622],[0.495,0.2003],[0.4961,0.1384]],
      ws: [45.9,51,96,90,87,80.5,75,70.2,66,60,56.5,51,51] },
    { id: "P5_01", par: 5, name: "긴 직선형", aspect: 1.4055, gr: 20.8,
      pts: [[0.4975,0.8915],[0.5,0.832],[0.5,0.7722],[0.5,0.7124],[0.5,0.6526],[0.5,0.5928],[0.5,0.533],[0.5,0.4732],[0.5,0.4134],[0.5,0.3536],[0.5,0.2938],[0.5,0.234],[0.4989,0.1742],[0.4962,0.1145]],
      ws: [43.2,48,54,54,54,54,54,54,54,54,54,54,54,54] },
    { id: "P5_02", par: 5, name: "긴 좌측 도그레그형", aspect: 1.4055, gr: 19.6,
      pts: [[0.655,0.9128],[0.655,0.8532],[0.655,0.7936],[0.655,0.7339],[0.655,0.6743],[0.655,0.6147],[0.6528,0.5551],[0.6324,0.4977],[0.5769,0.4533],[0.5176,0.4111],[0.4558,0.3709],[0.3943,0.3305],[0.3386,0.2862],[0.3028,0.2325],[0.29,0.1739],[0.2889,0.1143]],
      ws: [43.2,48,48,48,48,48,50.5,55.5,53.9,53.9,53.9,53.9,55.1,56,54,54] },
    { id: "P5_03", par: 5, name: "긴 우측 도그레그형", aspect: 1.2, gr: 15.4,
      pts: [[0.34,0.925],[0.3389,0.8542],[0.335,0.7836],[0.33,0.713],[0.33,0.6421],[0.3397,0.572],[0.3811,0.5116],[0.4412,0.4615],[0.5047,0.4146],[0.5685,0.3679],[0.6286,0.3178],[0.6723,0.2581],[0.69,0.1893],[0.6926,0.1186]],
      ws: [37.800000000000004,42,48,48,48,49.5,49.7,46.7,46.7,47.2,46.7,48,45,45] },
    { id: "P5_04", par: 5, name: "긴 S자형", aspect: 1.2, gr: 17.6,
      pts: [[0.495,0.9083],[0.4483,0.8519],[0.3841,0.8026],[0.37,0.7325],[0.4051,0.6672],[0.4609,0.611],[0.5132,0.5525],[0.5706,0.4973],[0.6142,0.4351],[0.6138,0.3622],[0.564,0.3033],[0.5057,0.2489],[0.4709,0.1827],[0.4558,0.1108]],
      ws: [34.38,38.2,46.7,48.2,46.7,49.7,49.7,49.7,51,50,46.7,49.7,49.2,49.2] },
    { id: "P5_05", par: 5, name: "두 번 완만하게 꺾이는 형", aspect: 1.4055, gr: 20.2,
      pts: [[0.2545,0.9112],[0.2493,0.8518],[0.24,0.7925],[0.2423,0.7327],[0.268,0.6759],[0.3131,0.6255],[0.3668,0.5795],[0.4258,0.5368],[0.4862,0.4951],[0.5525,0.4583],[0.6183,0.4212],[0.6778,0.3788],[0.715,0.3271],[0.715,0.2672],[0.6776,0.2154],[0.6175,0.1736],[0.5502,0.1377],[0.4825,0.1022]],
      ws: [43.2,48,48,48,50.9,50.9,50.9,53.9,53.9,55.1,55.1,55.1,55.5,55.5,53.9,53.9,53.9,53.9] },
    { id: "P6_01", par: 6, name: "초장거리 확장 S자형", aspect: 1.4055, gr: 22.5,
      pts: [[0.4971,0.9305],[0.4539,0.8811],[0.3721,0.8625],[0.3142,0.8163],[0.3232,0.7566],[0.3853,0.7128],[0.4563,0.6763],[0.5261,0.6388],[0.5954,0.6008],[0.6545,0.5551],[0.654,0.4941],[0.5949,0.4484],[0.5254,0.4106],[0.4525,0.376],[0.3819,0.3394],[0.3223,0.294],[0.3242,0.2339],[0.3848,0.1891],[0.4564,0.1534],[0.5181,0.1094]],
      ws: [31.95,35.5,49.7,47.7,49.7,50.9,50.9,50.9,51.4,50.9,50.2,50.9,50.9,50.9,50.9,50.9,49.7,50.9,50.9,50.9] }
  ];
  // 초기안 수치(기획 제안 v0.2). master.challenge가 있으면 그 값이 우선
  var CH_DEF = {
    basicPerDay: 2, ticketMax: 10, // 하루 기본 이용 횟수(한국 시간 00:00 초기화·이월 없음), 누적 이용권 보관 한도
    holes: 3, startHoles: [1, 4, 7, 10, 13, 16], tee: { M: 'White', F: 'Red' },
    greenM: 25, aimShort: 8, driverMin: 220, club: { DRIVER: 240, IRON: 160 },
    reach: [1, 0.95, 0.75, 0.55], cut: [0.12, 0.40, 0.75], angleDeg: 12,
    puttIn: [10, 5, 2, 1], puttLeft: [0.10, 0.20, 0.45, 0.65], latPad: 17, maxMult: 2,
    qual: ['CRIT', 'STRONG', 'NORMAL', 'NORMAL'], qualName: ['완벽한 샷', '좋은 샷', '무난한 샷', '빗맞은 샷'], qualKey: ['NICE SHOT', 'GOOD', 'NOT BAD', 'BAD'],
    holeMult: { eagle: 1.5, birdie: 1.2, par: 1, bogey: 0.8, double: 0.6, triple: 0.4, quad: 0.2, cap: 0.1 },
    hpExtra: 1.15, hpSolo: 0.9, concede: [1, 0.5],
    matQty: [1, 1, 2, 2, 3], tierKeep: 0.7,
    special: [[0.002, 0, 0], [0.004, 0, 0], [0.008, 0.001, 0], [0.012, 0.002, 0.0003], [0.02, 0.005, 0.001]], // 등급별 [파편, 결정, 핵]
    specialNeed: [3, 4, 5], specialIds: ['MAT-RIFT-3', 'MAT-RIFT-4', 'MAT-RIFT-5'], families: ['IRON', 'LEATHER', 'CLOTH']
  };
  function chCfg(M) { var o = {}, c = M.challenge || {}; Object.keys(CH_DEF).forEach(function (k) { o[k] = c[k] !== undefined ? c[k] : CH_DEF[k]; }); return o; }
  function chLayout(id) { return CH_LAYOUTS.filter(function (l) { return l.id === id; })[0]; }
  var CH_GEOM = {};
  /** 레이아웃 중심 경로(Catmull-Rom 촘촘한 점 목록·누적 길이·점별 폭) */
  function chBase(id) {
    if (CH_GEOM[id]) return CH_GEOM[id];
    var l = chLayout(id), HH = CHW * l.aspect, P = l.pts.map(function (a) { return [a[0] * CHW, a[1] * HH]; }), n = P.length, D = [], WD = [], i, k, t;
    for (i = 0; i < n - 1; i++) {
      var p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
      for (k = 0; k < 16; k++) {
        t = k / 16; var t2 = t * t, t3 = t2 * t;
        D.push([0, 1].map(function (a) { return 0.5 * ((2 * p1[a]) + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3); }));
        WD.push(l.ws[i] + (l.ws[i + 1] - l.ws[i]) * t);
      }
    }
    D.push(P[n - 1]); WD.push(l.ws[n - 1]);
    var cum = [0]; for (i = 1; i < D.length; i++) cum.push(cum[i - 1] + Math.hypot(D[i][0] - D[i - 1][0], D[i][1] - D[i - 1][1]));
    return (CH_GEOM[id] = { layout: l, D: D, cum: cum, wd: WD, len: cum[cum.length - 1], H: HH });
  }
  /** 실제 홀 거리(m)에 맞춰 경로 길이를 스케일링: scale = 경로 단위/미터. 거리는 이미지·경로에 고정하지 않는다 */
  function chGeom(id, distM) {
    var b = chBase(id), scale = b.len / distM, gr = b.layout.gr || 25 * scale;
    return { layout: b.layout, D: b.D, cum: b.cum, wd: b.wd, len: b.len, H: b.H, dist: distM, scale: scale, greenM: Math.max(CH_GREEN_MIN, Math.min(CH_GREEN_MAX, gr / scale)) };
  }
  function chPos(g, s) {
    s = Math.max(0, Math.min(g.len, s));
    var i = 1; while (i < g.D.length - 1 && g.cum[i] < s) i++;
    var a = g.D[i - 1], b = g.D[i], seg = (g.cum[i] - g.cum[i - 1]) || 1, t = (s - g.cum[i - 1]) / seg, dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    return { x: a[0] + dx * t, y: a[1] + dy * t, tx: dx / d, ty: dy / d };
  }
  /** 경로상 진행 위치 s + 횡방향 lat(진행 방향 왼쪽이 +) → 지도 좌표 */
  function chXY(g, s, lat) { var p = chPos(g, s); return { x: p.x + p.ty * lat, y: p.y - p.tx * lat }; }
  function chWidthAt(g, s) {
    s = Math.max(0, Math.min(g.len, s)); var i = 1; while (i < g.D.length - 1 && g.cum[i] < s) i++;
    var seg = (g.cum[i] - g.cum[i - 1]) || 1, t = (s - g.cum[i - 1]) / seg; return g.wd[i - 1] + (g.wd[i] - g.wd[i - 1]) * t;
  }
  function chRemain(g, st) { return Math.hypot(g.len - st.s, st.lat) / g.scale; }
  function chJudge(C, p) { var e = Math.abs(2 * p - 1); return e <= C.cut[0] ? 0 : e <= C.cut[1] ? 1 : e <= C.cut[2] ? 2 : 3; }
  function chClub(C, par, shotNo, rem, gm) { return rem <= (gm || C.greenM) ? 'PUTTER' : (shotNo === 0 && par >= 4 && rem > C.driverMin) ? 'DRIVER' : 'IRON'; }
  function chR3(x) { return Math.round(x * 1000) / 1000; }
  /** 같은 PAR 풀에서 홀마다 추첨: 한 라운드 안 비복원, 직전 라운드의 같은 PAR 마지막 레이아웃은 첫 추첨에서 제외 */
  function chPickLayouts(r, pars, prevByPar) {
    var used = {}, seen = {}, out = [];
    pars.forEach(function (par) {
      var pool = CH_LAYOUTS.filter(function (l) { return l.par === par; }), left = pool.filter(function (l) { return !used[l.id]; });
      if (left.length) pool = left;
      if (!seen[par] && prevByPar && prevByPar[par] && pool.length > 1) pool = pool.filter(function (l) { return l.id !== prevByPar[par]; });
      seen[par] = 1;
      var pick = pool[Math.floor(r() * pool.length)]; used[pick.id] = 1; out.push(pick.id);
    });
    return out;
  }
  /** 챌린지 시작 확정: 코스·시작 홀·3홀(PAR·거리·지도)·설정·보스를 시드로 고정(재추첨 없음).
   *  o = { seed, gender('M'|'F'), jobId, cp, tier(재료 목표 단계), prevByPar?, courseId?, startHole? } */
  function chSetup(M, o) {
    var C = chCfg(M), ix = index(M), r = rng('chs:' + o.seed), tee = o.gender === 'F' ? C.tee.F : C.tee.M;
    var sh = o.startHole || C.startHoles[Math.floor(r() * C.startHoles.length)];
    var teeOf = function (c) { return c.tees && (c.tees[tee] || c.tees.White); }; // 옛 캐시 등으로 해당 티 거리가 없으면 White로 대체
    var okHole = function (c, h) { var par = c.par[h - 1], d = teeOf(c) && teeOf(c)[h - 1]; return par >= 3 && par <= 6 && d > 0; };
    var cands = M.raidCourses.filter(function (c) { for (var k = 0; k < C.holes; k++) if (!okHole(c, sh + k)) return false; return true; });
    var course = o.courseId ? ix.raidCourse[o.courseId] : pickWeighted(r, cands, function (c) { return c.weight || 1; });
    var pars = [], dists = [];
    for (var k = 0; k < C.holes; k++) { pars.push(course.par[sh + k - 1]); dists.push(teeOf(course)[sh + k - 1]); }
    var lays = chPickLayouts(r, pars, o.prevByPar);
    var room = {}, mode = pickWeighted(r, M.settingOptions.filter(function (x) { return x.scope === 'ROOM' && x.item === '게임방식'; }), function (x) { return x.weight; });
    room['게임방식'] = mode.option;
    var con = pickWeighted(r, M.settingOptions.filter(function (x) { return x.scope === 'PERSONAL' && x.item === '컨시드' && C.concede.some(function (m) { return x.option.indexOf(m + 'm') === 0; }); }), function (x) { return x.weight; });
    var concedeM = parseFloat(con.option);
    room['컨시드'] = con.option; room['티'] = tee; room['멀리건'] = '0회';
    var teeKey = '티 위치(' + (o.gender === 'F' ? '여' : '남') + ')|' + tee;
    var courseScore = (course.courseDiff + course.greenDiff) * M.raidConst.diffScoreMult;
    var diffScore = Math.round((courseScore + mode.score + con.score + settingScore(M, teeKey)) * 10) / 10;
    var zone = zoneOf(M, diffScore), boss = ix.boss[ix.region[course.regionId].bossId], B = baseDamage(M, o.jobId, Number(o.cp));
    var hp = Math.round(B * C.holes * C.hpExtra * zone.hpCoef * C.hpSolo);
    return { v: 1, seed: o.seed, gender: o.gender === 'F' ? 'F' : 'M', job_id: o.jobId, cp: Number(o.cp), top_skill_id: topSkill(M, o.jobId, Number(o.cp)).id,
      base_damage: B, tier: o.tier, course_id: course.courseId, course_name: course.name, region_id: course.regionId, boss_id: boss.id,
      tee: tee, start_hole: sh, concede_m: concedeM, settings: room, course_score: courseScore, diff_score: diffScore, zone: zone.zone, boss_hp: hp,
      holes: pars.map(function (p, i) { return { hole: sh + i, par: p, dist: dists[i], layout_id: lays[i] }; }) };
  }
  function chStart(M, S) {
    return { i: 0, n_shot: 0, strokes: 0, s: 0, lat: 0, hole_d: 0, hole_s: 0, carry: 0, sp: 0, sp_gain: 0, pend: 0, sp_uses: 0, damage: 0, shot_damage: 0, hole_damage: 0,
      hp: S.boss_hp, killed_at: null, holes: [], log: [], done: false };
  }
  function chHoleRatio(C, strokes, par) {
    if (strokes >= par * C.maxMult) return { ratio: C.holeMult.cap, name: '타수 상한', key: 'cap' };
    var d = strokes - par, H = C.holeMult;
    return d <= -2 ? { ratio: H.eagle, name: '이글 이하', key: 'eagle' } : d === -1 ? { ratio: H.birdie, name: '버디', key: 'birdie' } : d === 0 ? { ratio: H.par, name: '파', key: 'par' }
      : d === 1 ? { ratio: H.bogey, name: '보기', key: 'bogey' } : d === 2 ? { ratio: H.double, name: '더블 보기', key: 'double' } : d === 3 ? { ratio: H.triple, name: '트리플 보기', key: 'triple' } : { ratio: H.quad, name: '쿼드러플 보기 이상', key: 'quad' };
  }
  /** 샷 1개 확정(순수 함수): 입력 p(0~1) → 새 상태 + 샷 이벤트(들) + 홀 종료 결과. 웹·서버가 같은 계산을 쓴다 */
  function chShot(M, S, st0, p) {
    var C = chCfg(M), rc = M.raidConst, st = JSON.parse(JSON.stringify(st0));
    if (st.done) return { error: 'DONE' };
    p = Math.round(Math.min(1, Math.max(0, Number(p))) * 10000) / 10000;
    var h = S.holes[st.i], g = chGeom(h.layout_id, h.dist), qi = chJudge(C, p), rem = chRemain(g, st), club = chClub(C, h.par, st.strokes, rem, g.greenM), cap = h.par * C.maxMult;
    var ang = (2 * p - 1) * C.angleDeg * Math.PI / 180, ev = { i: st.n_shot, hole: h.hole, seq: st.strokes + 1, club: club, p: p, qi: qi, q: C.qual[qi], from: { s: st.s, lat: st.lat } }, s1, lat1, holed = false;
    if (club === 'PUTTER') {
      if (rem <= C.puttIn[qi]) { holed = true; s1 = g.len; lat1 = 0; ev.dist = chR3(rem); }
      else { var f = C.puttLeft[qi]; s1 = g.len - (g.len - st.s) * f; lat1 = st.lat * f; ev.dist = chR3(rem * (1 - f)); }
    } else {
      var tgt = Math.max(0, Math.min(C.club[club], rem - C.aimShort)), d = tgt * C.reach[qi];
      s1 = Math.min(g.len, st.s + d * Math.cos(ang) * g.scale);
      var lim = chWidthAt(g, s1) / 2 + C.latPad; lat1 = Math.max(-lim, Math.min(lim, st.lat - d * Math.sin(ang) * g.scale));
      ev.dist = chR3(d);
    }
    st.s = chR3(s1); st.lat = chR3(lat1); st.strokes++; st.n_shot++; ev.to = { s: st.s, lat: st.lat };
    var evs = [ev], rem2 = chRemain(g, st);
    if (!holed && rem2 <= g.greenM && rem2 <= S.concede_m && st.strokes + 1 <= cap) { // 컨시드: 마지막 퍼트 1타 추가, 샷 이벤트 1회 기록
      st.strokes++; st.n_shot++; holed = true;
      evs.push({ i: st.n_shot - 1, hole: h.hole, seq: st.strokes, club: 'PUTTER', p: null, qi: 2, q: 'NORMAL', conceded: true, from: { s: st.s, lat: st.lat }, to: { s: g.len, lat: 0 }, dist: chR3(rem2) });
      st.s = chR3(g.len); st.lat = 0;
    }
    var capped = !holed && st.strokes >= cap;
    evs.forEach(function (e) { // 샷 공격 피해·SP (기존 레이드 규칙 재사용, 보스 스킬·파티 보너스 없음)
      var Qn = e.q, Q = rc.shotQuality[Qn], B = S.base_damage;
      var unit = rc.shotAlpha * B / h.par, capD = rc.shotCap * rc.shotAlpha * B, dm = unit * Q, room = Math.max(0, capD - st.hole_d), capd = false;
      if (dm > room) { dm = room; capd = true; }
      st.hole_d += dm; st.hole_s += dm / Q; st.shot_damage += dm; st.damage += dm; st.hp -= dm;
      var gain = Math.max(0, Math.min(rc.spShotGain[Qn], rc.spHoleCap - st.sp_gain));
      st.sp_gain += gain; st.sp = Math.min(M.sp.max, st.sp + gain);
      if (st.sp >= M.sp.max && !st.pend) { st.pend = 1; st.sp = 0; st.sp_uses++; e.sp_auto = true; }
      e.d = dm; e.sp_gain = gain; e.capped = capd;
      if (st.hp <= 0 && st.killed_at === null) st.killed_at = h.hole;
      st.log.push({ hole: h.hole, seq: e.seq, club: e.club, p: e.p, q: e.q });
    });
    var out = { st: st, evs: evs, holed: holed, capped: capped, club: club, hole_result: null, finished: false };
    if (holed || capped) { // 홀 종료 정산: T = 기준 데미지 × 결과 비율 × SP 배율
      var hr = chHoleRatio(C, st.strokes, h.par), m = 1, used = false;
      if (st.pend) { m = spMult(M, rng('chsp:' + S.seed + ':' + h.hole)); st.pend = 0; used = true; }
      var T = S.base_damage * hr.ratio * m, E = Math.max(0, T - st.hole_s - st.carry), carryOut = Math.max(0, st.hole_s + st.carry - T);
      var res = { hole: h.hole, par: h.par, strokes: st.strokes, diff: st.strokes - h.par, result: hr.name, result_key: hr.key, ratio: hr.ratio, holed: holed, capped: capped, conceded: evs.length > 1,
        sp_used: used, sp_mult: m, T: T, shot_damage: st.hole_d, settle: st.hole_s, E: E, carry_in: st.carry, carry_out: carryOut, damage: st.hole_d + E, layout_id: h.layout_id };
      st.carry = carryOut; st.damage += E; st.hole_damage += E; st.hp -= E;
      if (st.hp <= 0 && st.killed_at === null) st.killed_at = h.hole;
      st.holes.push(res); out.hole_result = res;
      st.i++; st.strokes = 0; st.s = 0; st.lat = 0; st.hole_d = 0; st.hole_s = 0; st.sp_gain = 0;
      if (st.i >= S.holes.length) { st.done = true; out.finished = true; }
    }
    return out;
  }
  /** 3홀 종료 결과: 최종 등급 = 피해 비율 등급과 난이도 상한 중 낮은 것 */
  function chResult(M, S, st) {
    var ratio = st.damage / S.boss_hp, g = finalRewardGrade(M, ratio, S.zone), by = rewardGradeByRatio(M, ratio);
    var tot = st.holes.reduce(function (a, x) { return a + x.strokes; }, 0), par = S.holes.reduce(function (a, x) { return a + x.par; }, 0);
    return { ratio: Math.round(ratio * 1000) / 1000, grade: g.grade, grade_name: g.name, grade_by_ratio: by.name, capped: by.grade > g.grade, zone: S.zone, killed_at: st.killed_at,
      total_damage: Math.round(st.damage), shot_damage: Math.round(st.shot_damage), hole_damage: Math.round(st.hole_damage), strokes: tot, par: par, diff: tot - par, sp_uses: st.sp_uses };
  }
  /** 선택 보상 후보: 철/가죽/천 3개(같은 단계·수량) + 특수 재료 0~1개(4번째 후보). 결과 확정 때 1회 추첨해 저장 */
  function chCandidates(M, S, grade, seed) {
    var C = chCfg(M), r = rng('chr:' + seed), T = Math.max(1, Math.min(5, S.tier || 1));
    var L = T === 1 ? 1 : (r() < C.tierKeep ? T : Math.max(1, T - 1)), qty = C.matQty[grade - 1];
    var list = C.families.map(function (f) { return { key: f, material_id: 'MAT-' + f + '-' + L, qty: qty }; });
    var pr = C.special[grade - 1], u = r(), kind = u < pr[0] ? 0 : u < pr[0] + pr[1] ? 1 : u < pr[0] + pr[1] + pr[2] ? 2 : -1;
    if (kind >= 0 && T >= C.specialNeed[kind]) list.push({ key: 'SPECIAL', material_id: C.specialIds[kind], qty: 1, special: true });
    return { tier: L, grade: grade, candidates: list };
  }

  return {
    rng: rng, pickWeighted: pickWeighted, index: index,
    characterCp: characterCp, topSkill: topSkill, baseDamage: baseDamage,
    huntEfficiency: huntEfficiency, canEnterCourse: canEnterCourse, huntTicks: huntTicks, huntMaxTicks: huntMaxTicks, huntRewards: huntRewards,
    craftShortage: craftShortage, craftCost: craftCost, craftResult: craftResult, composeCost: composeCost, sellPrice: sellPrice,
    setupRound: setupRound, simulateRound: simulateRound, indexAt: indexAt, eventEndMs: eventEndMs, skillAtHole: skillAtHole,
    buildPlan: buildPlan, judgeShot: judgeShot, clubSequence: clubSequence, shotExp: shotExp, accountCp: accountCp,
    holeResult: holeResult, rewardGradeByRatio: rewardGradeByRatio, finalRewardGrade: finalRewardGrade,
    chestContents: chestContents, chestSpecialRow: chestSpecialRow, tutorialChest: tutorialChest, targetGrade: targetGrade, bal: bal, zoneOf: zoneOf, settingsScore: settingsScore, lookOf: lookOf, lookByCp: lookByCp,
    ch: { cfg: chCfg, layouts: CH_LAYOUTS, layout: chLayout, geom: chGeom, pos: chPos, xy: chXY, widthAt: chWidthAt, remain: chRemain, judge: chJudge, club: chClub,
      setup: chSetup, start: chStart, shot: chShot, result: chResult, candidates: chCandidates, W: CHW }
  };
})();
if (typeof module !== 'undefined') module.exports = Engine;
