/* 균열의 페어웨이 프로토타입 — 화면 (v0.5)
 * 화면ID는 SPEC_v05 D-1과 같다. 계산은 engine.js, 저장은 api.js(서버)로 한다.
 * 구성: 공통 → 렌더 → 게임 화면(GZ·GM) → 팝업 → 튜토리얼·코치마크 → 사냥 연출 → 동작 → 던전(DG) → 타이머·시작 */
(function () {
  var M = null, IX = null, S = null;            // master, index, save
  var view = { name: 'boot', p: {} }, popup = null, toastMsg = null, toastTimer = null, saveState = '';
  var offset = 0;                                // 서버 시각 - 기기 시각
  var resetScroll = true, lastKey = '';
  var root = document.getElementById('app');
  var JOBS = ['WAR', 'MAG', 'ARC', 'ROG'];
  var JOB_FILE = { WAR: 'war', MAG: 'mag', ARC: 'arc', ROG: 'rog' };
  var GRADE_NAME = { 1: '일반', 2: '고급', 3: '희귀', 4: '영웅', 5: '전설' };
  var FAM_NAME = { IRON: '철', LEATHER: '가죽', CLOTH: '천', RIFT: '균열' };
  var QUALITY_NAME = { NORMAL: '일반', STRONG: '강타', CRIT: '크리티컬' };

  // ---------------- 공통 ----------------
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n || 0).toLocaleString('ko-KR'); }
  function fmtR(n) { return fmt(Math.round(Number(n || 0))); }
  function now() { return Date.now() + offset; }
  // v0.6 B-42: 이미지는 WebP로 제공(.png 이름으로 불러도 .webp를 씀). 화면 밖 이미지는 지연 로딩
  function asset(name) { return APP_CONFIG.ASSET_DIR + String(name).replace(/\.png$/, '.webp') + (APP_CONFIG.ASSET_VER ? '?v=' + APP_CONFIG.ASSET_VER : ''); }
  function img(name, cls) { return '<img' + (cls ? ' class="' + cls + '"' : '') + ' src="' + asset(name) + '" alt="" loading="lazy" decoding="async" onerror="this.remove()">'; }
  // ---- v0.6 외형 단계(B-30~B-32): 단계 이미지가 아직 없으면 기존 이미지 + 단계별 임시 색 처리(.ph) ----
  var LOOK_NAME = ['기본', '일반', '고급', '희귀', '영웅', '전설'], LOOK_COLOR = ['#9AA3AF', '#E6E6E6', '#4CC38A', '#4A9BFF', '#A77BFF', '#F6C445'];
  function lookOf(j) { return Engine.lookOf(M, j, S.items || []); }
  function charSrc(j, stage, atk) { return 'char_' + JOB_FILE[j] + '_s' + stage + (atk ? '_atk' : '') + '.webp'; }
  function charStage(j, stage, atk) { return APP_CONFIG.ASSET_DIR + charSrc(j, stage, atk) + (APP_CONFIG.ASSET_VER ? '?v=' + APP_CONFIG.ASSET_VER : ''); }
  function charFallback(j, atk) { return asset('char_' + JOB_FILE[j] + (atk ? '_attack' : '') + '.png'); }
  /** 캐릭터 외형 그림: 단계 그림 + 세트 효과 층. pose: 'idle' | 'atk' | 'both'(사냥: 대기·공격 2장) */
  function charPic(j, lk, pose, cls) {
    lk = lk || { stage: 0, set: 0 };
    var ready = APP_CONFIG.LOOK_IMAGES, one = function (atk, c) {
      if (!ready) return '<img class="' + (c || '') + '" src="' + charFallback(j, atk) + '" alt="" loading="lazy" decoding="async">';
      return '<img class="' + (c || '') + '" src="' + charStage(j, lk.stage, atk) + '" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\'' + charFallback(j, atk) + '\';this.parentNode.classList.add(\'ph\')">';
    };
    return '<span class="look ls' + lk.stage + ' st' + (lk.set || 0) + (ready ? '' : ' ph') + ' ' + (cls || '') + '" style="--lc:' + LOOK_COLOR[lk.stage] + '"><i class="setfx"></i>' +
      (pose === 'both' ? one(false, 'idle') + one(true, 'atk') : one(pose === 'atk')) + '</span>';
  }
  /** GZ-02 진행 중 레이드 배너(B-39): 실제 골프존앱 '진행 중인 스크린 라운드' 배너와 같은 모양 */
  function raidBanner() {
    var ar = S && S.active_round, live = (typeof dgActive === 'function' && dgActive()) || ar;
    if (!live) return '';
    var done = D.round && D.sim && D.sim.finished;
    return '<button class="gzm-raidbar" data-a="raidBanner"><i class="dot"></i><b>' + (done ? '레이드가 끝났어요 · 보상 확인하기' : '진행 중인 레이드가 있습니다') + '</b><span>›</span></button>';
  }
  /** 목록형 바텀시트 상단 고정 헤더(B-37): 제목 + 닫기 */
  function sheetHead(title, extra) { return '<div class="sheethead"><div class="sh-t">' + title + '</div>' + (extra || '') + '<button class="sh-x" data-a="close" aria-label="닫기">✕</button></div>'; }
  /** 받침 있으면 a(이·을·은), 없으면 b(가·를·는) */
  function josa(w, a, b) { var c = String(w).charCodeAt(String(w).length - 1) - 0xAC00; return w + (c >= 0 && c <= 11171 && c % 28 ? a : b); }
  /** 가장 가까운 외형·세트 목표(B-33): items = 내 장비 목록(가상 장착 포함 가능)
   *  → { done, kind: 'stage'|'set', stage, mark, have, need, text(긴 문장), short(짧은 문장) } */
  function lookGoalOf(j, items) {
    var L = M.lookStage || { minParts: 4, setParts: [6, 8] }, max = L.setParts[L.setParts.length - 1], lk = Engine.lookOf(M, j, items);
    if (lk.stage >= 5 && lk.set >= L.setParts.length) return { done: true, lk: lk, text: '최고 외형·세트 달성!', short: '최고 외형·세트 달성' };
    if (lk.stage > 0 && lk.count < max) {
      var m = L.setParts.filter(function (x) { return x > lk.count; })[0], need = m - lk.count;
      return { kind: 'set', stage: lk.stage, mark: m, have: lk.count, need: need, lk: lk,
        text: LOOK_NAME[lk.stage] + ' 이상 ' + lk.count + '/' + max + ' · ' + need + '부위 더면 ' + m + '세트 효과', short: LOOK_NAME[lk.stage] + ' ' + m + '세트까지 ' + need + '부위' };
    }
    var ns = Math.min(5, lk.stage + 1), have = items.filter(function (x) { return x.equipped_job_id === j && !x.sold_at && IX.item[x.item_id] && IX.item[x.item_id].grade >= ns; }).length, nd = Math.max(0, L.minParts - have);
    return { kind: 'stage', stage: ns, mark: L.minParts, have: have, need: nd, lk: lk,
      text: LOOK_NAME[ns] + ' 이상 ' + have + '/' + L.minParts + ' · ' + nd + '부위 더 장착하면 ' + LOOK_NAME[ns] + ' 외형', short: LOOK_NAME[ns] + ' 외형까지 ' + nd + '부위' };
  }
  /** 이 장비를 만들어 장착하면 외형이 어떻게 되는지(GM-05 배지, B-33) */
  function lookBadge(itemId) {
    var it = IX.item[itemId], j = it.jobId, items = S.items || [];
    var fake = items.filter(function (x) { return !(x.equipped_job_id === j && IX.item[x.item_id] && IX.item[x.item_id].partId === it.partId); })
      .concat([{ item_id: itemId, equipped_job_id: j, inv_item_id: '_fake' }]);
    var b = Engine.lookOf(M, j, items), a = Engine.lookOf(M, j, fake);
    if (a.stage > b.stage) return '장착하면 ' + LOOK_NAME[a.stage] + ' 외형으로 진화!';
    if (a.stage === b.stage && a.set > b.set) return '장착하면 ' + LOOK_NAME[a.stage] + ' ' + setLabel(a) + ' 달성!';
    var g0 = lookGoalOf(j, items), g1 = lookGoalOf(j, fake);
    if (!g1.done && g1.kind === g0.kind && g1.stage === g0.stage && g1.mark === g0.mark && g1.need < g0.need) return '만들어 장착하면 ' + g1.short;
    return '';
  }
  /** 랭킹을 뒤에서 가볍게 갱신(GM-07 현재 순위·GM-01 다음 순위까지, B-41). 장착하면 다음 갱신을 앞당김 */
  var rankAt = 0;
  function rankRefresh(maxAge) {
    if (!S || S.member.is_demo === 'Y' || Date.now() - rankAt < (maxAge || 120000)) return;
    rankAt = Date.now();
    Api.call('ranking', {}, { read: true }).then(function (res) {
      if (!res.ok || !S) return;
      LAST.rank = res.data;
      if ((view.name === 'char' || view.name === 'map') && !popup) render();
    });
  }
  function rankLine() { var r = LAST.rank && LAST.rank.me; return r ? '전체 ' + LAST.rank.total + '명 중 ' + r.rank + '위' : ''; }
  function setLabel(lk) { return lk && lk.set ? (M.lookStage ? M.lookStage.setParts : [6, 8])[lk.set - 1] + '세트' : ''; }
  /** 로그인 직후 내 4캐릭터 현재 외형만 미리 받기(G) */
  function preloadLooks() {
    if (!S || !S.items) return;
    JOBS.forEach(function (j) { var lk = lookOf(j); [false, true].forEach(function (a) { var im = new Image(); im.src = APP_CONFIG.LOOK_IMAGES ? charStage(j, lk.stage, a) : charFallback(j, a); }); });
  }
  // 토스트: 띄울 때만 다시 그리고, 사라질 때는 요소만 지움(화면 애니메이션이 처음부터 다시 돌지 않게)
  function toast(msg) {
    toastMsg = msg; clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastMsg = null; var el = root.querySelector('.toast'); if (el) el.remove(); }, 2600);
    var el = root.querySelector('.toast');
    if (el) el.textContent = msg; else { root.insertAdjacentHTML('beforeend', '<div class="toast"></div>'); root.querySelector('.toast').textContent = msg; }
  }
  function go(name, p) { view = { name: name, p: p || {} }; popup = null; resetScroll = true; render(); }
  function job(id) { return IX.job[id]; }
  function mainJob() { return S.member.main_job_id || 'WAR'; }
  function charOf(j) { return S.characters.filter(function (c) { return c.job_id === j; })[0]; }
  function partName(id) { return M.parts.filter(function (p) { return p.id === id; })[0].name; }
  function matName(id) { return IX.material[id] ? IX.material[id].name : id; }
  function itemIcon(itemId, extra) {
    var it = IX.item[itemId];
    // v0.6 B-34: 직업×등급×부위 고유 아이콘(icon_item_{직업}_g{등급}_{부위}). 이미지가 오기 전(ICON_IMAGES=false)에는 기존 부위 아이콘
    var ic = APP_CONFIG.ICON_IMAGES, file = (ic === true || (ic && ic.indexOf(JOB_FILE[it.jobId]) >= 0)) ? 'icon_item_' + JOB_FILE[it.jobId] + '_g' + it.grade + '_' + it.partId.toLowerCase() + '.png' : 'icon_eq_' + JOB_FILE[it.jobId] + '_' + it.partId.toLowerCase() + '.png';
    return '<div class="icon g' + it.grade + '"' + (extra || '') + '>' + img(file) + '<span>' + partName(it.partId) + '</span></div>';
  }
  function matIcon(id) {
    var m = IX.material[id];
    return '<div class="icon g' + m.tier + '">' + img('icon_mat_' + m.family.toLowerCase() + '_' + m.tier + '.png') + '<span>' + esc(m.name.slice(0, 4)) + '</span></div>';
  }
  function equipped() { return S.items.filter(function (x) { return x.equipped_job_id; }); }
  function cpOf(j) { return Engine.characterCp(M, j, equipped()); }
  function accountCp() { return Engine.accountCp(M, equipped()); }
  function equippedAt(jobId, partId) { return S.items.filter(function (e) { return e.equipped_job_id === jobId && IX.item[e.item_id].partId === partId; })[0]; }
  function cpGain(itemId) { var it = IX.item[itemId], cur = equippedAt(it.jobId, it.partId); return it.cp - (cur ? cur.cp : 0); }
  function addMats(delta) { Object.keys(delta || {}).forEach(function (k) { S.materials[k] = (S.materials[k] || 0) + delta[k]; }); }
  function face(name) { return '<img class="pino" src="' + asset((name || 'pino') + '.png') + '" alt="" onerror="this.remove()">'; }

  // 쓰기 요청은 순서대로 하나씩(버전 충돌 방지). 진행 표시만 바꾸는 요청(BG)은 줄 서지 않고 바로 보냄(v0.5 최적화)
  var queue = Promise.resolve(), pendingWrites = 0, LAST = {};
  var BG = { setMainJob: 1, progress: 1, tutorialStep: 1, setGoal: 1, raidGuideSeen: 1, logEvent: 1 };
  function act(action, payload, opts) {
    if (BG[action]) return Api.call(action, payload, opts);
    pendingWrites++;
    var run = function () {
      return Api.call(action, payload, opts).then(function (res) {
        if (res.ok && action !== 'missionClaim') missionAt = 0; // 미션 진행이 바뀌었을 수 있음 → 다음 사냥터 화면에서 다시 조회
        if (!res.ok && res.error && res.error.code === 'VERSION_CONFLICT') { toast(res.error.message); return reload().then(function () { return res; }); }
        return res;
      });
    };
    var pr = queue.then(run, run).then(function (r) { pendingWrites--; return r; }, function (e) { pendingWrites--; throw e; });
    queue = pr.then(function () {}, function () {}); return pr;
  }
  /* 화면 먼저 반영(낙관적 갱신): 결과는 같은 엔진으로 미리 계산해 바로 보여 주고, 서버 확정은 뒤에서.
   * 실패하면 안내 후 서버 상태로 다시 불러옴. 대기 중인 쓰기가 없을 때만 서버 지갑·재료 값으로 맞춤(앞선 응답이 뒤의 화면 반영을 되돌리지 않게) */
  function commit(action, payload, onOk) {
    return act(action, payload).then(function (res) {
      if (!res.ok) { if (res.error.code !== 'VERSION_CONFLICT') { toast(res.error.message); reload().then(render); } return res; }
      if (pendingWrites === 0) { if (res.data.wallet) S.wallet = res.data.wallet; if (res.data.materials) S.materials = res.data.materials; }
      if (onOk) onOk(res.data);
      return res;
    });
  }
  function reload() {
    return Api.call('loadSave', {}, { read: true }).then(function (res) { if (res.ok) setSave(res.data); return res; });
  }
  function setSave(save) {
    S = save; offset = Date.parse(save.server_time) - Date.now();
    if (!S.tutorial) S.tutorial = { step: 6, steps: 6, done: true };
  }
  Api.state.onSave = function (s) { saveState = s; var el = root.querySelector('.save'); if (el) { el.textContent = saveLabel(); el.className = 'save' + (s === 'error' ? ' err' : ''); } };
  Api.state.onTime = function (iso) { offset = Date.parse(iso) - Date.now(); };
  Api.state.onExpired = function (msg) { popup = { type: 'expired', msg: msg }; render(); };
  function saveLabel() { return saveState === 'saving' ? '저장 중…' : saveState === 'saved' ? '저장됨' : saveState === 'error' ? '저장 실패' : ''; }

  // ---------------- 렌더 ----------------
  function render() {
    var key = view.name + '|' + (popup ? popup.type : '');
    var sc = root.querySelector('.scroll'), sh = root.querySelector('.sheet');
    var keep = !resetScroll && key === lastKey, st = sc ? sc.scrollTop : 0, sst = sh ? sh.scrollTop : 0;
    var html = SCREENS[view.name] ? SCREENS[view.name](view.p) : '';
    if (popup && POPUPS[popup.type]) html += POPUPS[popup.type](popup);
    if (toastMsg) html += '<div class="toast">' + esc(toastMsg) + '</div>';
    html += '<div id="coachLayer"></div>';
    root.innerHTML = html;
    if (keep) { var a = root.querySelector('.scroll'), b = root.querySelector('.sheet'); if (a) a.scrollTop = st; if (b) b.scrollTop = sst; }
    lastKey = key; resetScroll = false;
    afterRender();
  }
  function afterRender() {
    root.querySelectorAll('[data-count]').forEach(countUp);
    revealSteps();
    layoutCoach();
  }
  // 숫자 카운트업(GM-04 결과, 전투력 상승)
  function countUp(el) {
    var to = Number(el.getAttribute('data-count')), from = Number(el.getAttribute('data-from') || 0), t0 = performance.now(), dur = 900;
    el.removeAttribute('data-count');
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur), v = from + (to - from) * (1 - Math.pow(1 - k, 3));
      el.textContent = fmt(Math.round(v));
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
    })(t0);
  }
  // 던전 탭 흐름 카드: 스크롤하면 한 장씩 나타남
  function revealSteps() {
    var els = root.querySelectorAll('.reveal:not(.in)'); if (!els.length) return;
    if (!('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (ents) { ents.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { threshold: 0.25 });
    els.forEach(function (e) { io.observe(e); });
  }

  // 공통 상단 바: 사냥 링(레이드 중에도) + 레이드 진행 중 링(레이드 화면 밖)
  function topbar() {
    var c = charOf(mainJob());
    return '<div class="topbar"><button class="home" data-a="home" aria-label="골프존 홈">⌂</button>' +
      '<div class="who">' + esc(job(mainJob()).name) + ' <b>' + fmt(c ? c.cp : 0) + '</b>' + (S.member.is_demo === 'Y' ? ' <span class="badge">시연</span>' : '') + '</div>' +
      ringsHtml() +
      '<div class="gold">G ' + fmt(S.wallet.gold) + '</div><div class="save' + (saveState === 'error' ? ' err' : '') + '">' + saveLabel() + '</div></div>' +
      '<div class="hidden-zone" data-a="hidden"></div>';
  }
  function ringsHtml() {
    var out = '';
    if (S.hunt) {
      var h = S.hunt, el = Math.max(0, now() - Date.parse(h.started_at)), full = huntFull(h);
      var pct = full ? 100 : Math.min(100, el / huntMaxMs(h) * 100);
      out += '<button class="ring' + (full ? ' full' : '') + '" data-a="openHunt" style="--p:' + pct.toFixed(1) + '" aria-label="사냥 진행"><i>사냥</i></button>';
    }
    if (dgActive() && view.name !== 'dgRaid') {
      var r = D.round, p2 = D.er ? Math.min(100, Engine.indexAt(M, D.er, now()) / r.total_events * 100) : 0;
      out += '<button class="ring raid" data-a="dgResumeRing" style="--p:' + p2.toFixed(1) + '" aria-label="레이드 진행 중"><i>레이드</i></button>';
    }
    return '<div class="rings">' + out + '</div>';
  }
  function patchRings() { var el = root.querySelector('.topbar .rings'); if (el && S) el.outerHTML = ringsHtml(); }
  function tabs(on) {
    var dot = S.chests.length ? '<i class="dot"></i>' : '';
    return '<nav class="tabs">' + [['map', '사냥터'], ['craft', '제작'], ['items', '아이템'], ['char', '캐릭터'], ['dungeon', '던전']].map(function (t) {
      return '<button data-a="tab" data-v="' + t[0] + '" class="' + (on === t[0] ? 'on' : '') + '">' + t[1] + (t[0] === 'dungeon' ? dot : '') + '</button>';
    }).join('') + '</nav>';
  }
  function gameScreen(tab, body, foot) { return '<div class="screen">' + topbar() + '<div class="scroll">' + body + '</div>' + (foot || '') + tabs(tab) + '</div>'; }

  // ---------------- 성장 목표 계산(C-1, C-10) ----------------
  /** 대표 직업 다음 별 사냥터: { star, entry, need } | null(모두 열림) */
  function nextStar(cp) {
    var t = M.huntTiers.filter(function (x) { return x.entryCp > cp; }).sort(function (a, b) { return a.entryCp - b.entryCp; })[0];
    return t ? { star: t.star, entry: t.entryCp, need: t.entryCp - cp } : null;
  }
  function nextSkill(j, cp) {
    return M.skills.filter(function (s) { return s.jobId === j && s.unlockCp > cp; }).sort(function (a, b) { return a.unlockCp - b.unlockCp; })[0] || null;
  }
  /** 추천 제작 1개: 지금 만들 수 있는 장비 중 전투력 증가가 남은 전투력에 가장 가까운 것, 없으면 가장 낮은 등급에서 증가가 큰 것 */
  function recommendItem() {
    var j = mainJob(), cp = cpOf(j), ns = nextStar(cp), need = ns ? ns.need : 0;
    var list = M.items.filter(function (it) { return it.jobId === j && cpGain(it.id) > 0; });
    if (!list.length) return null;
    var can = list.filter(function (it) { return !Engine.craftShortage(M, it.id, S.wallet, S.materials).length; });
    if (can.length) return can.sort(function (a, b) { return Math.abs(cpGain(a.id) - need) - Math.abs(cpGain(b.id) - need) || cpGain(b.id) - cpGain(a.id); })[0];
    return list.sort(function (a, b) { return a.grade - b.grade || cpGain(b.id) - cpGain(a.id); })[0];
  }
  function goalItem() {
    var id = S.member.goal_item_id;
    if (id && IX.item[id]) return IX.item[id];
    return recommendItem();
  }
  /** 재료 줄: 주·보조·특수 [{id, need, have, special}] */
  function recipeLines(itemId) {
    var rc = IX.recipe[itemId], out = [];
    var add = function (id, q, sp) { if (id && q) out.push({ id: id, need: q, have: Number(S.materials[id] || 0), special: !!sp }); };
    add(rc.mainMaterialId, rc.mainQty); add(rc.subMaterialId, rc.subQty); add(rc.specialMaterialId, rc.specialQty, true);
    return out;
  }
  /** 기본 재료가 현재 사냥 코스에서 나오는지: 모든 지역에서 3계열이 나오고(주재료 60%) 단계는 코스 별 등급이 정함 */
  function dropsHere(matId) {
    if (!S.hunt) return false;
    var m = IX.material[matId], c = IX.course[S.hunt.course_id];
    return m.family !== 'RIFT' && (IX.tier[c.star].tierProb[m.tier - 1] || 0) > 0;
  }

  // ---------------- 화면 ----------------
  var SCREENS = {
    boot: function () { return '<div class="screen" style="align-items:center;justify-content:center"><p class="sub">불러오는 중…</p></div>'; },

    /* GZ-01 골프존앱 로그인(시연용) */
    login: function (p) {
      return '<div class="screen gz"><div class="scroll" style="padding:32px 24px">' +
        '<p style="font-size:30px;font-weight:700;color:#1F3F8F">GOLFZON</p>' +
        '<p class="notice">시연용 로그인 · 테스트 계정만 사용할 수 있어요</p>' +
        '<form data-form="login" style="display:flex;flex-direction:column;gap:14px">' +
        '<input name="id" placeholder="아이디" autocomplete="username" value="' + esc(p.id || '') + '">' +
        '<input name="pw" placeholder="비밀번호(4자리)" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password">' +
        '<p class="err">' + esc(p.err || '') + '</p>' +
        '<button class="btn" type="submit"' + (p.busy ? ' disabled' : '') + '>' + (p.busy ? '확인 중…' : '로그인') + '</button></form>' +
        '<p class="sub" style="text-align:center;color:#4A5650">회원가입 · 아이디/비밀번호 찾기 (시연에서 비활성)</p>' +
        '</div></div>';
    },

    /* GZ-02 골프존앱 메인(추천탭) 재현: 상단 글로벌 영역 중앙 우측 [스크린 로그인]이 레이드의 유일한 진입(C-11).
     * 실제 앱 화면(360 기준)과 버튼 위치·크기를 맞춤. 광고 배너 자리에 게임 배너(입장) */
    launcher: function () {
      var ic = {
        cal: '<rect x="5" y="7" width="22" height="18" rx="2" fill="#E9ECF1" stroke="#9AA3AF"/><rect x="5" y="7" width="22" height="5" fill="#9AA3AF"/><circle cx="24" cy="23" r="6" fill="#F04E4E"/><path d="M24 20v3.5h2.5" stroke="#fff" stroke-width="1.6" fill="none"/>',
        pin: '<path d="M16 4a8 8 0 0 0-8 8c0 6 8 15 8 15s8-9 8-15a8 8 0 0 0-8-8z" fill="#2D6FE0"/><circle cx="16" cy="12" r="4.5" fill="#fff"/><text x="16" y="14.5" font-size="6.5" text-anchor="middle" fill="#2E8B57" font-weight="700">P</text>',
        coin: '<ellipse cx="16" cy="23" rx="9" ry="3.5" fill="#E2A92B"/><ellipse cx="16" cy="20" rx="9" ry="3.5" fill="#F2C24A"/><circle cx="17" cy="12" r="7" fill="#F2C24A" stroke="#D9A21E"/><text x="17" y="15" font-size="8" text-anchor="middle" fill="#fff" font-weight="700">G</text>',
        plus: '<rect x="7" y="8" width="18" height="17" rx="3" fill="#F3F4F6" stroke="#D1D5DB"/><path d="M16 11v11M10.5 16.5h11" stroke="#F0743A" stroke-width="4" stroke-linecap="round"/>',
        gtour: '<text x="16" y="19" font-size="7.4" text-anchor="middle" fill="#1F2A44" font-weight="800" letter-spacing=".2">GTOUR</text>',
        range: '<path d="M10 7l6-2v8l-6 2z" fill="#F0743A"/><path d="M16 5l6 2v8l-6-2z" fill="#1F3F8F"/><text x="16" y="22" font-size="4.6" text-anchor="middle" fill="#4A5260" font-weight="800">GOLFZON</text><text x="16" y="27" font-size="5" text-anchor="middle" fill="#4A5260" font-weight="800">RANGE</text>',
        chip: '<circle cx="12" cy="17" r="6" fill="#F04E4E"/><circle cx="12" cy="17" r="2.6" fill="#fff"/><circle cx="21" cy="10" r="5" fill="#2D6FE0"/><circle cx="21" cy="10" r="2" fill="#fff"/><ellipse cx="17" cy="25" rx="8" ry="2.5" fill="#9CA3AF"/>',
        score: '<rect x="6" y="7" width="9" height="8" fill="#2D6FE0"/><rect x="17" y="7" width="9" height="8" fill="#2D6FE0"/><rect x="6" y="17" width="9" height="8" fill="#E5E7EB"/><rect x="17" y="17" width="9" height="8" fill="#E5E7EB"/><text x="10.5" y="13.5" font-size="6" fill="#fff" text-anchor="middle">1</text><text x="21.5" y="13.5" font-size="6" fill="#fff" text-anchor="middle">2</text><text x="10.5" y="23.5" font-size="6" fill="#333" text-anchor="middle">0</text><text x="21.5" y="23.5" font-size="6" fill="#333" text-anchor="middle">-1</text>',
        feed: '<rect x="5" y="7" width="20" height="16" rx="2" fill="#3B82F6"/><rect x="5" y="7" width="20" height="4" fill="#E5E7EB"/><circle cx="23" cy="22" r="5.5" fill="#F04E4E"/><path d="M23 25l-2.6-2.6a1.5 1.5 0 0 1 2.6-1.6 1.5 1.5 0 0 1 2.6 1.6z" fill="#fff"/>',
        album: '<rect x="6" y="8" width="20" height="16" fill="#fff" stroke="#D1D5DB"/><rect x="8" y="10" width="16" height="12" fill="#5BC0EB"/><path d="M8 22l5-6 4 4 3-3 4 5z" fill="#3FA34D"/><path d="M12 11v6" stroke="#fff"/><path d="M12 11l3 1-3 1" fill="#F04E4E"/>'
      };
      var svg = function (k) { return '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">' + ic[k] + '</svg>'; };
      var apps = [['cal', '스크린예약'], ['pin', '매장찾기'], ['coin', '혜택존'], ['plus', '플러스샵'], ['gtour', 'GTOUR'], ['range', '연습예약'], ['chip', '골프한판'], ['score', '필드라이프'], ['feed', '피드'], ['album', '앨범']];
      var nav = [['home', '홈', '<path d="M5 13l11-8 11 8v13H5z" fill="#111"/><text x="16" y="22" font-size="9" fill="#fff" text-anchor="middle" font-weight="800">G</text>'],
        ['friend', '골프친구', '<circle cx="16" cy="16" r="9" fill="none" stroke="#9CA3AF" stroke-width="2"/><path d="M7 14h18M12 20c2 2 6 2 8 0" stroke="#9CA3AF" stroke-width="2" fill="none"/>'],
        ['member', '멤버십', '<path d="M16 5l9 5v12l-9 5-9-5V10z" fill="none" stroke="#9CA3AF" stroke-width="2"/><text x="16" y="20" font-size="9" fill="#9CA3AF" text-anchor="middle" font-weight="800">G</text>'],
        ['my', 'MY', '<circle cx="16" cy="16" r="10" fill="none" stroke="#9CA3AF" stroke-width="2"/><circle cx="16" cy="13" r="3.5" fill="none" stroke="#9CA3AF" stroke-width="2"/><path d="M10 22c3-4 9-4 12 0" stroke="#9CA3AF" stroke-width="2" fill="none"/>'],
        ['menu', '전체메뉴', '<path d="M9 10h14M7 16h12M9 22h14" stroke="#9CA3AF" stroke-width="2.2"/>']];
      return '<div class="screen gzm">' +
        '<header class="gzm-top"><button class="gzm-nick" data-a="gzMy">' + esc(S.member.nickname) + ' <span>›</span></button>' +
        '<button class="gzm-sl sl-btn" data-a="launcherScreen" data-mini="sl">스크린 로그인</button>' +
        '<svg class="gzm-ic" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="7" fill="none" stroke="#111" stroke-width="2.2"/><path d="M16 16l5 5" stroke="#111" stroke-width="2.4" stroke-linecap="round"/></svg>' +
        '<svg class="gzm-ic pass" viewBox="0 0 30 24"><path d="M3 7V3h4M27 7V3h-4M3 17v4h4M27 17v4h-4" stroke="#111" stroke-width="2" fill="none"/><text x="15" y="15.5" font-size="8.6" font-style="italic" font-weight="800" text-anchor="middle" fill="#111">PASS</text></svg>' +
        '<svg class="gzm-ic" viewBox="0 0 24 24"><path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z" fill="none" stroke="#111" stroke-width="2"/><path d="M10 21h4" stroke="#111" stroke-width="2"/></svg></header>' +
        '<div class="gzm-scroll scroll">' +
        raidBanner() + '<nav class="gzm-tabs"><b>추천</b><span>스크린</span><span class="gzm-game" data-a="enterGame">게임<sup>NEW</sup></span><span>필드</span><span>연습</span><span>쇼핑</span><span>미디어</span></nav>' +
        '<div class="gzm-notice"><i style="background-image:url(' + asset('icon_game.png') + ')"></i><div><b>스크린 라운드가 던전 레이드로!</b><p>골프존 G핸디 등급으로 보스를 공략해요 ✨</p></div><span class="x">✕</span></div>' +
        '<div class="gzm-apps launcher">' + apps.map(function (a) { return '<div><i>' + svg(a[0]) + '</i><span>' + a[1] + '</span></div>'; }).join('') + '</div>' +
        '<div class="gzm-banner" data-a="enterGame" style="background-image:linear-gradient(90deg,#0B0716F2 10%,#0B0716AA 45%,#0B071600 75%),url(' + asset('webtoon_01.jpg') + ')"><em>NEW</em>' +
        '<div><p class="t1">골프존앱 방치형 RPG</p><p class="t2">균열의 페어웨이</p><p class="t3">탭하여 게임 시작 ›</p></div><span class="pg">1 / 5</span></div>' +
        '<div class="gzm-cards"><div class="c red"><p>사냥은 방치로</p><b>코스가 곧<br>사냥터</b></div><div class="c"><p class="blue">스크린 연동</p><b>샷이 곧<br>보스 공격!</b></div><div class="c"><p class="blue">튜토리얼</p><b>완료하면<br>300G 지급</b></div></div>' +
        '<div class="gzm-fill"></div></div>' +
        '<div class="gzm-pass"><b class="gp">G</b><b class="pt">PASS</b><span class="pm">포인트·머니 ⌃</span><span class="pb">포인트 혜택</span><b class="amt">0원</b></div>' +
        '<nav class="gzm-nav">' + nav.map(function (n, i) { return '<button' + (i === 0 ? ' class="on"' : '') + (n[0] === 'my' ? ' data-a="gzMy"' : '') + '><svg viewBox="0 0 32 32" width="24" height="24">' + n[2] + '</svg><span>' + n[1] + '</span></button>'; }).join('') + '</nav>' +
        '</div>';
    },

    /* GM-00 인트로 웹툰(P0 축약 4컷 ①②⑦⑨, B-15: 1·2컷 이미지 교체) */
    intro: function () {
      var n = esc(S.member.nickname);
      var cuts = [
        ['webtoon_02.jpg', 'linear-gradient(#0B1712,#2A1F5C)', ['균열의 페어웨이']],
        ['webtoon_01.jpg', 'linear-gradient(#13251C,#2B4A3A)', [n + '님, 오늘도 스크린 앞에 섰습니다.', '"이 퍼트만 넣으면…"']],
        ['webtoon_07.jpg', 'linear-gradient(#2B4A3A,#6A4BD8)', ['"안녕! 나는 캐디 요정 피노야."', '"균열 너머 이 세계의 코스는 몬스터에게 점령당했어."']],
        ['webtoon_09.jpg', 'linear-gradient(#6A4BD8,#13251C)', ['"네 명의 너와 함께, 코스를 되찾으러 가자!"']]
      ];
      var cur = view.p.cut || 0, last = cur === cuts.length - 1;
      return '<div class="screen intro' + (last ? ' last' : '') + '" style="position:relative"><button class="skip" data-a="introSkip">건너뛰기 ›</button>' +
        '<div class="webtoon" data-scroll="intro">' +
        cuts.map(function (c, i) {
          return '<section class="cut' + (i <= cur ? ' in' : '') + '" data-cut="' + i + '" style="background-image:url(' + asset(c[0]) + '),' + c[1] + '">' +
            (i === 0 ? '<h1 class="title" style="font-size:40px;text-align:center">균열의 페어웨이</h1><p style="text-align:center;align-self:center">스크린 라운드가 레이드가 되는 곳</p>' : c[2].map(function (t) { return '<p>' + t + '</p>'; }).join('')) + '</section>';
        }).join('') + '<div style="height:96px"></div></div>' +
        '<div class="cutdots">' + cuts.map(function (c, i) { return '<i class="' + (i === cur ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
        '<div class="introfoot"><button class="btn purple" data-a="introDone">모험 시작</button></div>' +
        '<div class="swipehint"><span>아래로 넘겨 보세요</span><b>⌄</b></div>' +
        '</div>';
    },

    /* GM-01 사냥터 지역 지도 + 다음 목표 카드 + 미션·랭킹 아이콘 */
    map: function () {
      var pos = { METRO: [24, 14], GANGWON: [68, 12], CHUNGCHEONG: [22, 30], JEOLLA: [22, 47], GYEONGSANG: [72, 36], JEJU: [21, 70], OVERSEAS: [74, 61], VIRTUAL: [52, 79] };
      var mj = mainJob(), cp = cpOf(mj), tot = 0, opn = 0;
      setTimeout(function () { missionRefresh(false); rankRefresh(180000); }, 0);
      // 지역별 해금 코스 수 / 전체 코스 수(대표 캐릭터 전투력 기준) — 해금 니즈를 지도에서 바로 보여 줌(v0.5 보완)
      var pins = M.regions.map(function (r) {
        var list = M.courses.filter(function (c) { return c.regionId === r.id; });
        var n = list.filter(function (c) { return Engine.canEnterCourse(M, cp, c); }).length, all = list.length, p = pos[r.id];
        tot += all; opn += n;
        var here = S.hunt && IX.course[S.hunt.course_id] && IX.course[S.hunt.course_id].regionId === r.id;
        return '<button class="pin' + (n ? '' : ' lock') + (n === all ? ' full' : '') + (here ? ' hunting' : '') + '" style="left:' + p[0] + '%;top:' + p[1] + '%" data-a="' + (here ? 'openHunt' : 'region') + '" data-v="' + r.id + '">' +
          (here ? '<em class="hunttag">사냥 중</em>' : '') +
          '<span class="pn">' + esc(r.name) + '</span><span class="pc"><b>' + n + '</b> / ' + all + '</span>' +
          '<i class="pbar"><i style="width:' + Math.round(n / Math.max(1, all) * 100) + '%"></i></i></button>';
      }).join('');
      var ns = nextStar(cp);
      return gameScreen('map',
        '<div class="row" style="gap:8px">' + goalCard() +
        '<div class="sideicons"><button data-a="missions" aria-label="일일 미션"' + (missionReady() ? ' class="ready"' : '') + '>' + img('icon_mission.png') + '<span>' + (missionReady() ? '받기' : '미션') + '</span>' +
        (missionReady() ? '<b class="nbadge">' + missionReady() + '</b>' : '') + '</button>' +
        '<button data-a="rank" aria-label="랭킹">' + img('icon_rank.png') + '<span>랭킹</span></button></div></div>' +
        huntBar() +
        '<div class="map" style="background-image:url(' + asset('map_world.jpg') + '),radial-gradient(circle at 30% 30%,#24503B,#15301F 70%)">' +
        '<div class="maplegend"><b>' + esc(job(mj).name) + ' · 전투력 ' + fmt(cp) + ' 기준</b><span>해금 코스 <b>' + opn + '</b> / ' + tot + (ns ? ' · ' + fmt(ns.need) + ' 더 올리면 ' + ns.star + '성 해금' : '') + '</span></div>' + pins + '</div>' +
        '<button class="btn gold" data-a="region" data-v="REC" data-tut="rec">지금 사냥 가능한 코스 보기</button>');
    },

    /* GM-02 코스 목록 (p.region: 지역ID|'REC', p.mat: 재료 획득처) */
    courses: function (p) {
      var cp = cpOf(mainJob()), list, title;
      function status(c) {
        if (!Engine.canEnterCourse(M, cp, c)) return { t: '잠김 · 전투력 ' + fmt(IX.tier[c.star].entryCp) + ' 필요', cls: 'lbl-bad', rank: 0 };
        var e = Engine.huntEfficiency(M, cp, c);
        return e >= 1 ? { t: '입장 가능 · 효율 100%', cls: 'lbl-ok', rank: 2 + c.star / 10 } : { t: '효율 낮음 · ' + Math.round(e * 100) + '%', cls: 'lbl-warn', rank: 1 + e };
      }
      if (p.mat) {
        var m = IX.material[p.mat];
        title = m.name + ' 획득 사냥터';
        list = M.courses.filter(function (c) { return (IX.tier[c.star].tierProb[m.tier - 1] || 0) > 0 && (IX.region[c.regionId].mainFamily === m.family || IX.region[c.regionId].mainFamily === 'ALL'); })
          .sort(function (a, b) { return status(b).rank - status(a).rank || (status(a).rank ? b.star - a.star : a.star - b.star); }).slice(0, 30);
      } else if (p.region === 'REC') {
        title = '내 전투력에 맞는 코스';
        list = M.courses.filter(function (c) { return Engine.canEnterCourse(M, cp, c); })
          .sort(function (a, b) { return Engine.huntEfficiency(M, cp, b) - Engine.huntEfficiency(M, cp, a) || b.star - a.star; }).slice(0, 30);
      } else {
        title = IX.region[p.region].name;
        list = M.courses.filter(function (c) { return c.regionId === p.region; }).sort(function (a, b) { return status(b).rank - status(a).rank || b.star - a.star; });
      }
      return gameScreen('map', '<div class="row"><button class="chip" data-a="tab" data-v="map">‹ 지도</button><b style="flex:1">' + esc(title) + '</b><span class="small">' + list.length + '개</span></div>' +
        (p.mat ? '<p class="small">' + esc(FAM_NAME[IX.material[p.mat].family]) + ' 계열이 주재료인 지역 · ' + IX.material[p.mat].tier + '단계가 나오는 별 등급</p>' : '') +
        list.map(function (c, i) {
          var st = status(c), fam = FAM_NAME[IX.region[c.regionId].mainFamily] || '전 계열';
          return '<button class="card' + (i === 0 && p.region === 'REC' ? ' hl' : '') + '" style="text-align:left' + (st.rank === 0 ? ';opacity:.6' : '') + '" data-a="pickCourse" data-v="' + c.id + '"' + (i === 0 ? ' data-tut="course"' : '') + '>' +
            '<div class="row"><b>' + esc(c.name) + '</b><span class="' + st.cls + '" style="font-size:13px">' + st.t + '</span></div>' +
            '<p class="sub">' + '★'.repeat(c.star) + ' · ' + esc(IX.region[c.regionId].name) + ' · 주재료 ' + fam + (c.star >= 3 ? ' · <span class="riftTag">균열 파편 드랍</span>' : '') + '</p></button>';
        }).join(''));
    },

    /* GM-03 자동사냥 진행: 공격 루프 연출 + 누적 보상 카운터 + 성장 목표 패널 */
    hunt: function () {
      var h = S.hunt;
      if (!h) return gameScreen('map', '<p class="sub">진행 중인 사냥이 없습니다.</p><button class="btn" data-a="tab" data-v="map">사냥터로</button>');
      var c = IX.course[h.course_id], j = h.job_id || mainJob(), reg = String(c.regionId).toLowerCase();
      return gameScreen('map',
        '<div class="row"><button class="chip" data-a="tab" data-v="map">‹ 지도</button><b style="flex:1">' + esc(c.name) + '</b><span class="small">' + '★'.repeat(c.star) + '</span></div>' +
        (dgActive() ? '<button class="raidbadge" data-a="dgResumeRing">레이드 진행 중 · 사냥은 계속돼요 ›</button>' : '') +
        '<div class="stage hstage" data-hunt-stage>' +
        '<div class="hfig hero-main">' + charPic(j, lookOf(j), 'both') + '</div>' +
        '<div class="hfig mob">' + img('mob_' + reg + '_idle.png', 'idle') + img('mob_' + reg + '_hit.png', 'hit') + '</div>' +
        '<div class="fxlayer"></div></div>' +
        '<div class="card" id="huntCounter">' + huntCounterHtml() + '</div>' +
        growthPanel(),
        '<div class="dgfoot" style="background:var(--bg)">' + claimButton() + '</div>');
    },

    /* GM-05 제작 */
    craft: function (p) {
      var j = p.job || mainJob(), filter = 'all', // v0.6.3: [전체]/[지금 만들 수 있는 것] 삭제(직업·부위 필터로 대체, 정렬은 제작 가능 먼저)
 part = p.part || '', mats = S.materials, w = S.wallet, tutWeapon = tutActive() && !TUT.replay && tutCur() === 4;
      var list = M.items.filter(function (it) { return it.jobId === j && (!part || it.partId === part); }).map(function (it) {
        return { it: it, short: Engine.craftShortage(M, it.id, w, mats) };
      });
      if (filter === 'can') {
        var can = list.filter(function (x) { return !x.short.length; });
        list = can.length ? can : list.filter(function (x) { return x.it.grade === 1; });
      }
      list.sort(function (a, b) { return a.short.length - b.short.length || a.it.grade - b.it.grade; });
      if (tutWeapon) list.sort(function (a, b) { return (b.it.grade === 1 && b.it.partId === 'WEAPON') - (a.it.grade === 1 && a.it.partId === 'WEAPON'); });
      var goal = S.member.goal_item_id;
      return gameScreen('craft',
        '<div class="chips">' + JOBS.map(function (x) { return '<button class="chip' + (x === j ? ' on' : '') + '" data-a="craftJob" data-v="' + x + '">' + job(x).name + '</button>'; }).join('') + '</div>' +
        // v0.6.2: 캐릭터 빈 칸에서 들어오면 직업·부위 고정 + 안내 카드(다른 직업·부위 잘못 제작 방지)
        (part ? '<div class="card slotfor"><div class="row" style="justify-content:flex-start;gap:10px"><div class="icon g0"><span>' + partName(part) + '</span></div><div style="flex:1"><span class="small">캐릭터 빈 칸 장비 만들기</span><b>' + esc(job(j).name) + ' · ' + partName(part) + '</b>' +
          (equippedAt(j, part) ? '<p class="small">지금 장착: ' + esc(IX.item[equippedAt(j, part).item_id].name) + '</p>' : '<p class="small">만들면 ' + esc(job(j).name) + '의 ' + partName(part) + ' 칸에 장착할 수 있어요</p>') + '</div></div></div>' : '') +
        '<div class="chips parts"><button class="chip' + (!part ? ' on' : '') + '" data-a="craftPart" data-v="">전체 부위</button>' + M.parts.map(function (pt) { return '<button class="chip' + (part === pt.id ? ' on' : '') + '" data-a="craftPart" data-v="' + pt.id + '">' + pt.name + '</button>'; }).join('') + '</div>' +
        (goal && IX.item[goal] ? '<button class="card goalline" data-a="craftDetail" data-v="' + goal + '"><span class="small">목표 장비</span><b>' + esc(IX.item[goal].name) + '</b><span class="small">›</span></button>' : '') +
        (filter === 'can' && !list.some(function (x) { return !x.short.length; }) ? '<p class="sub">지금 만들 수 있는 장비가 없어요. 사냥으로 재료를 모아 보세요.</p>' : '') +
        list.map(function (x) {
          var lines = recipeLines(x.it.id), rc = IX.recipe[x.it.id];
          var spLine = lines.filter(function (l) { return l.special; })[0];
          var weapon = x.it.grade === 1 && x.it.partId === 'WEAPON';
          return '<button class="card" style="text-align:left" data-a="craftDetail" data-v="' + x.it.id + '"' + (weapon ? ' data-tut="craftWeapon"' : '') + '><div class="row" style="justify-content:flex-start">' + itemIcon(x.it.id) +
            '<div style="flex:1"><div class="row"><b>' + esc(x.it.name) + (goal === x.it.id ? ' <span class="badge">목표</span>' : '') + '</b><span class="' + (x.short.length ? 'lbl-bad' : 'lbl-ok') + '" style="font-size:12px">' + (x.short.length ? '재료 부족' : '제작 가능') + '</span></div>' +
            '<p class="sub">' + GRADE_NAME[x.it.grade] + ' · 전투력 +' + fmt(x.it.cp) + '</p><p class="small">' + lines.filter(function (l) { return !l.special; }).map(function (l) { return esc(matName(l.id)) + ' ' + l.have + '/' + l.need; }).join(' · ') + ' · 골드 ' + fmt(rc.gold) + '</p>' +
            (spLine ? '<p class="small spline">특수 · ' + esc(matName(spLine.id)) + ' ' + spLine.have + '/' + spLine.need + '</p>' : '') + '</div></div></button>';
        }).join(''));
    },

    /* GM-06 아이템(공용 인벤토리) — 재료 탭: 기본/특수 구역 + [합성] */
    items: function (p) {
      var tab = p.tab || 'equip', body = '';
      if (tab === 'mat') {
        var basic = Object.keys(S.materials).filter(function (k) { return S.materials[k] > 0 && IX.material[k] && !IX.material[k].isSpecial; }).sort();
        var special = M.materials.filter(function (m) { return m.isSpecial; }).map(function (m) { return m.id; });
        body = '<b class="sect">기본 재료 <span class="small">사냥에서 획득</span></b>' +
          (basic.length ? basic.map(matRow).join('') : '<p class="sub">아직 재료가 없어요 · 사냥터에서 모아 보세요</p><button class="btn ghost" data-a="tab" data-v="map">사냥하러 가기</button>') +
          '<b class="sect">특수 재료 <span class="small">던전 레이드에서 획득 · 희귀 이상 제작</span></b>' + special.map(matRow).join('');
      } else if (tab === 'equip') {
        var its = S.items.slice().sort(function (a, b) { return IX.item[b.item_id].grade - IX.item[a.item_id].grade; });
        body = its.length ? '<div class="grid">' + its.map(function (x) {
          var it = IX.item[x.item_id];
          return '<button class="cell g' + it.grade + '" data-a="itemDetail" data-v="' + x.inv_item_id + '">' + itemIcon(x.item_id) + '<b class="gname">' + GRADE_NAME[it.grade] + '</b><span>' + esc(it.name) + '</span>' + (x.equipped_job_id ? '<span class="lbl-ok">장착 중</span>' : '') + '</button>';
        }).join('') + '</div>' : '<p class="sub">아직 장비가 없어요</p><button class="btn ghost" data-a="tab" data-v="craft">제작하러 가기</button>';
      } else {
        body = S.chests.length ? S.chests.map(function (c) {
          return '<div class="card"><div class="row"><b class="g' + c.reward_grade + '"><span class="gname">' + GRADE_NAME[c.reward_grade] + ' 상자</span></b>' + (c.is_bonus === 'Y' ? '<span class="badge">1+1</span>' : '') + '</div><button class="btn purple" data-a="chestOpen" data-v="' + c.chest_id + '">열기</button></div>';
        }).join('') : '<p class="sub">보관 중인 상자가 없어요 · 던전 레이드에서 얻을 수 있어요</p>';
        body += '<button class="btn ghost" data-a="probs">확률 보기</button>';
      }
      return gameScreen('items', '<div class="chips">' + [['mat', '재료'], ['equip', '장비'], ['chest', '상자']].map(function (t) {
        return '<button class="chip' + (tab === t[0] ? ' on' : '') + '" data-a="itemTab" data-v="' + t[0] + '">' + t[1] + (t[0] === 'chest' && S.chests.length ? ' ' + S.chests.length : '') + '</button>';
      }).join('') + '</div>' + body);
    },

    /* GM-07 캐릭터: 전투력 도움말·다음 스킬·계정 전투력 */
    char: function (p) {
      var j = p.job || mainJob(), cp = cpOf(j), sk = Engine.topSkill(M, j, cp), nsk = nextSkill(j, cp);
      var eq = S.items.filter(function (x) { return x.equipped_job_id === j; });
      var slots = M.parts.map(function (pt) {
        var x = eq.filter(function (e) { return IX.item[e.item_id].partId === pt.id; })[0];
        return x ? '<button class="cell g' + IX.item[x.item_id].grade + '" data-a="itemDetail" data-v="' + x.inv_item_id + '">' + itemIcon(x.item_id) + '<span>' + esc(IX.item[x.item_id].name) + '</span></button>'
          : '<button class="cell" data-a="slotPick" data-v="' + pt.id + '" data-j="' + j + '" data-tut="slot-' + pt.id + '"><div class="icon"><span>' + pt.name + '</span></div><span class="small">비어 있음</span></button>';
      }).join('');
      setTimeout(function () { rankRefresh(60000); }, 0);
      var isMain = j === mainJob(), fx = CPFX && CPFX.job === j && Date.now() - CPFX.at < 4000 ? CPFX : null;
      return gameScreen('char',
        '<div class="chips">' + JOBS.map(function (x) { return '<button class="chip' + (x === j ? ' on' : '') + '" data-a="charJob" data-v="' + x + '">' + job(x).name + (x === mainJob() ? ' ★' : '') + '</button>'; }).join('') + '</div>' +
        '<div class="card" data-tut="cp"><div class="row"><b>' + (isMain ? '현재 대표: ' : '살펴보는 캐릭터: ') + esc(job(j).name) + '</b>' + (isMain ? '<span class="lbl-warn">★ 대표</span>' : '<button class="chip" data-a="setMain" data-v="' + j + '">대표로 설정</button>') + '</div>' +
        '<div class="row" style="justify-content:flex-start;gap:6px"><span class="sub">전투력</span><b class="cpnum"' + (fx ? ' data-from="' + fx.from + '" data-count="' + fx.to + '"' : '') + '>' + fmt(cp) + '</b>' +
        (fx ? '<span class="cpup">' + fmt(fx.from) + ' → ' + fmt(fx.to) + '</span>' : '') + '<button class="info" data-a="cpHelp" aria-label="전투력 도움말">ⓘ</button></div>' +
        '<div class="skillrow"><button class="skillchip on" data-a="skillInfo" data-v="' + sk.id + '"><i>현재 스킬</i><b>' + esc(sk.name) + '</b><span>×' + sk.coef + '</span></button>' +
        (nsk ? '<button class="skillchip next" data-a="skillInfo" data-v="' + nsk.id + '"><i>다음 스킬 · ' + fmt(nsk.unlockCp - cp) + ' 남음</i><b>' + esc(nsk.name) + '</b><span>×' + nsk.coef + '</span></button>' : '<span class="skillchip done"><i>스킬</i><b>모두 해금</b></span>') + '</div>' +
        '<p class="small">역할 ' + esc(job(j).role) + ' · 스킬을 누르면 설명과 데미지 계수를 볼 수 있어요</p></div>' +
        '<div class="card"><div class="row"><span class="sub">계정 전투력(4직업 합)</span><b style="flex:1">' + fmt(accountCp()) + '</b><button class="chip" data-a="rank">랭킹 보기</button></div>' + (rankLine() ? '<p class="rankpos">' + rankLine() + ' · 랭커 카드에 내 4캐릭터 모습이 보여요</p>' : '') + '</div>' +
        lookCard(j) +
        '<b>장비 8부위</b><div class="grid">' + slots + '</div>' +
        '<b style="margin-top:8px">설정</b>' +
        '<button class="btn ghost" data-a="replayTutorial">튜토리얼 다시 보기</button>' +
        '<button class="btn ghost" data-a="replayIntro">인트로 다시 보기</button>' +
        (S.member.is_demo === 'Y' ? '<button class="btn danger" data-a="resetDemo">시연 초기화</button>' : '') +
        '<button class="btn ghost" data-a="logout">로그아웃</button>');
    },

    /* GM-10 랭킹(v0.6 B-40): 상위 20 랭커 카드(4캐릭터 외형·전투력 + 합산), 1~3위 시상대, 하단 고정 내 카드 */
    rank: function (p) {
      var d = p.data;
      var body = '<div class="row"><button class="chip" data-a="tab" data-v="map">‹ 지도</button><b style="flex:1">전투력 랭킹</b><span class="small">계정 합산(4직업)</span></div>' +
        '<p class="ranknote">장비를 만들어 장착하면 캐릭터 모습이 바뀌고, 다른 골퍼에게도 그 모습이 보여요</p>';
      if (!d) body += '<p class="sub">불러오는 중…</p>';
      else if (!d.top.length) body += '<p class="sub">아직 순위가 없어요</p>';
      else body += podium(d.top.slice(0, 3)) + d.top.map(function (x) { return rankCard(x); }).join('') + '<p class="small">상위 ' + d.top.length + '명 · 전체 ' + d.total + '명 · 동점은 먼저 도달한 순</p>';
      var foot = '';
      if (d) foot = '<div class="rankme">' + (d.me ? rankCard(d.me, true) +
        '<div class="row mynext"><span>' + (d.me.rank === 1 ? '1위를 지키고 있어요!' : (d.me.next_gap ? '다음 순위(' + (d.me.rank - 1) + '위)까지 전투력 <b>' + fmt(d.me.next_gap) + '</b>' : (d.me.rank - 1) + '위와 동점 · 전투력을 올리면 <b>앞설 수 있어요</b>')) + '</span><button class="chip gold" data-a="tab" data-v="craft">제작하러 가기</button></div>'
        : '<p class="small" style="padding:6px 0">시연 계정은 랭킹에서 제외돼요</p>') + '</div>';
      return gameScreen('map', body, foot);
    }
  };

  function matRow(id) {
    var m = IX.material[id], have = Number(S.materials[id] || 0);
    var up = M.materials.filter(function (x) { var c = Engine.composeCost(M, x.id); return c && c.fromId === id; })[0];
    return '<div class="matrow g' + m.tier + '">' + matIcon(id) + '<div style="flex:1"><b class="gname">' + esc(m.name) + '</b><p class="small">' + fmt(have) + '개' + (m.isSpecial ? ' · 특수' : '') + '</p></div>' +
      (up ? '<button class="chip compose" data-a="composeOpen" data-v="' + up.id + '"' + (have ? '' : ' disabled') + '>' + img('icon_compose.png') + '합성</button>' : '') + '</div>';
  }
  function medal(n) { return n <= 3 && APP_CONFIG.RANK_MEDALS ? '<span class="medal img">' + img('rank_medal_' + n + '.png') + '<b>' + n + '</b></span>' : '<span class="medal m' + (n <= 3 ? n : 0) + '"><b>' + n + '</b></span>'; }
  function rLook(c) { return { stage: Number(c.look_stage || 0), set: Number(c.set_tier || 0) }; }
  /** 랭커 카드: 1행 순위·닉네임·골프존 등급·합산, 2행 4캐릭터(외형·세트·전투력, 대표 ★) */
  function rankCard(x, mine) {
    var chars = (x.chars || []).map(function (c) {
      var lk = rLook(c);
      return '<div class="rch" style="--lc:' + LOOK_COLOR[lk.stage] + '">' + charPic(c.job_id, lk, 'idle', 'mini') +
        (c.job_id === x.main_job_id ? '<i class="star">★</i>' : '') + (lk.set ? '<i class="rset">' + setLabel(lk) + '</i>' : '') +
        '<span>' + esc(job(c.job_id).name) + '</span><b>' + fmt(c.cp) + '</b></div>';
    }).join('');
    return '<div class="rcard' + (x.rank <= 3 ? ' top' + x.rank : '') + (x.is_me ? ' me' : '') + (mine ? ' mine' : '') + '">' +
      '<div class="rhead">' + medal(x.rank) + '<b class="rname">' + esc(x.nickname) + (x.is_me ? ' (나)' : '') + '</b>' + (x.grade_code ? '<span class="grd">' + esc(x.grade_code) + '</span>' : '') +
      '<span class="rtot"><span>합산</span><b>' + fmt(x.account_cp) + '</b></span></div>' +
      (mine ? '' : '<div class="rchars">' + chars + '</div>') + '</div>';
  }
  /** 1~3위 시상대: 대표 캐릭터 외형 크게(1위 가운데) */
  function podium(top) {
    var order = [top[1], top[0], top[2]];
    return '<div class="podium">' + order.map(function (x) {
      if (!x) return '<div class="pod empty"></div>';
      var c = (x.chars || []).filter(function (c) { return c.job_id === x.main_job_id; })[0] || (x.chars || [])[0] || { job_id: 'WAR' };
      return '<div class="pod p' + x.rank + (x.is_me ? ' me' : '') + '">' + charPic(c.job_id, rLook(c), 'idle', 'pod') + medal(x.rank) +
        '<b class="pname">' + esc(x.nickname) + '</b><span class="pcp">' + fmt(x.account_cp) + '</span><i class="step"></i></div>';
    }).join('') + '</div>';
  }
  function goalCard() {
    var cp = cpOf(mainJob()), ns = nextStar(cp), rec = recommendItem();
    var head = ns ? '<b>' + ns.star + '성 사냥터까지 전투력 ' + fmt(ns.need) + '</b><div class="bar"><i style="width:' + Math.min(100, cp / ns.entry * 100) + '%"></i></div>'
      : '<b>모든 사냥터 입장 가능</b>';
    var lg = lookGoalOf(mainJob(), S.items), me = LAST.rank && LAST.rank.me;
    return '<button class="card goal" data-a="goalCard" data-tut="goal"><span class="small" style="color:var(--gold)">다음 목표</span>' + head +
      '<span class="small">' + (rec ? '추천 제작 · ' + esc(rec.name) + ' (+' + fmt(cpGain(rec.id)) + ')' : '추천 제작 없음') + '</span>' +
      '<span class="goalx">' + (lg.done ? '' : '<i style="color:' + LOOK_COLOR[lg.stage] + '">외형</i>' + esc(lg.kind === 'stage' ? LOOK_NAME[lg.stage] + '까지 ' + lg.need + '부위' : lg.short)) +
      (me && me.rank > 1 ? '<i class="rk">랭킹</i>' + me.rank + '위 · ' + (me.next_gap ? (me.rank - 1) + '위까지 ' + fmt(me.next_gap) : (me.rank - 1) + '위와 동점') : me && me.rank === 1 ? '<i class="rk">랭킹</i>1위' : '') + '</span></button>';
  }
  /** 받을 수 있는 미션 보상 수(완료·미수령). 사냥터 화면이 보일 때 30초마다 뒤에서 갱신 */
  function missionReady() {
    var d = LAST.missions; if (!d || !d.missions) return 0;
    return d.missions.filter(function (x) { return x.done && !x.claimed; }).length;
  }
  var missionAt = 0, claimAt = 0;
  function missionRefresh(force) {
    if (!S || (!force && Date.now() - missionAt < 30000)) return;
    missionAt = Date.now(); var t0 = Date.now();
    Api.call('missions', {}, { read: true }).then(function (res) {
      if (!res.ok || !S || claimAt >= t0) return; // 요청 뒤에 보상을 받았으면 지난 값이므로 버림
      var before = missionReady(); LAST.missions = res.data;
      if (popup && popup.type === 'missions') popup.data = res.data;
      if (missionReady() !== before && (view.name === 'map' || (popup && popup.type === 'missions'))) render();
    });
  }
  function huntBar() {
    if (!S.hunt) return '';
    var h = S.hunt, c = IX.course[h.course_id], full = huntFull(h), el = Math.max(0, now() - Date.parse(h.started_at)), mx = huntMaxMs(h);
    var pct = full ? 100 : Math.min(100, el / mx * 100), t = huntTicksNow(h), sub;
    var hm = function (ms) { var m = Math.floor(ms / 60000); return Math.floor(m / 60) + ':' + ('0' + m % 60).slice(-2); };
    if (h.tutorial) sub = full ? '체험 보상 준비 완료' : '체험 보상까지 ' + Math.max(0, Math.ceil((mx - el) / 1000)) + '초';
    else if (full) sub = '8시간 가득 참 · 더 쌓이지 않아요';
    else { var tm = h.tick_minutes * 60000; sub = '경과 ' + hm(el) + ' / ' + hm(mx) + ' · 보상 ' + t + '회 · 다음 보상까지 ' + Math.max(1, Math.ceil((tm - el % tm) / 60000)) + '분'; }
    return '<button class="card huntnow' + (full ? ' full' : '') + '" data-a="openHunt"><div class="row"><span class="hn-l">진행 중인 사냥 · ' + '★'.repeat(c.star) + ' ' + esc(IX.region[c.regionId].name) + '</span>' +
      '<span class="hn-go">' + (full ? '받으러 가기' : '보러 가기') + ' ›</span></div><b class="hn-name">' + esc(c.name) + '</b>' +
      '<div class="bar"><i style="width:' + pct.toFixed(1) + '%"></i></div><span class="hn-sub">' + sub + '</span></button>';
  }
  // ---- 사냥 계산(표시용, 확정은 서버) ----
  function huntTicksNow(h) { return Engine.huntTicks(M, Date.parse(h.started_at), now(), h.tutorial); }
  function huntMaxMs(h) { return h.tutorial ? (h.trial_wait_seconds || M.tutorial.trialWaitSeconds) * 1000 : h.max_ticks * h.tick_minutes * 60000; }
  function huntFull(h) { return huntTicksNow(h) >= h.max_ticks; }
  function huntCounterHtml() {
    var h = S.hunt; if (!h) return '';
    var c = IX.course[h.course_id], t = huntTicksNow(h), el = Math.max(0, now() - Date.parse(h.started_at));
    var eff = Engine.huntEfficiency(M, Number(cpOf(h.job_id || mainJob())), c), tier = IX.tier[c.star];
    var gold = Math.round(t * tier.goldPerTick * eff), mats = Math.round(t * tier.dropsPerTick * eff);
    var status;
    if (h.tutorial) {
      var left = Math.max(0, Math.ceil(((h.trial_wait_seconds || 30) * 1000 - el) / 1000));
      status = left ? '체험 보상까지 <b>' + left + '초</b> · 첫 사냥은 30초 뒤 1성 ' + h.max_ticks + '회분을 받아요' : '체험 보상 도착! ' + h.max_ticks + '회분을 받을 수 있어요';
    } else if (t >= h.max_ticks) {
      status = '<b class="lbl-warn">8시간 도달 · 더 이상 쌓이지 않아요</b> · 보상을 받아 주세요';
    } else {
      var tickMs = h.tick_minutes * 60000, nx = (t + 1) * tickMs - el, mm = Math.floor(nx / 60000), ss = Math.floor(nx % 60000 / 1000);
      status = '다음 보상까지 <b>' + mm + ':' + (ss < 10 ? '0' : '') + ss + '</b> · ' + h.tick_minutes + '분마다 계산';
    }
    var pct = Math.min(100, el / huntMaxMs(h) * 100);
    return '<div class="row"><span style="color:var(--gold)">누적 보상(예상)</span><span class="small">' + t + '/' + h.max_ticks + '회</span></div>' +
      '<div class="row counters"><span>골드 <b>' + fmt(gold) + '</b></span><span>재료 <b>' + fmt(mats) + '</b>개</span></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div><p class="sub">' + status + '</p><p class="small">' + elapsedLabel(el, h) + ' · 받을 때 서버에서 확정</p>';
  }
  function claimButton() {
    var h = S.hunt; if (!h) return '';
    if (h.tutorial) {
      var left = Math.max(0, Math.ceil(((h.trial_wait_seconds || 30) * 1000 - (now() - Date.parse(h.started_at))) / 1000));
      return '<button class="btn" data-a="claim" data-tut="claim"' + (left ? ' disabled' : '') + '>' + (left ? '보상 받기 (' + left + '초)' : '보상 받기') + '</button>';
    }
    return '<button class="btn" data-a="claim" data-tut="claim">보상 받고 사냥 종료</button>';
  }
  function elapsedLabel(ms, h) {
    var m = Math.floor(ms / 60000), e = m >= 60 ? Math.floor(m / 60) + '시간 ' + (m % 60) + '분' : m + '분';
    return e + ' 경과 / 최대 ' + (h.tutorial ? '30초 체험' : M.huntConst.maxHours + '시간');
  }
  /** GM-03 하단 접이식 성장 목표 패널(C-10) */
  var huntPanelOpen = false;
  function growthPanel() {
    var it = goalItem(); if (!it) return '';
    var lines = recipeLines(it.id), rc = IX.recipe[it.id], short = lines.filter(function (l) { return l.have < l.need; });
    var goldShort = S.wallet.gold < rc.gold, spShort = short.filter(function (l) { return l.special; })[0], ok = !short.length && !goldShort;
    var summary = ok ? '재료 충족! 장비를 제작해 보세요' : short.length ? '다음 ' + partName(it.partId) + ' 제작까지 ' + matName(short[0].id) + ' ' + (short[0].need - short[0].have) + '개 부족' : '골드 ' + fmt(rc.gold - S.wallet.gold) + ' 부족';
    var body = '';
    if (huntPanelOpen) {
      var t = S.hunt ? huntTicksNow(S.hunt) : 0, c = S.hunt && IX.course[S.hunt.course_id];
      var pend = c ? Math.round(t * IX.tier[c.star].dropsPerTick * Engine.huntEfficiency(M, cpOf(S.hunt.job_id || mainJob()), c)) : 0;
      body = '<div class="row" style="justify-content:flex-start">' + itemIcon(it.id) + '<div><b>' + esc(it.name) + '</b><p class="sub">' + GRADE_NAME[it.grade] + ' · 전투력 +' + fmt(cpGain(it.id)) + (S.member.goal_item_id === it.id ? ' · 목표' : ' · 추천') + '</p></div></div>' +
        lines.map(function (l) {
          var tag = l.special ? '<span class="tag rift">던전 레이드</span>' : dropsHere(l.id) ? '<span class="tag here">현재 사냥터에서 획득 가능</span>' : '<span class="tag">다른 사냥터</span>';
          return '<div class="gline"><span>' + esc(matName(l.id)) + '</span><b class="' + (l.have >= l.need ? 'lbl-ok' : 'lbl-bad') + '">' + l.have + '/' + l.need + '</b>' +
            (l.have < l.need ? '<span class="small">' + (l.need - l.have) + '개 부족</span>' : '<span class="small">충족</span>') + tag + '</div>';
        }).join('') +
        '<div class="gline"><span>골드</span><b class="' + (goldShort ? 'lbl-bad' : 'lbl-ok') + '">' + fmt(S.wallet.gold) + '/' + fmt(rc.gold) + '</b></div>' +
        (pend ? '<p class="small">받기 전 재료 약 ' + pend + '개가 쌓여 있어요(+' + pend + ' 획득 예정, 종류는 받을 때 확정)</p>' : '') +
        (ok ? '<button class="btn" data-a="goCraftGoal" data-v="' + it.id + '">제작하러 가기</button><p class="small">사냥은 계속 진행돼요</p>'
          : spShort ? '<p class="small">' + esc(matName(spShort.id)) + ' ' + (spShort.need - spShort.have) + '개 부족 · 던전 레이드에서 획득</p><button class="btn ghost" data-a="tab" data-v="dungeon">던전</button>' : '');
    }
    return '<div class="card gpanel' + (ok ? ' ok' : '') + '"><button class="row gsum" data-a="togglePanel"><span class="small" style="color:var(--gold)">성장 목표</span><b style="flex:1;text-align:left">' + esc(summary) + '</b><span>' + (huntPanelOpen ? '▴' : '▾') + '</span></button>' + body + '</div>';
  }

  // ---------------- 팝업 ----------------
  var POPUPS = {
    confirm: function (p) {
      return '<div class="overlay center"><div class="sheet"><b style="font-size:18px">' + esc(p.title) + '</b><p class="sub">' + esc(p.text || '') + '</p>' +
        '<button class="btn" data-a="confirmYes">' + esc(p.yes || '확인') + '</button><button class="btn ghost" data-a="close">' + esc(p.no || '취소') + '</button></div></div>';
    },
    /* GM-04 사냥 결과: 카운트업 + 특수 재료·장비 희귀 연출 */
    huntResult: function (p) {
      var rw = p.res.reward, mats = Object.keys(rw.materials), rare = mats.filter(function (id) { return IX.material[id].isSpecial; });
      var basic = mats.filter(function (id) { return !IX.material[id].isSpecial; });
      return '<div class="overlay center"><div class="sheet"><b style="font-size:20px;color:#2E8B57">지급 완료</b><p class="sub">' + esc(IX.course[p.course].name) + ' · ' + rw.ticks + '회 보상' + (p.res.tutorial_trial ? ' · 체험 보상' : '') + '</p>' +
        '<p class="big">골드 <b data-count="' + rw.gold + '">0</b></p>' +
        (basic.length ? '<div class="grid">' + basic.map(function (id) { return '<div class="cell lite g' + IX.material[id].tier + '">' + matIcon(id) + '<span>' + esc(matName(id)) + ' ×<b data-count="' + rw.materials[id] + '">0</b></span></div>'; }).join('') + '</div>' : '<p class="sub">획득한 재료 없음</p>') +
        rare.map(function (id) { return rareRow(IX.material[id].tier, matIcon(id), '특수 재료 · ' + matName(id) + ' ×' + rw.materials[id]); }).join('') +
        p.res.items.map(function (x) { var it = IX.item[x.item_id]; return rareRow(it.grade, itemIcon(x.item_id), '완제품 장비 · ' + GRADE_NAME[it.grade] + ' ' + it.name); }).join('') +
        '<button class="btn" data-a="rehunt" data-v="' + p.course + '">같은 코스 다시 사냥</button><button class="btn ghost" data-a="tab" data-v="craft" data-tut="toCraft">제작하러 가기</button><button class="btn ghost" data-a="close">닫기</button></div></div>';
    },
    craftDetail: function (p) {
      var it = IX.item[p.id], rc = IX.recipe[p.id], short = Engine.craftShortage(M, p.id, S.wallet, S.materials);
      var lines = recipeLines(p.id), cpNow = cpOf(it.jobId), gain = cpGain(p.id), isGoal = S.member.goal_item_id === p.id;
      var row = function (l) {
        var src = l.special ? '<button class="chip src" data-a="tab" data-v="dungeon">던전 레이드</button>' : '<button class="chip src" data-a="matSource" data-v="' + l.id + '">사냥터</button>';
        return '<div class="mline' + (l.special ? ' sp' : '') + '"><span>' + (l.special ? '<i class="sptag">특수</i>' : '') + esc(matName(l.id)) + '</span><b style="color:' + (l.have >= l.need ? '#2E8B57' : '#D64545') + '">' + l.have + ' / ' + l.need + '</b>' +
          (l.have < l.need ? '<span class="short">' + (l.need - l.have) + ' 부족</span>' + src : '<span class="short ok">충분</span>') + '</div>';
      };
      return '<div class="overlay"><div class="sheet"><div class="row" style="justify-content:flex-start">' + itemIcon(p.id) + '<div style="flex:1"><b style="font-size:18px">' + esc(it.name) + '</b><p class="sub">' + GRADE_NAME[it.grade] + ' · ' + job(it.jobId).name + ' · ' + partName(it.partId) + '</p></div></div>' +
        (view.name === 'craft' && view.p.part ? '<p class="slotok">' + (view.p.part === it.partId && view.p.job === it.jobId ? '✓ 선택한 칸(' + esc(job(it.jobId).name) + ' · ' + partName(it.partId) + ')에 맞는 장비예요' : '') + '</p>' : '') +
        (function () { var lb = lookBadge(p.id); return lb ? '<div class="lookbadge">' + charPic(it.jobId, lookOf(it.jobId), 'idle', 'mini') + '<b>' + esc(lb) + '</b></div>' : ''; })() +
        '<div class="cpcmp"><span>전투력</span><b>' + fmt(cpNow) + '</b><span>→</span><b style="color:' + (gain > 0 ? '#2E8B57' : '#4A5650') + '">' + fmt(cpNow + Math.max(0, gain)) + '</b><span class="small">' + (gain > 0 ? '+' + fmt(gain) : '현재 장착이 더 높음') + '</span></div>' +
        '<b class="small">기본 재료</b>' + lines.filter(function (l) { return !l.special; }).map(row).join('') +
        (rc.specialMaterialId ? '<b class="small">특수 재료</b>' + lines.filter(function (l) { return l.special; }).map(row).join('') : '<p class="small">일반·고급 장비는 사냥 재료만으로 만들어요</p>') +
        '<div class="mline"><span>골드</span><b style="color:' + (S.wallet.gold >= rc.gold ? '#2E8B57' : '#D64545') + '">' + fmt(S.wallet.gold) + ' / ' + fmt(rc.gold) + '</b>' + (S.wallet.gold < rc.gold ? '<span class="short">' + fmt(rc.gold - S.wallet.gold) + ' 부족</span>' : '') + '</div>' +
        '<button class="btn" data-a="doCraft" data-v="' + p.id + '"' + (short.length ? ' disabled' : '') + ' data-tut="doCraft">' + (short.length ? '제작 (재료 부족)' : '제작') + '</button>' +
        '<button class="btn ghost" data-a="setGoal" data-v="' + p.id + '"' + (isGoal ? ' disabled' : '') + '>' + (isGoal ? '목표로 설정됨' : '목표로 설정') + '</button>' +
        '<button class="btn ghost" data-a="close">닫기</button></div></div>';
    },
    /* GM-05 레이드 안내 바텀시트(희귀 이상 첫 선택, 1회) */
    raidGuide: function (p) {
      return '<div class="overlay"><div class="sheet"><div class="coachhead">' + face('pino_surprise') + '<b style="font-size:17px">특수 재료가 필요해요</b></div>' +
        '<p>희귀 이상 장비에는 특수 재료가 필요해요. 스크린 라운드와 연동되는 던전 레이드에서 얻을 수 있어요.</p>' +
        '<div class="row" style="justify-content:space-around">' + ['MAT-RIFT-3', 'MAT-RIFT-4', 'MAT-RIFT-5'].map(function (id) { return '<div style="text-align:center">' + matIcon(id) + '<p class="small" style="color:#4A5650">' + esc(matName(id)) + '</p></div>'; }).join('') + '</div>' +
        '<p class="sub">일반·고급 장비는 사냥 재료만으로 만들 수 있어요.</p>' +
        '<button class="btn purple" data-a="raidGuideGo">던전 탭에서 자세히 보기</button><button class="btn ghost" data-a="raidGuideClose" data-v="' + esc(p.id) + '">닫기</button></div></div>';
    },
    crafted: function (p) {
      var it = IX.item[p.item.item_id];
      return '<div class="overlay center"><div class="sheet"><b style="font-size:20px;color:' + (p.great ? '#B5720F' : '#2E8B57') + '">' + (p.great ? '대성공!' : '제작 완료') + '</b>' +
        '<div class="row g' + it.grade + '" style="justify-content:flex-start">' + itemIcon(p.item.item_id) + '<div><b>' + esc(it.name) + '</b><p class="sub">전투력 +' + fmt(p.item.cp) + ' · 인벤토리에 추가됨</p></div></div>' +
        '<button class="btn" data-a="equip" data-v="' + p.item.inv_item_id + '" data-tut="equip">바로 장착</button><button class="btn ghost" data-a="close">닫기</button></div></div>';
    },
    itemDetail: function (p) {
      var x = S.items.filter(function (i) { return i.inv_item_id === p.id; })[0]; if (!x) return '';
      var it = IX.item[x.item_id], cur = equippedAt(it.jobId, it.partId), diff = x.cp - (cur ? cur.cp : 0);
      return '<div class="overlay"><div class="sheet"><div class="row" style="justify-content:flex-start">' + itemIcon(x.item_id) + '<div><b style="font-size:18px">' + esc(it.name) + '</b><p class="sub">' + GRADE_NAME[it.grade] + (x.is_great === 'Y' ? ' · 대성공' : '') + ' · ' + job(it.jobId).name + ' 전용 · 전투력 ' + fmt(x.cp) + '</p></div></div>' +
        (x.equipped_job_id ? '<p class="sub">' + job(it.jobId).name + '이(가) 장착 중</p><button class="btn ghost" data-a="unequip" data-v="' + x.inv_item_id + '">장착 해제</button>'
          : '<p class="sub">현재 장착 대비 ' + (diff >= 0 ? '+' : '') + fmt(diff) + '</p><button class="btn" data-a="equip" data-v="' + x.inv_item_id + '">장착</button><button class="btn ghost" data-a="sell" data-v="' + x.inv_item_id + '">판매 ' + fmt(Engine.sellPrice(M, x.item_id)) + 'G</button>') +
        '<button class="btn ghost" data-a="close">닫기</button></div></div>';
    },
    slotPick: function (p) {
      var list = S.items.filter(function (x) { var it = IX.item[x.item_id]; return it.jobId === p.job && it.partId === p.part && !x.equipped_job_id; });
      return '<div class="overlay"><div class="sheet"><b>' + job(p.job).name + ' · ' + partName(p.part) + '</b>' +
        (list.length ? list.map(function (x, i) { return '<button class="row card" style="background:#EEF2EA;color:#1B2620" data-a="equip" data-v="' + x.inv_item_id + '"' + (i === 0 ? ' data-tut="pickEquip"' : '') + '>' + itemIcon(x.item_id) + '<span style="flex:1;text-align:left">' + esc(IX.item[x.item_id].name) + ' · ' + fmt(x.cp) + '</span></button>'; }).join('')
          : '<p class="sub">' + esc(job(p.job).name) + '의 ' + partName(p.part) + ' 장비가 없어요</p>') +
        '<button class="btn' + (list.length ? ' ghost' : '') + '" data-a="craftFor" data-v="' + p.part + '" data-j="' + p.job + '">' + esc(job(p.job).name) + ' ' + partName(p.part) + ' 제작하러 가기</button>' +
        '<button class="btn ghost" data-a="close">닫기</button></div></div>';
    },
    /* GM-06 재료 합성 바텀시트(5:1, 수량 스테퍼, 골드) */
    compose: function (p) {
      var c = Engine.composeCost(M, p.id), have = Number(S.materials[c.fromId] || 0);
      var max = Math.max(0, Math.min(Math.floor(have / c.qty), Math.floor(S.wallet.gold / c.gold)));
      var n = Math.max(1, Math.min(p.n || 1, Math.max(1, max))), ok = max >= 1;
      return '<div class="overlay"><div class="sheet"><div class="row" style="justify-content:flex-start;gap:10px">' + img('icon_compose.png', 'cicon') + '<b style="font-size:18px">재료 합성</b></div>' +
        '<div class="row" style="justify-content:space-around">' + '<div style="text-align:center">' + matIcon(c.fromId) + '<p class="small" style="color:#4A5650">' + esc(matName(c.fromId)) + ' ×' + c.qty * n + '</p></div><b style="font-size:22px">→</b>' +
        '<div style="text-align:center">' + matIcon(p.id) + '<p class="small" style="color:#4A5650">' + esc(matName(p.id)) + ' ×' + n + '</p></div></div>' +
        '<p class="sub" style="text-align:center">' + c.qty + '개 → 1개 · 1회 ' + fmt(c.gold) + 'G · 보유 ' + fmt(have) + '개</p>' +
        '<div class="stepper"><button data-a="composeN" data-v="-1"' + (n <= 1 ? ' disabled' : '') + '>−</button><b>' + n + '</b><button data-a="composeN" data-v="1"' + (n >= max ? ' disabled' : '') + '>+</button><button class="chip" data-a="composeN" data-v="max"' + (max <= 1 ? ' disabled' : '') + '>최대 ' + max + '</button></div>' +
        '<div class="mline"><span>필요 골드</span><b style="color:' + (S.wallet.gold >= c.gold * n ? '#2E8B57' : '#D64545') + '">' + fmt(c.gold * n) + ' / 보유 ' + fmt(S.wallet.gold) + '</b></div>' +
        (ok ? '' : '<p class="err">' + (have < c.qty ? matName(c.fromId) + ' ' + (c.qty - have) + '개 부족' : '골드 부족') + '</p>') +
        '<button class="btn" data-a="doCompose" data-v="' + p.id + '"' + (ok ? '' : ' disabled') + '>합성</button><button class="btn ghost" data-a="close">닫기</button></div></div>';
    },
    chestOpened: function (p) {
      var c = p.res.contents;
      return '<div class="overlay center"><div class="sheet"><b style="font-size:20px">' + GRADE_NAME[c.grade] + ' 상자 개봉</b><p>골드 <b data-count="' + c.gold + '">0</b></p><p>' + Object.keys(c.materials).map(function (id) { return esc(matName(id)) + ' ' + c.materials[id]; }).join(' · ') + '</p>' +
        Object.keys(c.special || {}).map(function (id) { return rareRow(IX.material[id].tier, matIcon(id), '특수 재료 · ' + matName(id) + ' ×' + c.special[id]); }).join('') +
        p.res.items.map(function (x) { var it = IX.item[x.item_id]; return rareRow(it.grade, itemIcon(x.item_id), '완제품 장비 · ' + it.name); }).join('') +
        '<button class="btn" data-a="close">확인</button></div></div>';
    },
    /* CM-02 확률표: 상자 + 특수 재료 + 사냥 파편 */
    probs: function () {
      var rows = M.rewardGrades.map(function (g) {
        return '<tr><td>' + GRADE_NAME[g.grade] + '</td><td>' + g.tierProb.map(function (x) { return Math.round(x * 100); }).join('/') + '</td><td>' + Math.round(g.equipDropProb * 100) + '%</td><td>' +
          ((g.special || []).map(function (s) { return matName(s.materialId).replace('균열 ', '') + ' ' + s.min + '~' + s.max; }).join(', ') || '없음') + '</td></tr>';
      }).join('');
      var hunt = M.huntTiers.filter(function (t) { return t.specialDropProb > 0; }).map(function (t) { return t.star + '성 ' + (t.specialDropProb * 100).toFixed(3).replace(/0+$/, '') + '%'; }).join(' · ');
      return '<div class="overlay" data-a="overlayClose"><div class="sheet">' + sheetHead('<b>확률 안내</b>') + '<p class="sub">상자 등급별 재료 단계(1~5단계, %)·장비·특수 재료</p><div class="sc"><table style="font-size:12px"><tr><th>상자</th><th>재료 단계</th><th>장비</th><th>특수 재료</th></tr>' + rows + '</table></div>' +
        '<p class="sub">사냥 균열 파편: ' + hunt + ' (5분마다, 사냥 효율 적용)</p>' +
        '<p class="sub">특수 재료는 상자 기본 내용에 더해지고 난이도·인원 보너스는 적용되지 않아요</p>' +
        '<p class="sub">제작 대성공: 일반·고급 10%, 희귀 8%, 영웅 6%, 전설 5% · SP 배율 1.2~2.0배</p></div></div>';
    },
    /* GM-07 전투력 도움말 */
    /* v0.6.3 스킬 안내(전투력 → 스킬 해금 → 데미지 계수) */
    skillInfo: function (p) {
      var sk = M.skills.filter(function (x) { return x.id === p.id; })[0], j = sk.jobId, cp = cpOf(j), cur = Engine.topSkill(M, j, cp);
      var all = M.skills.filter(function (x) { return x.jobId === j; }).sort(function (a, b) { return a.stage - b.stage; });
      var open = cp >= sk.unlockCp, AT = { PHYS: '물리', MAGIC: '마법', MIXED: '물리+마법' };
      var base = function (s) { return Math.round(cp * s.coef * job(j).dmgCoef); };
      return '<div class="overlay" data-a="overlayClose"><div class="sheet skillsheet">' + sheetHead('<b style="font-size:18px">' + esc(job(j).name) + ' 스킬</b>') +
        '<div class="skillhero ' + (open ? 'open' : 'lock') + '"><span class="stg">' + sk.stage + '단계</span><b>' + esc(sk.name) + '</b><p>' + esc(sk.fx) + '</p>' +
        '<div class="skillstat"><div><i>공격 타입</i><b>' + (AT[sk.attackType] || sk.attackType) + '</b></div><div><i>스킬 데미지 계수</i><b>×' + sk.coef + '</b></div><div><i>' + (open ? '상태' : '해금 전투력') + '</i><b>' + (open ? (sk.id === cur.id ? '사용 중' : '해금') : fmt(sk.unlockCp)) + '</b></div></div>' +
        (open ? '' : '<p class="need">전투력 ' + fmt(sk.unlockCp - cp) + ' 더 올리면 해금 · 레이드 기준 데미지 ' + fmt(base(cur)) + ' → <b>' + fmt(base(sk)) + '</b></p>') + '</div>' +
        '<div class="skilluse"><b>어디에 쓰이나요?</b><p>던전 레이드에서 내 캐릭터의 <b>기준 데미지 = 전투력 × 스킬 데미지 계수</b>예요. 샷 공격과 홀 종료 피니시 피해가 모두 이 기준 데미지에서 계산돼요. 전투력이 올라 높은 단계 스킬이 열리면 같은 샷도 더 큰 피해를 줘요.</p></div>' +
        '<div class="skilllist">' + all.map(function (x) { var o = cp >= x.unlockCp; return '<button class="' + (x.id === sk.id ? 'sel ' : '') + (o ? 'open' : 'lock') + '" data-a="skillInfo" data-v="' + x.id + '"><span>' + x.stage + '</span><b>' + esc(x.name) + '</b><i>×' + x.coef + '</i><em>' + (x.id === cur.id ? '사용 중' : o ? '해금' : fmt(x.unlockCp)) + '</em></button>'; }).join('') + '</div>' +
        '</div></div>';
    },
    cpHelp: function () {
      return '<div class="overlay"><div class="sheet"><b style="font-size:18px">전투력이란?</b><p>전투력이 높을수록 더 좋은 사냥터에서 더 많이 모으고, 레이드에서 보스에게 더 큰 피해를 줍니다.</p>' +
        '<p class="sub">· 직업 전투력 = 기본 100 + 장착 장비 전투력 합<br>· 사냥터 입장: 권장 전투력의 50% 이상<br>· 사냥 효율 = (전투력 ÷ 권장)², 최대 100%<br>· 스킬 단계 해금: 400 · 980 · 2,500 · 4,500에서 계수 ×1.4 · ×1.9 · ×2.6 · ×3.5<br>· 레이드 기준 데미지 = 전투력 × 스킬 계수</p>' +
        '<p class="sub">별 사냥터 입장 전투력: ' + M.huntTiers.map(function (t) { return t.star + '성 ' + fmt(t.entryCp); }).join(' · ') + '</p>' +
        '<button class="btn ghost" data-a="close">닫기</button></div></div>';
    },
    /* GM-09 일일 미션 */
    missions: function (p) {
      var d = p.data, GO = { HUNT_START: 'map', HUNT_CLAIM: 'hunt', CRAFT: 'craft', COMPOSE: 'mat', HUNT_MINUTES: 'hunt', RAID_FINISH: 'dungeon' };
      var rw = function (r) { return [r.gold ? fmt(r.gold) + 'G' : '', Object.keys(r.materials || {}).map(function (k) { return matName(k) + ' ' + r.materials[k]; }).join(' ')].filter(Boolean).join(' + '); };
      var body = !d ? '<p class="sub">불러오는 중…</p>' : d.missions.slice().sort(function (a, b) { return a.order - b.order; }).map(function (m) {
        var prog = Math.min(m.progress, m.target), all = m.event_type === 'ALL_CLEAR';
        var btn = m.claimed ? '<span class="small">수령 완료</span>' : m.done ? '<button class="chip on" data-a="missionClaim" data-v="' + m.mission_id + '">받기</button>'
          : GO[m.event_type] ? '<button class="chip" data-a="missionGo" data-v="' + GO[m.event_type] + '">바로가기</button>' : '';
        return '<div class="mission' + (all ? ' all' : '') + (m.claimed ? ' got' : '') + '"><div style="flex:1"><b>' + esc(m.name) + '</b><p class="small">' + (m.event_type === 'HUNT_MINUTES' ? '누적 사냥 ' + prog + '/' + m.target + '분' : prog + '/' + m.target) + ' · 보상 ' + esc(rw(m.reward)) + '</p>' +
          '<div class="bar" style="height:6px"><i style="width:' + (prog / m.target * 100) + '%"></i></div></div>' + btn + '</div>';
      }).join('');
      return '<div class="overlay" data-a="overlayClose"><div class="sheet">' + sheetHead('<div class="row" style="gap:8px">' + img('icon_mission.png', 'cicon') + '<b style="font-size:18px">일일 미션</b></div><span class="small">매일 00:00 초기화</span>') + body +
        '<p class="small">레이드 참여는 선택 · 6개 중 5개를 완료하면 올클리어</p></div></div>';
    },
    /* v0.6 외형 진화·세트 달성(B-33·B-41) */
    evolve: function (p) {
      var up = p.to.stage > p.from.stage, title = up ? josa(job(p.job).name, '이', '가') + ' ' + LOOK_NAME[p.to.stage] + ' 외형으로 진화했어요!' : LOOK_NAME[p.to.stage] + ' ' + setLabel(p.to) + ' 달성!';
      return '<div class="overlay center"><div class="sheet evolve" style="align-items:center;text-align:center">' +
        '<div class="evostage">' + charPic(p.job, p.from, 'idle', 'from') + '<i class="evoflash"></i>' + charPic(p.job, p.to, 'idle', 'to') + '</div>' +
        '<b style="font-size:19px;color:' + ['#4A5650', '#3A4A42', '#2E8B57', '#2F6FD0', '#7A4BD8', '#B5720F'][p.to.stage] + '">' + esc(title) + '</b>' +
        '<p class="sub">랭킹·레이드에서 다른 골퍼에게 이 모습이 보여요</p>' +
        '<button class="btn gold" data-a="rank">랭킹 보기</button><button class="btn ghost" data-a="close">확인</button></div></div>';
    },
    /* 튜토리얼 완료 */
    tutDone: function (p) {
      return '<div class="overlay center"><div class="sheet" style="align-items:center;text-align:center">' + face('pino_cheer') + '<b style="font-size:20px">튜토리얼 완료!</b>' +
        (p.gold ? '<p>완료 보상 <b>' + fmt(p.gold) + 'G</b>를 받았어요</p>' : '') +
        '<p class="sub">사냥 → 제작 → 장착으로 전투력을 키워요. 특수 재료는 던전 탭의 레이드에서 얻어요.</p><button class="btn" data-a="close">확인</button></div></div>';
    },
    expired: function (p) {
      return '<div class="overlay center"><div class="sheet"><b>세션 종료</b><p class="sub">' + esc(p.msg) + '</p><button class="btn" data-a="logout">다시 로그인</button></div></div>';
    }
  };
  /** 희귀 획득 연출: 등급색 빛기둥(fx_rare_drop 마스크) */
  function rareRow(grade, icon, text) {
    return '<div class="rare g' + grade + '"><i class="pillar"></i>' + icon + '<b class="gname">' + esc(text) + '</b></div>';
  }

  // ---------------- 튜토리얼(GM-08, C-2)·코치마크 ----------------
  // S.tutorial.step = 완료한 단계 수. 화면은 step+1단계를 보여 준다. TUT.replay = 설정의 '다시 보기'(안내만, 보상·저장 없음)
  var TUT = { replay: false, rstep: 1 }, CPFX = null;
  function tutActive() { return !!(S && S.member && S.member.intro_seen === 'Y' && (TUT.replay || (S.tutorial && !S.tutorial.done))); }
  function tutCur() { return TUT.replay ? TUT.rstep : S.tutorial.step + 1; }
  function tutHome(st) {
    return { 1: 'char', 2: 'map', 3: S.hunt ? 'hunt' : 'map', 4: 'craft', 5: 'char', 6: 'map' }[st] || 'map';
  }
  var TAB = function (v, t1, t2, f) { return { sel: '[data-a=tab][data-v=' + v + ']', text: [t1, t2 || ''], face: f }; };
  /** 지금 화면에서 하이라이트할 대상과 말풍선 */
  function tutSpec() {
    var st = tutCur(), v = view.name, pp = popup && popup.type;
    var nx = nextStar(cpOf(mainJob()));
    if (TUT.replay) {
      var R = {
        1: { sel: '[data-tut=cp]', text: ['전투력이 성장의 기준이에요', '사냥터 입장·사냥 효율·레이드 피해가 정해져요'] },
        2: { sel: '[data-tut=rec]', text: ['코스가 곧 사냥터예요', '앱을 꺼도 최대 8시간 쌓여요'] },
        3: { sel: S.hunt && v === 'hunt' ? '[data-tut=claim]' : '[data-tut=rec]', text: ['사냥 보상은 5분마다 쌓여요', '[보상 받기]로 재료와 골드를 받아요'] },
        4: { sel: '[data-tut=craftWeapon]', text: ['모은 재료로 장비를 만들어요', '제작 전후 전투력을 미리 볼 수 있어요'] },
        5: { sel: '[data-tut=cp]', text: ['장비를 장착하면 전투력이 올라요', '빈 칸을 눌러 장착할 수 있어요'] },
        6: { sel: '[data-tut=goal]', text: ['\'다음 목표\'에서 할 일을 확인해요', nx ? '전투력 ' + fmt(nx.entry) + '이면 ' + nx.star + '성 사냥터가 열려요' : '추천 제작으로 더 강해져요'], face: 'pino_cheer' }
      }[st];
      return pp ? null : Object.assign({ replay: true }, R);
    }
    if (pp && ['huntResult', 'craftDetail', 'crafted', 'slotPick'].indexOf(pp) < 0) return null; // 확인창 등은 막지 않음
    switch (st) {
      case 1: return v === 'char' ? { sel: '[data-tut=cp]', text: ['전투력이 성장의 기준이에요', '대표 캐릭터의 전투력을 확인해요'], ok: '확인' } : TAB('char', '캐릭터 탭에서 전투력을 확인해요');
      case 2: case 3:
        if (st === 3 && v === 'hunt' && S.hunt) {
          var ready = !S.hunt.tutorial || huntTicksNow(S.hunt) > 0;
          return ready ? { sel: '[data-tut=claim]', text: ['체험 보상이 쌓였어요!', '[보상 받기]로 재료와 골드를 받아요'], face: 'pino_surprise' }
            : { sel: '[data-tut=claim]', text: ['첫 사냥은 30초 체험이에요', '30초 뒤 [보상 받기]를 눌러요'] };
        }
        if (st === 3 && S.hunt) return { sel: '[data-a=openHunt]', text: ['진행 중인 사냥으로 가요'] };
        if (v === 'courses') return { sel: '[data-tut=course]', text: ['맨 위 추천 1성 코스를 눌러요', '앱을 꺼도 최대 8시간 쌓여요'] };
        if (v === 'map') return { sel: '[data-tut=rec]', text: ['코스가 곧 사냥터예요', '추천 코스로 첫 사냥을 시작해요'] };
        return TAB('map', '사냥터 탭에서 사냥을 시작해요');
      case 4:
        if (pp === 'huntResult') return { sel: '[data-tut=toCraft]', text: ['재료와 골드를 받았어요', '[제작하러 가기]로 장비를 만들어요'], face: 'pino_cheer' };
        if (pp === 'craftDetail') return { sel: '[data-tut=doCraft]', text: ['제작 전후 전투력을 미리 볼 수 있어요', '[제작]을 눌러요'] };
        if (v === 'craft') return { sel: '[data-tut=craftWeapon]', text: ['일반 무기를 만들어 볼까요?', '받은 철 재료로 만들 수 있어요'] };
        return TAB('craft', '제작 탭에서 장비를 만들어요');
      case 5:
        if (pp === 'crafted') return { sel: '[data-tut=equip]', text: ['장착하면 전투력이 올라요', '[바로 장착]을 눌러요'], face: 'pino_surprise' };
        if (pp === 'slotPick') return { sel: '[data-tut=pickEquip]', text: ['만든 무기를 골라 장착해요'] };
        if (v === 'char') return { sel: '[data-tut=slot-WEAPON]', text: ['무기 칸을 눌러 장착해요'] };
        return TAB('char', '캐릭터 탭에서 장비를 장착해요');
      case 6:
        if (v === 'map') return { sel: '[data-tut=goal]', text: [nx ? '전투력 ' + fmt(nx.entry) + '이면 ' + nx.star + '성 사냥터가 열려요' : '다음 목표를 확인해요', '\'다음 목표\' 카드를 눌러요'], face: 'pino_cheer' };
        return TAB('map', '사냥터 탭에서 다음 목표를 확인해요');
    }
    return null;
  }
  /** 레이드 코치마크(DG-04 첫 레이드 1회) */
  var RAID_COACH = [
    { sel: '[data-tut=shotcard]', text: ['GS 샷데이터가 들어오면 바로 공격해요', '샷 판정에 따라 피해와 SP가 쌓여요'] },
    { sel: '[data-tut=spbtn]', text: ['SP가 100이 되면 [특수공격]!', '이번 홀 피니시 피해가 1.2~2배가 돼요'] }
  ];
  function coachSpec() {
    // GZ-02 첫 진입 안내: ID/PW 로그인 후 골프존앱 메인에서 [게임] 탭으로 모험 시작(인트로를 아직 안 본 회원, v0.5 보완)
    if (view.name === 'launcher') return S && S.member.intro_seen !== 'Y' && !TUT.gameHintOff && !popup
      ? { sel: '.gzm-game', text: ['[게임] 탭을 눌러 보세요!', '균열의 페어웨이의 세계로 모험을 떠나 볼까요?'], face: 'pino_cheer', launch: true } : null;
    if (view.name === 'dgRaid') return D.coach !== null && D.coach !== undefined && !popup ? Object.assign({ raid: true }, RAID_COACH[D.coach]) : null;
    if (['map', 'courses', 'hunt', 'craft', 'items', 'char'].indexOf(view.name) < 0 || !tutActive()) return null;
    return tutSpec();
  }
  /** 대상만 밝게: 대상 둘레 4면 가림막(터치 차단) + 테두리 + 말풍선(대상을 가리지 않는 쪽) */
  function layoutCoach() {
    var layer = document.getElementById('coachLayer'); if (!layer) return;
    var sp = coachSpec(); if (!sp) { layer.innerHTML = ''; return; }
    var base = root.getBoundingClientRect(), W = base.width, H = base.height;
    var t = sp.sel ? root.querySelector(sp.sel) : null, r = null;
    if (t) {
      var key = sp.sel + (popup ? popup.type : '') + view.name;
      if (layer.getAttribute('data-k') !== key && !TUT.scrolled[key]) { TUT.scrolled[key] = 1; t.scrollIntoView({ block: 'center' }); }
      var b = t.getBoundingClientRect(); r = { x: b.left - base.left - 4, y: b.top - base.top - 4, w: b.width + 8, h: b.height + 8 };
    }
    var blk = function (x, y, w, h) { return '<div class="cblock" style="left:' + x + 'px;top:' + y + 'px;width:' + Math.max(0, w) + 'px;height:' + Math.max(0, h) + 'px"></div>'; };
    var html = r ? blk(0, 0, W, r.y) + blk(0, r.y + r.h, W, H - r.y - r.h) + blk(0, r.y, r.x, r.h) + blk(r.x + r.w, r.y, W - r.x - r.w, r.h) +
      '<div class="chole" style="left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px"></div>' : blk(0, 0, W, H);
    var below = !r || (H - (r.y + r.h)) > r.y;
    var pos = !r ? 'top:' + (H / 2 - 60) + 'px' : below ? 'top:' + (r.y + r.h + 10) + 'px' : 'bottom:' + (H - r.y + 10) + 'px';
    var btns = sp.launch ? '<button class="small" data-a="gameHintOff">나중에</button><button class="chip on" data-a="enterGame">게임 탭으로</button>'
      : sp.raid ? '<button class="small" data-a="coachClose">닫기</button><button class="chip on" data-a="coachNext">' + (D.coach < RAID_COACH.length - 1 ? '다음' : '확인') + '</button>'
      : sp.replay ? '<button class="small" data-a="tutReplayEnd">닫기</button><span class="small">' + tutCur() + '/6</span><button class="chip on" data-a="tutReplayNext">' + (tutCur() < 6 ? '다음' : '완료') + '</button>'
        : '<button class="small" data-a="tutSkip">건너뛰기</button><span class="small">' + tutCur() + '/6</span>' + (sp.ok ? '<button class="chip on" data-a="tutOk">' + sp.ok + '</button>' : '');
    html += '<div class="cbubble" style="' + pos + '"><div class="coachhead">' + face(sp.face || 'pino') + '<p>' + esc(sp.text[0]) + (sp.text[1] ? '<br>' + esc(sp.text[1]) : '') + '</p></div><div class="row">' + btns + '</div></div>';
    layer.innerHTML = html; layer.setAttribute('data-k', (sp.sel || '') + (popup ? popup.type : '') + view.name);
  }
  TUT.scrolled = {};
  /** 단계 n 완료(서버 저장은 뒤에서, 화면 진행을 막지 않음) */
  function tutDone(n) {
    if (TUT.replay || !S.tutorial || S.tutorial.done || n <= S.tutorial.step) return;
    S.tutorial.step = n; S.tutorial.done = n >= S.tutorial.steps; S.member.tutorial_step = S.tutorial.done ? 'DONE' : String(n);
    act('tutorialStep', { step: n }).then(function (res) {
      if (!res.ok) return;
      // 진행 저장은 동시에 보내므로 응답 순서가 바뀔 수 있음 → 화면보다 앞선 단계일 때만 서버 값을 씀
      if (res.data.tutorial && (res.data.tutorial.done || Number(res.data.tutorial.step) >= Number(S.tutorial.step))) S.tutorial = res.data.tutorial;
      if (res.data.reward_gold) { S.wallet.gold += res.data.reward_gold; render(); }
    });
    if (S.tutorial.done) popup = { type: 'tutDone', gold: S.tutorial.done_reward_at ? 0 : M.tutorial.doneGold };
  }

  // ---------------- 사냥 연출(GM-03, B-06): 대기 ↔ 공격 루프, 피격, 피해 숫자(최대 3개) ----------------
  var huntBeat = 0;
  function huntAttack() {
    var st = root.querySelector('[data-hunt-stage]'); if (!st || !S.hunt) return;
    huntBeat++;
    var crit = Math.random() < 0.15, cp = cpOf(S.hunt.job_id || mainJob());
    st.classList.add('atk');
    setTimeout(function () { st.classList.remove('atk'); }, 520);
    var fx = st.querySelector('.fxlayer');
    spawn(fx, '<i class="sprite ' + (crit ? 'crit' : 'hit') + '"></i>', 420);
    var dmg = Math.round(cp * (0.8 + Math.random() * 0.4) * (crit ? 1.6 : 1));
    spawnFloat(fx, (crit ? '크리티컬 ' : '') + fmt(dmg), crit ? 'crit' : '');
  }
  function spawn(parent, html, ms) {
    if (!parent) return null;
    var d = document.createElement('div'); d.innerHTML = html; var el = d.firstChild; parent.appendChild(el);
    setTimeout(function () { el.remove(); }, ms); return el;
  }
  /** 피해 숫자: 같은 영역에 동시에 최대 3개 */
  function spawnFloat(parent, text, cls) {
    if (!parent) return;
    var fl = parent.querySelectorAll('.dmg'); if (fl.length >= 3) fl[0].remove();
    var el = spawn(parent, '<b class="dmg ' + (cls || '') + '"></b>', 1100); if (!el) return;
    el.textContent = text; el.style.left = (45 + Math.random() * 30) + '%';
  }

  // ---------------- 동작 ----------------
  var hiddenTaps = [];
  var A = {
    home: function () { go('launcher'); },
    raidBanner: function () {
      if (D.round && D.er && D.sim) { if (D.sim.finished) go('dgResult'); else A.dgResumeRing(); return; }
      var id = (S.active_round || {}).round_id || (D.round && D.round.round_id); if (!id) return;
      dgResume(id).then(function (ok) { if (ok) dgOpenRound(); else { S.active_round = null; toast('진행 중인 레이드가 없어요'); render(); } });
    },
    gameHintOff: function () { TUT.gameHintOff = true; render(); },
    gzMy: function () { popup = { type: 'confirm', title: S.member.nickname + '님', text: '시연용 테스트 계정으로 로그인 중이에요. 로그아웃할까요?', yes: '로그아웃', no: '닫기', run: function () { A.logout(); } }; render(); },
    launcherScreen: function () { if (S.member.intro_seen !== 'Y') { go('intro'); return; } A.dgLoginOpen(); },
    tab: function (d) { go(d.v); },
    logout: function () { Api.logout(); S = null; LAST = {}; D.round = null; D.er = null; TUT.replay = false; go('login'); },
    enterGame: function () {
      if (S.member.intro_seen !== 'Y') { go('intro'); return; }
      if (tutActive() && !TUT.replay) { go(tutHome(tutCur())); return; }
      go(S.hunt ? 'hunt' : 'map');
    },
    introSkip: function () { popup = { type: 'confirm', title: '인트로를 건너뛸까요?', text: '캐릭터 › 설정에서 언제든 다시 볼 수 있어요.', yes: '건너뛰기', no: '계속 보기', run: function () { A.introDone(); } }; render(); },
    introDone: function () {
      var first = S.member.intro_seen !== 'Y';
      S.member.intro_seen = 'Y';
      if (first) act('progress', { intro_seen: true });
      go(tutActive() ? tutHome(tutCur()) : 'map');
    },
    region: function (d) { go('courses', { region: d.v }); },
    matSource: function (d) { go('courses', { mat: d.v }); },
    openHunt: function () { go('hunt'); },
    pickCourse: function (d) {
      var c = IX.course[d.v];
      if (!Engine.canEnterCourse(M, cpOf(mainJob()), c)) { toast('전투력이 부족해요 · 장비를 제작해 보세요'); return; }
      if (S.hunt) { popup = { type: 'confirm', title: '사냥터 이동', text: '현재 사냥을 종료하고 보상을 받은 뒤 ' + c.name + '에서 새로 시작합니다.', yes: '보상 받고 이동', run: function () { claim(false, c.id); } }; render(); return; }
      startHunt(c.id);
    },
    claim: function () { claim(false); },
    rehunt: function (d) { popup = null; startHunt(d.v); },
    confirmYes: function () { var f = popup && popup.run; popup = null; render(); if (f) f(); },
    close: function () { popup = null; render(); },
    togglePanel: function () { huntPanelOpen = !huntPanelOpen; render(); },
    goCraftGoal: function (d) { go('craft', { job: IX.item[d.v].jobId }); popup = { type: 'craftDetail', id: d.v }; render(); },
    goalCard: function () {
      if (tutActive() && !TUT.replay && tutCur() === 6) { tutDone(6); render(); return; }
      var rec = recommendItem(); if (!rec) { go('craft'); return; }
      go('craft', { job: rec.jobId }); popup = { type: 'craftDetail', id: rec.id }; render();
    },
    missions: function () {
      popup = { type: 'missions', data: LAST.missions || null }; render(); // 지난 값을 먼저 보여 주고 새 값으로 바꿈
      var t0 = Date.now();
      Api.call('missions', {}, { read: true }).then(function (res) {
        if (!popup || popup.type !== 'missions' || (res.ok && claimAt >= t0)) return;
        if (!res.ok) { if (!popup.data) popup = null; toast(res.error.message); render(); return; }
        LAST.missions = popup.data = res.data; render();
      });
    },
    missionClaim: function (d, el) {
      el.disabled = true; claimAt = Date.now();
      var ms = popup && popup.type === 'missions' && popup.data && (popup.data.missions || []).filter(function (x) { return x.mission_id === d.v; })[0];
      if (ms && ms.done && !ms.claimed) { // 보상은 기준 데이터로 정해져 있으므로 바로 반영
        var r0 = ms.reward || {}; ms.claimed = true; ms.claimed_at = new Date(now()).toISOString();
        S.wallet.gold += r0.gold || 0; addMats(r0.materials || {}); render();
        toast('미션 보상 ' + [r0.gold ? fmt(r0.gold) + 'G' : '', Object.keys(r0.materials || {}).map(function (k) { return matName(k) + ' ' + r0.materials[k]; }).join(' ')].filter(Boolean).join(' + '));
        commit('missionClaim', { mission_id: d.v }, function (data) { if (popup && popup.type === 'missions') { popup.data = data.missions; render(); } });
        return;
      }
      act('missionClaim', { mission_id: d.v }).then(function (res) {
        if (!res.ok) { toast(res.error.message); render(); return; }
        S.wallet = res.data.wallet; if (res.data.materials) S.materials = res.data.materials;
        if (popup && popup.type === 'missions') popup.data = res.data.missions;
        render();
        var r = res.data.reward; toast('미션 보상 ' + [r.gold ? fmt(r.gold) + 'G' : '', Object.keys(r.materials || {}).map(function (k) { return matName(k) + ' ' + r.materials[k]; }).join(' ')].filter(Boolean).join(' + '));
      });
    },
    missionGo: function (d) {
      popup = null;
      if (d.v === 'mat') go('items', { tab: 'mat' }); else if (d.v === 'hunt') go(S.hunt ? 'hunt' : 'map'); else go(d.v);
    },
    rank: function () {
      go('rank', { data: LAST.rank || null });
      Api.call('ranking', {}, { read: true }).then(function (res) {
        if (view.name !== 'rank') return;
        if (!res.ok) { toast(res.error.message); return; }
        LAST.rank = view.p.data = res.data; render();
      });
    },
    cpHelp: function () { popup = { type: 'cpHelp' }; render(); },
    skillInfo: function (d) { popup = { type: 'skillInfo', id: d.v }; render(); },
    craftJob: function (d) { go('craft', { job: d.v, filter: view.p.filter, part: view.p.part }); },
    craftFilter: function (d) { go('craft', { job: view.p.job, filter: d.v, part: view.p.part }); },
    craftPart: function (d) { go('craft', { job: view.p.job, filter: view.p.filter, part: d.v || '' }); },
    /** 캐릭터 빈 칸 → 그 직업·부위로 걸러진 제작 화면 */
    craftFor: function (d) { popup = null; go('craft', { job: d.j, part: d.v, filter: 'all' }); },
    craftDetail: function (d) {
      var it = IX.item[d.v];
      if (it.grade >= 3 && !S.tutorial.raid_guide_seen && !tutActive()) {
        S.tutorial.raid_guide_seen = new Date(now()).toISOString();
        act('raidGuideSeen', { kind: 'guide' });
        popup = { type: 'raidGuide', id: d.v }; render(); return;
      }
      popup = { type: 'craftDetail', id: d.v }; render();
    },
    raidGuideGo: function () { go('dungeon'); },
    raidGuideClose: function (d) { popup = { type: 'craftDetail', id: d.v }; render(); },
    setGoal: function (d) {
      S.member.goal_item_id = d.v; render(); toast('목표로 설정했어요 · 사냥 화면에서 진행을 볼 수 있어요');
      act('setGoal', { item_id: d.v }).then(function (res) { if (!res.ok) toast(res.error.message); });
    },
    doCraft: function (d) {
      if (Engine.craftShortage(M, d.v, S.wallet, S.materials).length) { toast('재료 또는 골드가 부족해요'); return; }
      var seed = Api.uuid(), invId = Api.uuid(), r = Engine.craftResult(M, d.v, seed), cost = Engine.craftCost(M, d.v);
      Object.keys(cost).forEach(function (k) { S.materials[k] -= cost[k]; }); S.wallet.gold -= IX.recipe[d.v].gold;
      var item = { inv_item_id: invId, item_id: d.v, is_great: r.great ? 'Y' : 'N', cp: r.cp, equipped_job_id: '' };
      S.items.push(item);
      if (S.member.goal_item_id === d.v) { S.member.goal_item_id = null; act('setGoal', { item_id: null }); } // 목표 장비를 만들면 다음 추천으로
      popup = { type: 'crafted', item: item, great: r.great }; tutDone(4); render();
      commit('craft', { item_id: d.v, seed: seed, inv_item_id: invId }, function (data) {
        if (data.item && (data.item.inv_item_id !== invId || Number(data.item.cp) !== r.cp)) { // 서버 값이 기준
          item.inv_item_id = data.item.inv_item_id; item.cp = Number(data.item.cp); item.is_great = data.item.is_great; render();
        }
      });
    },
    equip: function (d) {
      // 화면에 먼저 반영하고 서버 확정은 뒤에서(실패 시 다시 불러옴)
      var x = S.items.filter(function (i) { return i.inv_item_id === d.v; })[0], it = IX.item[x.item_id], before = cpOf(it.jobId), lb = lookOf(it.jobId);
      S.items.forEach(function (i) { var t = IX.item[i.item_id]; if (i.equipped_job_id === it.jobId && t.partId === it.partId) i.equipped_job_id = ''; });
      x.equipped_job_id = it.jobId;
      var cp = cpOf(it.jobId), c = charOf(it.jobId); if (c) c.cp = cp;
      CPFX = { job: it.jobId, from: before, to: cp, at: Date.now() };
      popup = null; toast(job(it.jobId).name + ' 전투력 ' + fmt(before) + ' → ' + fmt(cp) + '!');
      tutDone(5); var tp = popup; popup = null; lookCheck(it.jobId, lb); var evo = popup; go('char', { job: it.jobId }); if (tp || evo) { popup = tp || evo; render(); } // go()가 팝업을 지우므로 화면 전환 뒤 다시 띄움(튜토리얼 안내가 먼저)
      act('equip', { inv_item_id: d.v }).then(function (res) {
        if (!res.ok) { toast(res.error.message); reload().then(render); return; }
        if (pendingWrites === 0) { S.characters = res.data.characters; S.member.account_cp = res.data.account_cp; }
        if (view.name === 'char') render();
      });
    },
    unequip: function (d) {
      S.items.forEach(function (i) { if (i.inv_item_id === d.v) i.equipped_job_id = ''; }); popup = null; render();
      commit('unequip', { inv_item_id: d.v }, function (data) { if (pendingWrites === 0) { S.characters = data.characters; S.member.account_cp = data.account_cp; } });
    },
    sell: function (d) {
      var x = S.items.filter(function (i) { return i.inv_item_id === d.v; })[0];
      popup = { type: 'confirm', title: '판매할까요?', text: IX.item[x.item_id].name + ' · ' + fmt(Engine.sellPrice(M, x.item_id)) + 'G (판매 후 되돌릴 수 없어요)', yes: '판매', run: function () {
        var price = Engine.sellPrice(M, x.item_id);
        S.items = S.items.filter(function (i) { return i.inv_item_id !== d.v; }); S.wallet.gold += price; toast(fmt(price) + 'G 획득'); render();
        commit('sellItem', { inv_item_id: d.v });
      } }; render();
    },
    itemTab: function (d) { go('items', { tab: d.v }); },
    itemDetail: function (d) { popup = { type: 'itemDetail', id: d.v }; render(); },
    slotPick: function (d) { popup = { type: 'slotPick', part: d.v, job: d.j }; render(); },
    composeOpen: function (d) { popup = { type: 'compose', id: d.v, n: 1 }; render(); },
    composeN: function (d) {
      var c = Engine.composeCost(M, popup.id), max = Math.max(1, Math.min(Math.floor(Number(S.materials[c.fromId] || 0) / c.qty), Math.floor(S.wallet.gold / c.gold)));
      popup.n = d.v === 'max' ? max : Math.max(1, Math.min(max, (popup.n || 1) + Number(d.v))); render();
    },
    doCompose: function (d) {
      var c = Engine.composeCost(M, d.v), n = popup.n || 1;
      if (Number(S.materials[c.fromId] || 0) < c.qty * n || S.wallet.gold < c.gold * n) { toast('재료 또는 골드가 부족해요'); return; }
      S.materials[c.fromId] -= c.qty * n; S.materials[d.v] = Number(S.materials[d.v] || 0) + n; S.wallet.gold -= c.gold * n;
      popup = null; toast(matName(d.v) + ' ' + n + '개 합성 완료'); render();
      commit('compose', { material_id: d.v, count: n });
    },
    charJob: function (d) { go('char', { job: d.v }); },
    setMain: function (d) {
      S.member.main_job_id = d.v; render();
      act('setMainJob', { job_id: d.v }).then(function (res) { if (res.ok) toast(job(d.v).name + '을(를) 대표 캐릭터로 설정했어요'); });
    },
    chestOpen: function (d) {
      var ch = S.chests.filter(function (x) { return x.chest_id === d.v; })[0], loc = ch && chestLocal(ch);
      if (loc) { chestApply(d.v, loc); popup = { type: 'chestOpened', res: loc }; render(); commit('chestOpen', { chest_id: d.v, item_ids: loc.items.map(function (x) { return x.inv_item_id; }) }); return; }
      act('chestOpen', { chest_id: d.v }).then(function (res) {
        if (!res.ok) { toast(res.error.message); return; }
        chestApply(d.v, res.data); S.wallet = res.data.wallet;
        popup = { type: 'chestOpened', res: res.data }; render();
      });
    },
    probs: function () { popup = { type: 'probs' }; render(); },
    replayTutorial: function () { TUT.replay = true; TUT.rstep = 1; TUT.scrolled = {}; go(tutHome(1)); },
    tutReplayNext: function () { if (TUT.rstep >= 6) { A.tutReplayEnd(); return; } TUT.rstep++; go(tutHome(TUT.rstep)); },
    tutReplayEnd: function () { TUT.replay = false; toast('튜토리얼 다시 보기를 마쳤어요'); render(); },
    tutOk: function () { tutDone(tutCur()); render(); },
    tutSkip: function () {
      popup = { type: 'confirm', title: '튜토리얼을 건너뛸까요?', text: '안내 없이 바로 시작해요. 완료 보상 300G는 건너뛰어도 받아요. 캐릭터 › 설정에서 다시 볼 수 있어요.', yes: '건너뛰기', no: '계속하기',
        run: function () { tutDone(S.tutorial.steps); render(); } }; render();
    },
    coachNext: function () { if (D.coach < RAID_COACH.length - 1) { D.coach++; render(); } else A.coachClose(); },
    coachClose: function () { D.coach = null; S.tutorial.raid_coach_seen = new Date(now()).toISOString(); act('raidGuideSeen', { kind: 'coach' }); render(); },
    replayIntro: function () { go('intro'); },
    resetDemo: function () {
      popup = { type: 'confirm', title: '시연 초기화', text: '데모 계정의 모든 진행을 처음 상태로 되돌립니다.', yes: '초기화', run: function () {
        act('resetDemo', {}).then(function (res) { if (res.ok) { setSave(res.data.save); dgSave(null); D.round = null; D.er = null; toast('시연 초기화 완료'); go('launcher'); } else toast(res.error.message); });
      } }; render();
    },
    hidden: function () {
      var t = Date.now(); hiddenTaps = hiddenTaps.filter(function (x) { return t - x < 600 * 3; }); hiddenTaps.push(t);
      if (hiddenTaps.length >= 3) { hiddenTaps = []; if (view.name === 'hunt' && S.hunt) claim(true); }
    }
  };
  function startHunt(courseId) {
    // 사냥 화면을 바로 보여주고, 서버가 정한 시작 시각으로 곧 맞춤
    var tut = !!(S.tutorial && S.tutorial.trial_available);
    S.hunt = { course_id: courseId, job_id: mainJob(), started_at: new Date(now()).toISOString(), tutorial: tut,
      max_ticks: tut ? M.tutorial.trialTicks : M.huntConst.maxTicks, tick_minutes: tut ? null : M.huntConst.tickMinutes,
      trial_wait_seconds: tut ? M.tutorial.trialWaitSeconds : null, pending: true };
    tutDone(2); go('hunt');
    act('huntStart', { course_id: courseId }).then(function (res) {
      if (!res.ok) { S.hunt = null; toast(res.error.message); reload().then(function () { go('map'); }); return; }
      S.hunt = res.data.hunt; offset = Date.parse(res.data.hunt.server_time) - Date.now();
      if (view.name === 'hunt' || view.name === 'map') render();
    });
  }
  /** GM-07 외형 카드: 현재 외형 크게 + 세트 진행(4·6·8) + 다음 외형 실루엣 (B-30·B-33) */
  function lookCard(j) {
    var lk = lookOf(j), L = M.lookStage || { minParts: 4, setParts: [6, 8] }, marks = [L.minParts].concat(L.setParts), max = marks[marks.length - 1];
    var nextStage = Math.min(5, lk.stage + 1), G = lookGoalOf(j, S.items), have = G.kind === 'stage' ? G.have : 0, goal = G.text;
    return '<div class="card lookcard"><div class="lookstage">' + charPic(j, lk, 'idle', 'big') +
      (lk.stage < 5 ? '<div class="nextlook" title="다음 외형">' + charPic(j, { stage: nextStage, set: 0 }, 'idle', 'sil') + '<span>다음 외형</span></div>' : '') + '</div>' +
      '<div class="row"><b style="color:' + LOOK_COLOR[lk.stage] + '">' + LOOK_NAME[lk.stage] + ' 외형</b>' + (lk.set ? '<span class="setbadge">' + setLabel(lk) + '</span>' : '') + '<span class="small" style="flex:1;text-align:right">' + esc(goal) + '</span></div>' +
      '<div class="setbar">' + marks.map(function (m) { return '<i class="' + (lk.stage && lk.count >= m ? 'on' : '') + '" style="left:' + (m / max * 100) + '%"><b>' + m + '</b></i>'; }).join('') + '<u style="width:' + Math.min(100, (lk.stage ? lk.count : have) / max * 100) + '%"></u></div>' +
      '<p class="small">같은 등급 4부위 = 외형 변경 · 6세트·8세트 = 효과 추가. 랭킹·레이드에서 다른 골퍼에게 이 모습이 보여요</p></div>';
  }
  /** 장착 변화로 외형·세트가 오르면 진화 팝업(B-33) */
  function lookCheck(j, before) {
    var after = lookOf(j); rankAt = 0;
    if (after.stage > before.stage || (after.stage === before.stage && after.set > before.set)) popup = { type: 'evolve', job: j, from: before, to: after };
  }
  /** 상자 내용(서버가 레이드 종료 때 확정해 둔 값)으로 개봉 결과를 미리 만듦 */
  function chestLocal(c) {
    var con = c.contents; if (typeof con === 'string') { try { con = JSON.parse(con); } catch (e) { con = null; } }
    if (!con || !con.materials) return null;
    return { contents: con, items: (con.items || []).map(function (id) { return { inv_item_id: Api.uuid(), item_id: id, is_great: 'N', cp: IX.item[id].cp, equipped_job_id: '' }; }) };
  }
  function chestApply(id, data) {
    var c = data.contents; S.wallet.gold += c.gold; addMats(c.materials); addMats(c.special);
    S.items = S.items.concat(data.items); S.chests = S.chests.filter(function (x) { return x.chest_id !== id; });
  }
  function claim(skip, thenCourse) {
    var h = S.hunt; if (!h) return;
    var noTicks = function () {
      popup = { type: 'confirm', title: '보상 없이 종료할까요?', text: h.tutorial ? '체험 보상은 시작 30초 뒤에 쌓여요.' : '아직 쌓인 보상이 없어요(5분마다 계산).', yes: '보상 없이 종료', no: '계속 사냥', run: function () {
        S.hunt = null; if (thenCourse) startHunt(thenCourse); else go('map'); // 화면 먼저, 서버 종료는 뒤에서
        commit('huntClaim', { cancel: true });
      } }; render();
    };
    // 같은 엔진·같은 시드로 보상을 미리 계산해 결과를 바로 보여 줌(v0.5 최적화). 시드를 아직 못 받았으면 서버 응답을 기다림
    var local = null;
    if (h.seed && !h.pending) {
      var ticks = skip ? Engine.huntMaxTicks(M, h.tutorial) : Engine.huntTicks(M, Date.parse(h.started_at), now(), h.tutorial);
      if (!ticks) { noTicks(); return; }
      var rw0 = Engine.huntRewards(M, h, ticks);
      local = { reward: rw0, items: rw0.items.map(function (id) { return { inv_item_id: Api.uuid(), item_id: id, is_great: 'N', cp: IX.item[id].cp, equipped_job_id: '' }; }), tutorial_trial: !!h.tutorial };
    }
    var apply = function (data) {
      S.hunt = null; S.wallet.gold += data.reward.gold;
      var rw = data.reward; addMats(rw.materials);
      S.items = S.items.concat(data.items);
      if (S.tutorial && data.tutorial_trial) { S.tutorial.trial_available = false; S.tutorial.trial_reward_at = new Date(now()).toISOString(); }
      tutDone(3);
      if (thenCourse) { // 사냥터 이동: 결과창 없이 희귀 획득만 토스트(B-07)
        var rare = Object.keys(rw.materials).filter(function (id) { return IX.material[id].isSpecial; }).map(function (id) { return matName(id) + ' ' + rw.materials[id]; })
          .concat(data.items.map(function (x) { return IX.item[x.item_id].name; }));
        startHunt(thenCourse); toast('보상 ' + fmt(rw.gold) + 'G 수령' + (rare.length ? ' · 희귀 획득! ' + rare.join(', ') : '')); return;
      }
      view = { name: 'map', p: {} }; resetScroll = true; popup = { type: 'huntResult', res: data, course: h.course_id }; render();
    };
    var payload = skip ? { skip: true } : {};
    if (local) {
      payload.item_ids = local.items.map(function (x) { return x.inv_item_id; });
      apply(local);
      commit('huntClaim', payload, function (data) {
        // 경계 시각에 틱 수가 달라졌으면 서버 값으로 다시 맞춤
        if (data.reward.ticks !== local.reward.ticks || data.reward.gold !== local.reward.gold) {
          reload().then(function () { if (popup && popup.type === 'huntResult' && popup.res === local) popup.res = data; render(); });
        }
      });
      return;
    }
    act('huntClaim', payload).then(function (res) {
      if (!res.ok && res.error.code === 'NO_TICKS') { noTicks(); return; }
      if (!res.ok) { toast(res.error.message); return; }
      apply(res.data); S.wallet = res.data.wallet;
    });
  }

  root.addEventListener('click', function (e) {
    if (e.target.classList && e.target.classList.contains('overlay') && e.target.getAttribute('data-a') === 'overlayClose') { popup = null; render(); return; }
    var el = e.target.closest('[data-a]'); if (!el || el.disabled) return;
    if (el.getAttribute('data-a') === 'overlayClose') return; // 시트 안쪽 클릭은 무시
    var f = A[el.getAttribute('data-a')]; if (f) { e.preventDefault(); f(el.dataset, el); }
  });
  root.addEventListener('submit', function (e) {
    var f = e.target.getAttribute('data-form'); if (f !== 'login') return;
    e.preventDefault();
    var id = e.target.id.value.trim(), pw = e.target.pw.value.trim();
    if (!id || !pw) { view.p = { id: id, err: '아이디와 비밀번호를 입력해 주세요' }; render(); return; }
    view.p = { id: id, busy: true }; render();
    Api.login(id, pw).then(function (res) {
      if (!res.ok) { view.p = { id: id, err: res.error.message }; render(); return; }
      setSave(res.data.save); TUT.replay = false; go('launcher'); dgRestore(); preloadLooks();
    });
  });
  // 인트로: 컷 등장·진행 점·마지막 컷에서만 [모험 시작]
  root.addEventListener('scroll', function (e) {
    if (e.target.matches && e.target.matches('[data-scroll="intro"]')) {
      var cur = 0, top = e.target.getBoundingClientRect().top, hgt = e.target.clientHeight;
      e.target.querySelectorAll('.cut').forEach(function (c, i) {
        var b = c.getBoundingClientRect();
        if (b.top - top < hgt * 0.6) { c.classList.add('in'); cur = i; }
      });
      if (e.target.scrollTop + hgt >= e.target.scrollHeight - 8) cur = 3;
      if (cur !== (view.p.cut || 0)) {
        view.p.cut = cur;
        root.querySelectorAll('.cutdots i').forEach(function (d, i) { d.className = i === cur ? 'on' : ''; });
        var scr = root.querySelector('.screen.intro'); if (scr) scr.classList.toggle('last', cur === 3);
      }
      return;
    }
    if (document.getElementById('coachLayer') && coachSpec()) requestAnimationFrame(layoutCoach);
  }, true);
  window.addEventListener('resize', function () { if (S) layoutCoach(); });

  // ================= 던전 (DG-00 ~ DG-07, CM-02) =================
  // 레이드 상태는 서버(roundSync)가 시드·시작 시각·SP 기록으로 재생해 확정한다. 화면은 같은 엔진으로 이벤트(샷 5초·홀 종료 3초)를 재생해 연출하고,
  // 홀 종료·SP 사용·완료 때 서버와 맞춘다(서버 값이 기준).
  var D = { code: '', fails: 0, lockUntil: 0, guests: [], job: null, round: null, er: null, sim: null, shown: 0, result: null, chests: [], openState: null,
    scoreMode: 'golf', busy: false, syncTimer: null, partyOpen: false, logOpen: {}, coach: null, spLocal: null, finishing: false, animLast: false };
  var SKILL_TEXT = {
    SHIELD: function (p) { return '보호막 · 모든 피해 ' + (p.WAR ? '15' : '30') + '% 감소' + (p.WAR ? ' (전사 방패)' : ''); },
    MAGIC_BARRIER: function () { return '마법 방어막 · 마법 피해 50% 감소(도적 25%)'; },
    PHYS_BARRIER: function () { return '물리 방어막 · 물리 피해 50% 감소(도적 25%)'; },
    REGEN: function (p) { return p.ROG ? '재생 · 도적의 해독으로 무효' : '재생 · 보스 HP 5% 회복'; },
    THORNS: function () { return '가시 갑옷 · 기준보다 나쁜 결과 피해 50% 감소'; },
    WEAKNESS: function (p) { return '약점 노출 · 기준보다 좋은 결과 피해 ×' + (p.ARC ? '2.5 (궁수 저격)' : '2'); },
    FOG: function () { return '안개 · 피해 ±20% 무작위'; },
    PAR3_DUEL: function () { return '파3 결투 · 파3에서 파 이하면 피해 ×1.5'; }
  };
  var CLUB_FILE = { DRIVER: 'driver', IRON: 'iron', PUTTER: 'putter' };
  function dgSave(id) { try { if (id) localStorage.setItem('rf_round_' + S.member.member_id, id); else localStorage.removeItem('rf_round_' + S.member.member_id); } catch (e) {} }
  function dgSaved() { try { return localStorage.getItem('rf_round_' + S.member.member_id); } catch (e) { return null; } }
  function partyJobs(ps) { var o = {}; ps.forEach(function (p) { o[p.job_id] = true; }); return o; }
  function dgScreen(body, opts) {
    opts = opts || {};
    return '<div class="screen dg">' + (opts.top || topbar()) + '<div class="scroll">' + body + '</div>' + (opts.foot || '') + (opts.tabs === false ? '' : tabs('dungeon')) + '</div>';
  }
  function bossImg(id, hit) { return asset(id + (hit ? '_hit' : '_idle') + '.png'); }
  function dgActive() { return !!(D.round && D.round.status === 'ACTIVE' && !D.finishing); }
  function nickOf(slot) { var p = D.round.participants[slot]; return p ? p.nickname : ''; }

  /** 서버 라운드 → 엔진 입력(같은 라운드면 계획 캐시 유지) */
  function dgApply(r) {
    if (r.server_time) offset = Date.parse(r.server_time) - Date.now();
    var same = D.er && D.er.seed === r.seed;
    if (!same) D.er = { seed: r.seed, course_id: r.course.id, boss_hp: r.boss.hp_max, participants: r.participants, job_bonus: r.job_bonus, skill_schedule: r.skill_schedule };
    D.er.started_at_ms = r.started_at ? Date.parse(r.started_at) : now();
    D.er.sp_requests = r.sp_requests || [];
    if (!same) { D.shown = 0; D.sim = null; D.logOpen = {}; }
    D.round = r;
    if (r.status !== 'ACTIVE' && r.status !== 'DONE') return;
    // 서버 처리분이 화면보다 앞서면 재생 위치를 맞춘다(놓친 구간은 연출 생략, 로그에만)
    if (!D.sim || D.shown > r.processed || r.processed - D.shown > 3) dgShow(D.animLast && r.processed > 0 ? r.processed - 1 : r.processed);
    else D.sim = dgSim(D.shown);
    // 같은 지점이면 서버 값이 기준: 엔진 재생과 다르면 서버 값으로 맞춤
    if (D.shown === r.processed && D.sim && Math.abs(D.sim.total - r.total_damage) > 0.01) {
      console.warn('raid replay mismatch', D.sim.total, r.total_damage);
      D.sim.players = r.players; D.sim.total = r.total_damage; D.sim.boss_hp_left = r.boss_hp_left; D.sim.holes = r.holes;
    }
  }
  function dgSim(i) { return Engine.simulateRound(M, D.er, i, D.er.sp_requests); }
  function dgShow(i) { D.shown = i; D.sim = dgSim(i); }
  function dgPlan() { return Engine.buildPlan(M, D.er); }

  /** 0.25초마다: 서버 시각 기준 이벤트가 끝났으면 다음 이벤트를 연출 */
  function dgTick() {
    if (!dgActive() || !D.er || D.round.status !== 'ACTIVE') return;
    var idx = Engine.indexAt(M, D.er, now());
    if (idx <= D.shown) return;
    var on = view.name === 'dgRaid' && !document.hidden, prev = D.sim;
    if (!on) { dgShow(idx); return; }
    if (idx - D.shown > 2 && !D.animLast) { dgShow(idx); render(); return; }
    D.animLast = false;
    dgShow(idx); render(); dgAnimate(idx - 1, prev);
    if (D.sim.finished) dgSync({});
  }
  /** 레이드 공격자 등장(B-35): 직업·외형 공격 그림 + 머리 위 이름표(닉네임·골프존 등급·세트), 1.6초 후 퇴장. 동시에 1명 */
  function attacker(fx, slot, strong, finish) {
    var p = D.round.participants[slot]; if (!p) return;
    fx.querySelectorAll('.attacker').forEach(function (x) { x.remove(); });
    var lk = { stage: Number(p.look_stage || 0), set: Number(p.set_tier || 0) };
    spawn(fx, '<div class="attacker' + (slot === 0 ? ' me' : '') + (strong ? ' strong' : '') + (finish ? ' finish' : '') + '">' +
      '<span class="nameplate"><b>' + esc(p.nickname) + '</b><i>' + esc(p.grade_code || '') + '</i>' + (lk.set ? '<em>' + setLabel(lk) + '</em>' : '') + '</span>' +
      charPic(p.job_id, lk, 'atk') + '</div>', 1700);
    if (slot === 0 && !finish) { // 내 샷: SP 흡수 빛(fx_sp_gain)이 SP 막대로 들어감
      spawn(fx, '<img class="spgain" src="' + asset('fx_sp_gain.png') + '" alt="" onerror="this.remove()">', 1300);
      var sw = root.querySelector('.spwrap'); if (sw) { sw.classList.remove('gain'); void sw.offsetWidth; sw.classList.add('gain'); }
    }
  }
  /** 이벤트 연출: 샷 = 클럽 궤적 + 피격 + 실제 피해 d / 홀 종료 = 피니시 + E (E=0이면 '피니시 없음') */
  function dgAnimate(i, prev) {
    var ev = dgPlan().events[i], box = root.querySelector('.bossbox'), fx = box && box.querySelector('.fxlayer'); if (!fx) return;
    box.classList.remove('hit'); void box.offsetWidth;
    if (ev.type === 'SHOT') {
      var s = D.sim.shots[D.sim.shots.length - 1];
      attacker(fx, s.slot, s.quality === 'CRIT'); // B-35: 샷을 친 플레이어의 캐릭터가 등장해 공격
      spawn(fx, '<img class="clubfx" src="' + asset('fx_club_' + CLUB_FILE[s.club] + '.png') + '" alt="" onerror="this.remove()">', 700);
      setTimeout(function () { // 캐릭터 돌진이 보스에 닿는 순간(약 0.6초)에 피격
        box.classList.add('hit');
        spawn(fx, '<i class="sprite ' + (s.quality === 'CRIT' ? 'crit' : 'hit') + '"></i>', 420);
        if (s.d < 0.5) spawnFloat(fx, '막힘', 'blocked'); else spawnFloat(fx, '-' + fmtR(s.d), s.quality === 'CRIT' ? 'crit' : s.quality === 'STRONG' ? 'strong' : '');
      }, 600);
    } else {
      var hres = D.sim.holes[D.sim.holes.length - 1], me = hres.players[0], jb = D.round.participants[0].job_id;
      var party = hres.players.reduce(function (a, x) { return a + x.E; }, 0);
      if (me.E >= 0.5) {
        attacker(fx, 0, me.sp_used, true);
        spawn(fx, '<img class="finishfx" src="' + asset('fx_finish_' + JOB_FILE[jb] + '.png') + '" alt="" onerror="this.remove()">', 1300);
        setTimeout(function () { box.classList.add('hit'); spawnFloat(fx, '피니시 -' + fmtR(me.E) + (me.sp_used ? ' · SP ×' + me.sp_mult : ''), 'finish'); }, 600);
      } else spawnFloat(fx, '피니시 없음', 'blocked small');
      if (party - me.E >= 0.5) setTimeout(function () { spawnFloat(fx, '파티 피니시 -' + fmtR(party - me.E), 'party'); }, 650);
    }
    // SP 100 도달(C-7 UI 흐름 1)
    var a = prev && prev.players[0], b = D.sim.players[0];
    if (b.sp_state === 'READY' && (!a || a.sp_state !== 'READY')) toast('특수공격 준비! 지금 누르면 이번 홀 피니시에 적용돼요');
  }
  /** 서버 동기화: 증분 샷(since_event), 다음 홀 종료 시점에 다시 */
  function dgSync(p) {
    if (!D.round) return Promise.resolve();
    clearTimeout(D.syncTimer);
    var body = Object.assign({ round_id: D.round.round_id }, p || {});
    if (body.since_event === undefined && !body.full) body.since_event = D.round.processed || 0;
    delete body.full;
    return Api.call('roundSync', body, { read: true }).then(function (res) {
      if (!res.ok) {
        toast(res.error.message);
        if (res.error.code === 'ROUND_EXPIRED' || res.error.code === 'BAD_REQUEST') { dgSave(null); D.round = null; D.er = null; if (view.name === 'dgRaid') go('dungeon'); }
        else dgSchedule();
        return res;
      }
      dgApply(res.data.round);
      if (view.name === 'dgRaid' || view.name === 'dungeon') render();
      dgSchedule();
      return res;
    });
  }
  function dgSchedule() {
    clearTimeout(D.syncTimer);
    if (!dgActive() || !D.er || D.round.finished) return;
    var plan = dgPlan(), j = D.round.processed;
    while (j < plan.total && plan.events[j].type !== 'HOLE_END') j++;
    var at = j < plan.total ? D.er.started_at_ms + plan.ends[j] + 400 : D.er.started_at_ms + plan.ends[plan.total - 1] + 400;
    D.syncTimer = setTimeout(function () { if (view.name === 'dgRaid') dgSync({}); else dgSchedule(); }, Math.max(1500, Math.min(120000, at - now())));
  }
  /** 재접속·탭 이동 후 복원: since_event 없이 전체 상태 */
  function dgResume(id) {
    return Api.call('roundSync', { round_id: id }, { read: true }).then(function (res) {
      if (!res.ok) { dgSave(null); D.round = null; D.er = null; if (res.error.code === 'ROUND_EXPIRED') toast(res.error.message); return false; }
      dgApply(res.data.round); var r = res.data.round;
      if (r.status === 'READY' || r.status === 'ACTIVE') return true;
      dgSave(null); D.round = null; D.er = null; return false;
    });
  }
  /** 로그인 직후 진행 중 레이드 조용히 불러오기(상단 레이드 링·DG-00 이어 보기) */
  function dgRestore() {
    var id = dgSaved() || (S && S.active_round && S.active_round.round_id); if (!id) return; // 서버가 알려 준 진행 중 레이드도 복원(B-39)
    dgResume(id).then(function (ok) { if (ok) { dgSchedule(); if (view.name !== 'boot') render(); } });
  }
  /** 다른 화면에 있을 때 레이드 완료: 결과 확정 + 토스트(B-19) */
  function dgFinishBackground() {
    if (!dgActive() || !D.er || view.name === 'dgRaid') return;
    var plan = dgPlan();
    if (Engine.indexAt(M, D.er, now()) < plan.total) return;
    D.finishing = true;
    act('roundFinish', { round_id: D.round.round_id }).then(function (res) {
      if (!res.ok) { D.finishing = false; return; }
      dgFinished(res.data); D.finishing = false; render();
      toast('레이드 완료! 상자를 확인하세요');
    });
  }
  function dgFinished(data) {
    D.result = data.result; D.bonusDone = false; dgSave(null); if (S) S.active_round = null;
    if (data.wallet) S.wallet = data.wallet;
    D.chests = data.result.chest ? [data.result.chest] : [];
    if (data.result.chest && !S.chests.some(function (c) { return c.chest_id === data.result.chest.chest_id; })) S.chests.push(data.result.chest);
    if (D.round) { D.round.status = 'DONE'; dgShow(dgPlan().total); }
    clearTimeout(D.syncTimer);
  }

  // ---- DG-04 표시 조각 ----
  function shotMetrics(s) {
    var d = s.data, ang = (d.angle > 0 ? '+' : '') + d.angle + '°';
    if (s.club === 'DRIVER') return [['비거리', Math.round(d.dist) + 'm'], ['방향각', ang]];
    if (s.club === 'IRON') return [['남은 거리', Math.round(d.remain) + 'm'], ['방향각', ang]];
    if (s.putt_index <= 1) return [['거리감', s.prev_remain ? (d.dist / s.prev_remain).toFixed(2) : '-'], ['방향각', ang]];
    return [['방향각', ang], ['볼 스피드', d.ball_speed + 'm/s']];
  }
  function shotCard() {
    var sim = D.sim, plan = dgPlan(), last = D.shown > 0 ? plan.events[D.shown - 1] : null;
    if (!last) return '<div class="card shotcard wait" data-tut="shotcard"><span class="gslabel">GS 샷데이터 수신</span><p class="sub">첫 샷 데이터를 기다리는 중이에요</p></div>';
    if (last.type === 'HOLE_END') {
      var H = sim.holes[sim.holes.length - 1];
      return '<div class="card shotcard holeend" data-tut="shotcard"><div class="row"><span class="gslabel">GS 홀 스코어 수신</span><b>' + H.hole + 'H 홀 종료</b></div>' +
        H.players.map(function (x) {
          return '<div class="row hrow"><span>' + esc(nickOf(x.slot)) + (x.slot === 0 ? ' (나)' : '') + '</span><span class="small">' + esc(x.result) + ' ' + x.strokes + '타</span><b>' + (x.E >= 0.5 ? '피니시 ' + fmtR(x.E) : '<span class="small">피니시 없음</span>') + (x.sp_used ? ' <i class="spx">SP ×' + x.sp_mult + '</i>' : '') + '</b></div>';
        }).join('') + '</div>';
    }
    var s = sim.shots[sim.shots.length - 1], m = shotMetrics(s), mine = s.slot === 0, pp = D.round.participants[s.slot] || {};
    // B-36: 왼쪽 = GS 샷데이터(누가·무엇을), 오른쪽 = 레이드 적용(입힌 피해·판정·SP)
    return '<div class="card shotcard v6 q-' + s.quality + (mine ? ' mine' : '') + '" data-tut="shotcard"><div class="gsside">' +
      '<div class="gshead"><span class="gslabel">GS 샷데이터 수신</span><b class="who">' + esc(nickOf(s.slot)) + (mine ? ' (나)' : '') + '</b><span class="grd">' + esc(pp.grade_code || '') + '</span><span class="seq">' + s.seq + '번째 샷</span></div>' +
      '<div class="row" style="justify-content:flex-start;gap:8px"><div class="clubic">' + img('icon_club_' + CLUB_FILE[s.club] + '.png') + '</div><b>' + esc(s.club_name) + (s.holeout ? ' · 홀아웃!' : '') + '</b></div>' +
      '<div class="metrics">' + m.map(function (x) { return '<span><i>' + x[0] + '</i><b>' + x[1] + '</b></span>'; }).join('') + '</div></div>' +
      '<div class="raidside"><span class="lbl">입힌 피해</span><b class="dd">' + (s.d < 0.5 ? '막힘' : '-' + fmtR(s.d)) + '</b><b class="qn">' + QUALITY_NAME[s.quality] + '</b><span class="spg">SP +' + s.sp_gain + '</span></div></div>';
  }
  function spState() {
    var me = D.sim.players[0], loc = D.spLocal;
    if (loc && D.shown < loc.at_event) return { state: loc.state, hole: loc.hole, sp: 0 };
    return { state: me.sp_state, hole: me.pending_hole, sp: me.sp };
  }
  function spButton() {
    if (D.sim.finished) return '';
    var st = spState(), sp = st.sp, label, cls = 'btn ghost spbtn', dis = true;
    if (st.state === 'READY') { label = '특수공격 사용 가능 · 피니시 1.2~2배'; cls = 'btn purple spbtn ready'; dis = false; }
    else if (st.state === 'WAIT') label = '이번 홀 적용 대기';
    else if (st.state === 'RESERVED') label = st.hole + 'H 적용 예약';
    else label = '특수공격 충전 중';
    return '<div class="spwrap" data-tut="spbtn"><div class="row"><span class="small">SP</span><div class="bar sp" style="flex:1"><i style="width:' + sp + '%"></i></div><b class="small">' + Math.round(sp) + '/100</b></div>' +
      (st.state === 'READY' ? '<img class="spcharge" src="' + asset('fx_sp_charge.png') + '" alt="" onerror="this.remove()">' : '') +
      '<button class="' + cls + '" data-a="dgSp"' + (dis ? ' disabled' : '') + '>' + label + '</button></div>';
  }
  function partyList() {
    var sim = D.sim, maxD = Math.max.apply(null, sim.players.map(function (x) { return x.damage; }).concat([1]));
    var head = '<button class="row partyhead" data-a="dgParty"><b>파티 ' + sim.players.length + '명</b><span class="small">이번 홀 샷 · 누적 피해 ' + (D.partyOpen ? '▴' : '▾') + '</span></button>';
    if (!D.partyOpen) return '<div class="card">' + head + '</div>';
    return '<div class="card">' + head + sim.players.map(function (x) {
      var p = D.round.participants[x.slot];
      return '<div class="prow"><span>' + esc(p.nickname) + (x.slot === 0 ? ' (나)' : '') + ' · ' + job(p.job_id).name + '</span><span class="small">' + (x.holed_out ? '홀아웃' : '샷 ' + x.hole_shots) + ' · ' + fmtR(x.damage) + '</span>' +
        '<div class="bar dmgbar" style="height:6px;grid-column:1/3"><i style="width:' + (x.damage / maxD * 100) + '%"></i></div></div>';
    }).join('') + '</div>';
  }
  function skillLeft(hole) { var n = 3 - ((hole - 1) % 3) - 1; return n ? '이후 ' + n + '홀 더' : '이번 홀까지'; }
  function nextLabel() {
    var r = D.round, plan = dgPlan(), i = D.shown;
    if (i >= plan.total) return '18홀 종료';
    var ev = plan.events[i], left = Math.max(0, Math.ceil((D.er.started_at_ms + plan.ends[i] - now()) / 1000));
    return '다음: ' + (ev.type === 'SHOT' ? esc(nickOf(ev.slot)) + ' ' + ev.seq + '번째 샷' : '홀 종료 스코어') + ' · ' + left + '초';
  }

  Object.assign(SCREENS, {
    /* DG-00 던전 탭: 콘텐츠 소개(스크린로그인 연결 없음, C-11·D-6) */
    dungeon: function () {
      var mine = '';
      if (dgActive()) mine += '<div class="card myraid"><div class="row"><b>진행 중인 레이드</b><span class="small">' + esc(D.round.boss.name) + '</span></div><p class="sub">' + esc(D.round.course.name) + ' · ' + Math.round(Engine.indexAt(M, D.er, now()) / D.round.total_events * 100) + '% 진행</p><button class="btn purple" data-a="dgResumeRing">이어 보기</button></div>';
      else if (D.round && D.round.status === 'READY') mine += '<div class="card myraid"><b>레이드 준비 중</b><p class="sub">' + esc(D.round.boss.name) + ' · 시작 전</p><button class="btn purple" data-a="dgResumeRing">이어 보기</button></div>';
      if (S.chests.length) mine += '<div class="card myraid"><div class="row"><b>미개봉 상자 ' + S.chests.length + '개</b><img class="chesticon" style="width:44px;height:44px" src="' + asset('chest_' + S.chests[0].reward_grade + '_closed.png') + '" alt="" onerror="this.remove()"></div>' +
        (D.result && D.result.grade_name ? '<p class="small">최근 결과 · ' + esc(D.result.grade_name) + ' 상자 · 데미지 비율 ' + Math.round(D.result.ratio * 100) + '%</p>' : '') +
        '<button class="btn gold" data-a="itemTab" data-v="chest">열기</button>' + (D.result && D.result.grade_name ? '<button class="btn ghost" data-a="dgShowResult">결과 보기</button>' : '') + '</div>';
      var chip = function (t) { return '<span class="gschip">' + t + '</span>'; };
      var steps = [
        ['GS 연동', '스크린로그인으로 GS에서 플레이하면 던전 레이드가 자동으로 연동돼요.', '<div class="ex"><span class="exbox">스크린</span><b>→</b><span class="exbox">골프존앱</span></div>'],
        ['보스·보상 결정', '골프 코스 난이도와 내 라운드 설정·개인 설정에 따라 보스와 보상 난이도가 정해져요.',
          '<div class="ex">' + chip('코스 난이도') + chip('라운드 설정') + chip('개인 설정') + '<b>→</b><span class="exbox">보스 등급 견습~전설</span></div>'],
        ['샷·스코어 공격', '내 샷과 홀별 스코어가 골프존 G핸디 등급을 기준으로 공격 데미지와 SP로 바뀌어요. SP가 가득 차면 특수공격을 쓸 수 있어요.',
          '<div class="ex"><span class="minishot">' + img('icon_club_driver.png') + '비거리 232m · 방향각 +2°<b>크리티컬</b></span><span class="exbox">홀 종료 피니시</span></div>' +
          '<div class="ex">' + ['참새', '까치', '학', '매', '독수리'].map(function (g) { return '<span class="gchip">' + g + '</span>'; }).join('') + '</div>'],
        ['보상·성장', '레이드를 마치면 상자에서 특수 재료(균열 파편·결정·핵)와 장비를 얻고, 희귀 이상 장비를 만들 수 있어요.',
          '<div class="ex"><img class="exchest" src="' + asset('chest_4_closed.png') + '" alt="" onerror="this.remove()"><b>→</b>' + ['MAT-RIFT-3', 'MAT-RIFT-4', 'MAT-RIFT-5'].map(matIcon).join('') + '<b>→</b><span class="exbox">희귀 장비</span></div>']
      ];
      return dgScreen(
        '<div class="dghero"><img src="' + asset('boss_riftlord_idle.png') + '" alt="" onerror="this.remove()"><div><h2 class="title">스크린 라운드가 곧 던전 레이드</h2><p>스크린로그인 후 GS에서 플레이하면 던전 레이드가 함께 진행돼요.</p></div></div>' +
        mine +
        '<div class="gsdata"><b class="small">GS 연동 데이터</b><div class="chips wrap">' + ['코스 난이도', '라운드 설정', '개인 설정', '샷데이터', '홀 스코어'].map(chip).join('') + '</div></div>' +
        '<div class="flow">' + steps.map(function (s, i) {
          return '<div class="fstep reveal"><i class="fno">' + '①②③④'[i] + '</i><div><b>' + s[0] + '</b><p class="sub">' + s[1] + '</p>' + s[2] + '</div></div>';
        }).join('') + '</div>' +
        '<div class="card entry"><b>입장 방법</b><p class="sub">레이드 입장은 골프존앱 메인 상단 [스크린로그인]에서</p>' +
        '<div class="miniapp"><div class="mock"><i class="m1"></i><i class="m2"></i><i class="m3"></i><i class="m4"></i></div>' +
        '<img src="' + asset('mini_app_main.png') + '" alt="골프존앱 메인 화면" onerror="this.remove()"><i class="pulse"></i></div></div>');
    },

    /* DG-01 스크린로그인 */
    dgLogin: function () {
      var wait = Math.max(0, Math.ceil((D.lockUntil - Date.now()) / 1000));
      var boxes = ''; for (var i = 0; i < 6; i++) boxes += '<p class="pinbox' + (i === D.code.length ? ' on' : '') + '">' + esc(D.code[i] || '') + '</p>';
      var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'clr'].map(function (k) {
        return '<button class="key" data-a="dgKey" data-v="' + k + '"' + (wait ? ' disabled' : '') + '>' + (k === 'del' ? '⌫' : k === 'clr' ? '지움' : k) + '</button>';
      }).join('');
      return '<div class="screen sl"><div class="sl-top"><button data-a="home">‹</button><b>스크린로그인</b><span></span></div>' +
        '<div class="scroll" style="gap:14px"><p class="notice" style="background:#E6F0FA;color:#1B2620">스크린에 표시된 6자리 번호를 입력해 주세요</p>' +
        '<div class="pins">' + boxes + '</div>' +
        '<p class="err" style="text-align:center">' + (D.busy ? '연결 중…' : wait ? '잠시 후 다시 시도해 주세요 · ' + wait + '초' : esc(D.err || '')) + '</p>' +
        '<div class="protobox"><b>프로토타입 안내</b><p>스크린 번호 111111을 입력하면 바로 시작할 수 있어요.</p><p>함께 치는 동반자는 다음 화면의 [게스트 추가]로 넣을 수 있어요(가상 플레이어).</p><p>레이드가 시작되면 샷과 스코어는 자동치기로 만들어져 진행돼요.</p></div>' +
        '<div style="flex:1"></div><div class="keypad">' + keys + '</div></div></div>';
    },

    /* DG-02 입장 대기 */
    dgLobby: function () {
      var me = { nickname: S.member.nickname, job: D.job || mainJob(), cp: cpOf(D.job || mainJob()), grade: S.member.grade_code, look: lookOf(D.job || mainJob()) };
      var list = [me].concat(D.guests.map(function (id) { var g = IX.guest[id]; return { guest: id, nickname: g.nickname, job: g.jobId, cp: g.cp, grade: g.gradeCode, look: Engine.lookByCp(M, g.cp) }; }));
      var cards = list.map(function (p, i) {
        return '<div class="card lobbycard' + (i === 0 ? ' hl' : '') + '">' + charPic(p.job, p.look, 'idle', 'mini') + '<div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="row"><b>' + esc(p.nickname) + (i === 0 ? ' (나)' : '') + '</b><span class="badge" style="background:var(--card2)">' + esc(job(p.job).name) + '</span></div>' +
          '<div class="row"><span class="sub">' + (i === 0 ? '' : '<i class="gsin">GS 수신</i> 게스트 · ') + esc(p.grade) + ' · 전투력 ' + fmt(p.cp) + ' · ' + esc(job(p.job).role) + '</span>' +
          (i === 0 ? '<button class="chip" data-a="dgJobSheet">캐릭터 변경</button>' : '<button class="chip" data-a="dgGuestDel" data-v="' + p.guest + '">삭제</button>') + '</div></div></div>';
      }).join('');
      var jobsIn = partyJobs(list.map(function (p) { return { job_id: p.job }; }));
      var missing = JOBS.filter(function (j) { return !jobsIn[j]; }).map(function (j) { return job(j).role; });
      return dgScreen('<div class="row"><b style="font-size:18px">입장 대기 · ' + list.length + '/6명</b><button class="chip" data-a="dgClose">화면 닫기</button></div>' +
        '<div class="gsrecv"><i class="live"></i><b>GS에서 동반자 수신</b><span class="small">같은 방에서 스크린로그인한 동반자가 여기에 들어와요 · 같은 파티에게 내 캐릭터 모습이 보여요</span></div>' +
        cards + (list.length < 6 ? '<button class="btn purple pulsebtn" data-a="dgGuestAdd">+ 게스트 추가 (가상 동반자)</button>' : '') +
        '<p class="small">직업 구성 보너스: 서로 다른 직업 ' + Object.keys(jobsIn).length + '개' + (missing.length ? ' · 파티에 없는 역할: ' + missing.join(', ') : ' · 4직업 모두 참여') + '</p>' +
        '<div style="flex:1"></div><button class="btn" data-a="dgNext"' + (D.busy ? ' disabled' : '') + '>' + (D.busy ? '레이드 준비 중…' : '다음 (참가자 확인)') + '</button>' +
        '<button class="btn danger" data-a="dgLeave">레이드 나가기</button>');
    },

    /* DG-03 레이드 준비: GS 코스 → 라운드 설정 → 난이도 점수 → 지역 보스 → HP */
    dgReady: function () {
      var r = D.round, zone = M.diffZones.filter(function (z) { return z.zone === r.zone; })[0], rs = r.room_settings || {};
      var reg = IX.region[r.course.region_id];
      var flow = [
        ['GS 코스', esc(r.course.name), (reg ? esc(reg.name) + ' · ' : '') + '18홀 PAR ' + r.course.par.reduce(function (a, b) { return a + b; }, 0)],
        ['라운드 설정', Object.keys(rs).slice(0, 2).map(function (k) { return esc(k + ' ' + rs[k]); }).join(' · '), Object.keys(rs).slice(2).map(function (k) { return esc(k + ' ' + rs[k]); }).join(' · ')],
        ['난이도 점수', r.diff_score + '점', '구간 ' + r.zone + ' · ' + esc(zone.bossRank)],
        ['지역 보스', esc(r.boss.name), reg ? esc(reg.name) + ' 지역' : ''],
        ['보스 HP', fmt(r.boss.hp_max), '최고 보상 ' + GRADE_NAME[zone.maxRewardGrade] + ' 상자']
      ];
      return dgScreen('<div class="row"><b style="font-size:20px">레이드 준비</b><span class="simbadge">시뮬레이션</span></div>' +
        '<div class="bossbox"><img src="' + bossImg(r.boss.id) + '" alt="" onerror="this.remove()"><div class="bossname">' + esc(r.boss.name) + '</div></div>' +
        '<p class="sub" style="text-align:center">"' + esc(r.boss.line) + '"</p>' +
        '<ol class="gsflow">' + flow.map(function (f, i) { return '<li style="animation-delay:' + (i * 0.45) + 's"><span class="k">' + f[0] + '</span><b>' + f[1] + '</b><span class="small">' + f[2] + '</span></li>'; }).join('') + '</ol>' +
        '<div class="card"><b>참가 ' + r.participants.length + '명 · 구성 보너스 +' + Math.round(r.job_bonus * 100) + '%</b><div class="partyfaces">' + r.participants.map(function (p) { return '<div>' + charPic(p.job_id, { stage: Number(p.look_stage || 0), set: Number(p.set_tier || 0) }, 'idle', 'mini') + '<span>' + esc(p.nickname) + '</span></div>'; }).join('') + '</div>' +
        '<p class="small">보스 스킬: 1·4·7·10·13·16번 홀마다 무작위 발동 · 자동치기 샷당 ' + r.timing.shot_seconds + '초 · 홀 종료 ' + r.timing.hole_end_seconds + '초</p></div>' +
        '<div style="flex:1"></div><button class="btn purple" data-a="dgStart"' + (D.busy ? ' disabled' : '') + '>' + (D.busy ? '시작 중…' : '레이드 시작') + '</button><p class="small" style="text-align:center">시작 후에는 참가자·캐릭터를 바꿀 수 없어요</p>');
    },

    /* DG-04 레이드 플레이(D-2) */
    dgRaid: function () {
      var r = D.round; if (!r || !D.sim) return SCREENS.dungeon();
      var sim = D.sim, hole = sim.position.hole, par = r.course.par[hole - 1];
      var pj = partyJobs(r.participants), skill = Engine.skillAtHole(r.skill_schedule, hole);
      var hpPct = Math.max(0, sim.boss_hp_left / r.boss.hp_max * 100);
      var head = sim.finished ? '<b>18홀 종료</b>' : '<b>' + hole + 'H · PAR ' + par + '</b><span class="sub" id="dgNext">' + nextLabel() + '</span>';
      return dgScreen(
        '<div class="row raidtop">' + head + '<span class="simbadge">시뮬레이션</span></div>' +
        '<div class="bossbox raid"><div class="bossfig"><img class="bidle" src="' + bossImg(r.boss.id) + '" alt="" onerror="this.remove()"><img class="bhit" src="' + bossImg(r.boss.id, true) + '" alt="" onerror="this.remove()"></div><div class="bossname">' + esc(r.boss.name) + '</div><div class="fxlayer"></div></div>' +
        '<div class="card" style="background:#2A1A14"><div class="row"><span>HP</span><b>' + fmtR(sim.boss_hp_left) + ' / ' + fmt(r.boss.hp_max) + (sim.killed_at ? ' · ' + sim.killed_at + 'H 처치!' : '') + '</b></div><div class="bar hp"><i style="width:' + hpPct + '%"></i></div>' +
        (skill ? '<p style="color:#9CC7EE;font-size:13px">' + SKILL_TEXT[skill](pj) + ' · ' + skillLeft(hole) + '</p>' : '') + '</div>' +
        shotCard() + partyList(),
        { foot: '<div class="dgfoot">' + spButton() + '<div class="row" style="gap:8px"><button class="btn ghost sm" data-a="dgLog">로그 보기</button><button class="btn ghost sm" data-a="dgScore">스코어카드</button>' +
          (sim.finished ? '<button class="btn gold sm" data-a="dgFinish">결과 보기</button>' : '') + '</div></div>', tabs: false });
    },

    /* DG-06 라운드 결과·보상: 기여 막대·순위·특수 재료 미리보기 */
    dgResult: function () {
      var x = D.result || {}, r = D.round;
      if (x.aborted) return dgScreen('<div class="card"><b>라운드 중단</b><p class="sub">' + esc(x.message) + '</p></div><button class="btn" data-a="dgExit">던전 나가기</button>');
      var g = x.grade, ps = (x.players || []).slice(), tot = ps.reduce(function (a, p) { return a + p.damage; }, 0) || 1;
      var shotSum = ps.reduce(function (a, p) { return a + p.shot_damage; }, 0), holeSum = ps.reduce(function (a, p) { return a + p.hole_damage; }, 0);
      var sp = (IX.rewardGrade[g] && IX.rewardGrade[g].special) || [];
      var body = '<b style="font-size:20px">라운드 결과</b>' +
        '<div class="card"><div class="row"><b style="color:' + (x.killed_at ? 'var(--ok)' : 'var(--bad)') + '">' + (x.killed_at ? '보스 처치 · ' + x.killed_at + 'H' : '보스 생존') + '</b><span>' + esc(r ? r.boss.name : '') + '</span></div>' +
        '<p class="sub">파티 피해 ' + fmt(x.total_damage) + ' · 데미지 비율 ' + Math.round(x.ratio * 100) + '%</p>' +
        '<div class="stack"><i class="s1" style="width:' + (shotSum / tot * 100) + '%"></i><i class="s2" style="width:' + (holeSum / tot * 100) + '%"></i></div>' +
        '<div class="row small"><span><i class="lg s1"></i>샷 공격 ' + Math.round(shotSum / tot * 100) + '%</span><span><i class="lg s2"></i>홀 종료 공격 ' + Math.round(holeSum / tot * 100) + '%</span></div></div>' +
        '<div class="card"><b>기여 순위</b>' + ps.sort(function (a, b) { return b.damage - a.damage; }).map(function (p, i) {
          var pp = r && r.participants[p.slot];
          return '<div class="crow"><b class="rno">' + (i + 1) + '</b>' + (pp ? charPic(pp.job_id, { stage: Number(pp.look_stage || 0), set: Number(pp.set_tier || 0) }, 'idle', 'mini') : '') + '<span style="flex:1">' + esc(r ? nickOf(p.slot) : '#' + p.slot) + (p.slot === 0 ? ' (나)' : '') + '</span><span class="small">' + fmt(p.damage) + ' · ' + Math.round(p.damage / tot * 100) + '%</span>' +
            '<div class="stack thin"><i class="s1" style="width:' + (p.shot_damage / tot * 100) + '%"></i><i class="s2" style="width:' + (p.hole_damage / tot * 100) + '%"></i></div></div>';
        }).join('') + '</div>' +
        '<div class="card g' + g + '" style="border:2px solid var(--gc)"><div class="row" style="justify-content:flex-start"><img class="chesticon" src="' + asset('chest_' + g + '_closed.png') + '" alt="" onerror="this.remove()"><div><b class="gname" style="font-size:18px">' + esc(x.grade_name) + ' 상자 1개</b>' +
        '<p class="sub">' + (x.capped ? '데미지 비율로는 ' + esc(x.grade_by_ratio) + '이지만 난이도 ' + x.zone + ' 구간 최고 등급이 적용됐어요' : '데미지 비율 ' + Math.round(x.ratio * 100) + '%로 결정') + '</p></div></div>' +
        '<p class="small">특수 재료 미리보기</p><div class="row" style="justify-content:flex-start;gap:8px">' + (sp.length ? sp.map(function (s) { return matIcon(s.materialId) + '<span class="small">' + esc(matName(s.materialId)) + ' ' + s.min + '~' + s.max + '</span>'; }).join('') : '<span class="small">이 등급 상자에는 특수 재료가 없어요</span>') + '</div></div>' +
        '<button class="btn purple" data-a="dgOpenChests">받은 상자 열기</button>' +
        (D.bonusDone ? '<button class="btn ghost" disabled>1+1 추가 상자 지급 완료</button>' : '<button class="btn ghost" data-a="dgBuy">1+1 추가 상자 (시연용 결제)</button>') +
        '<button class="small" data-a="probs" style="padding:8px">확률 보기</button>';
      body += (r ? '<button class="btn ghost" data-a="dgScore">스코어카드</button>' : '') + '<button class="btn ghost" data-a="dgExit">던전 나가기</button>';
      return dgScreen(body);
    },

    /* DG-07 보물상자 개봉: 특수 재료 칸·완제품 장비 연출·[제작하러 가기] */
    dgChest: function () {
      var c = D.chests[0]; if (!c) return SCREENS.dgResult();
      var st = D.openState || 'closed', res = D.opened;
      var body = '<div class="row"><b style="font-size:20px">보물상자 개봉</b><span class="small">남은 상자 ' + D.chests.length + '개</span></div>' +
        '<div class="chestbox' + (st === 'opening' ? ' shake' : '') + '"><img src="' + asset('chest_' + c.reward_grade + (st === 'done' ? '_open' : '_closed') + '.png') + '" alt=""></div>' +
        '<p class="g' + c.reward_grade + '" style="text-align:center"><b class="gname">' + GRADE_NAME[c.reward_grade] + ' 상자' + (c.is_bonus === 'Y' ? ' · 1+1' : '') + '</b></p>';
      if (st === 'closed') body += '<button class="btn purple" data-a="dgOpen">탭해서 열기</button>';
      else if (st === 'opening') body += '<p class="sub" style="text-align:center">여는 중…</p>';
      else if (res) {
        var con = res.contents, spk = Object.keys(con.special || {});
        body += '<div class="card"><p>골드 <b data-count="' + con.gold + '">0</b></p><div class="grid">' + Object.keys(con.materials).map(function (id) {
          return '<div class="cell g' + IX.material[id].tier + '">' + matIcon(id) + '<span>' + esc(matName(id)) + ' ×' + con.materials[id] + '</span></div>'; }).join('') + '</div>' +
          '<b class="small" style="margin-top:6px">특수 재료</b>' + (spk.length ? spk.map(function (id) { return rareRow(IX.material[id].tier, matIcon(id), matName(id) + ' ×' + con.special[id]); }).join('') : '<p class="small">이번 상자에는 특수 재료가 없어요</p>') +
          res.items.map(function (x) { var it = IX.item[x.item_id]; return '<div class="rare big g' + it.grade + '"><i class="pillar"></i>' + itemIcon(x.item_id) + '<div><b class="gname">완제품 장비 획득!</b><p>' + GRADE_NAME[it.grade] + ' · ' + esc(it.name) + '</p></div></div>'; }).join('') + '</div>' +
          (D.chests.length > 1 ? '<button class="btn purple" data-a="dgNextChest">다음 상자 열기</button>' : '') +
          '<button class="btn" data-a="dgToCraft">제작하러 가기</button>' +
          (D.chests.length > 1 ? '<button class="btn ghost" data-a="dgLater">나중에 열기</button>' : '<button class="btn ghost" data-a="dgItems">아이템 확인</button><button class="btn ghost" data-a="dgLater">결과 화면으로</button>');
      }
      return dgScreen(body);
    }
  });

  Object.assign(POPUPS, {
    /* DG-02 캐릭터 변경 시트 */
    dgJobs: function () {
      var others = partyJobs(D.guests.map(function (id) { return { job_id: IX.guest[id].jobId }; }));
      return '<div class="overlay"><div class="sheet"><b>참여할 내 캐릭터</b>' + JOBS.map(function (j) {
        var cp = cpOf(j);
        return '<button class="row card" style="background:' + ((D.job || mainJob()) === j ? '#E8E2FB' : '#EEF2EA') + ';color:#1B2620;text-align:left" data-a="dgPickJob" data-v="' + j + '"><div style="flex:1"><b>' + job(j).name + ' · 전투력 ' + fmt(cp) + '</b><p class="sub">역할 ' + esc(job(j).role) + ' · ' + esc(job(j).roleEffect) + '</p></div>' +
          (others[j] ? '<span class="small">파티에 있음</span>' : '<span style="color:#2E8B57;font-size:12px;font-weight:700">파티에 없음</span>') + '</button>';
      }).join('') + '<button class="btn ghost" data-a="close">닫기</button></div></div>';
    },
    /* DG-04 이벤트 로그: 기본 = 실제 피해, 펼치면 계산 근거(장부값) */
    dgLog: function () {
      var sim = D.sim, plan = dgPlan(), rows = [], si = 0, hi = 0;
      for (var i = 0; i < D.shown; i++) {
        var ev = plan.events[i];
        if (ev.type === 'SHOT') rows.push({ k: 's' + i, shot: sim.shots[si++] }); else rows.push({ k: 'h' + i, hole: sim.holes[hi++] });
      }
      var html = rows.reverse().map(function (x) {
        var open = D.logOpen[x.k];
        if (x.shot) {
          var s = x.shot;
          return '<button class="logrow shot' + (s.slot === 0 ? ' mine' : '') + '" data-a="dgLogRow" data-v="' + x.k + '"><span>' + s.hole + 'H · ' + esc(nickOf(s.slot)) + ' ' + s.seq + '번째 샷 · ' + QUALITY_NAME[s.quality] + ' · ' + (s.d < 0.5 ? '막힘' : '피해 ' + fmtR(s.d)) + ' · SP +' + s.sp_gain + (s.sp_auto_used ? ' · 특수공격 자동 사용' : '') + '</span>' +
            (open ? '<span class="calc">기본 ' + fmtR(s.unit) + ' × ' + QUALITY_NAME[s.quality] + ' ' + s.q + ' = ' + fmtR(s.unit * s.q) + (s.capped ? ' → 홀 상한으로 ' + fmtR(s.d) : '') + ' · 샷 기본 몫 ' + fmtR(s.s) + '</span>' : '') + '</button>';
        }
        var H = x.hole;
        return '<button class="logrow hole" data-a="dgLogRow" data-v="' + x.k + '"><span><b>' + H.hole + 'H 홀 종료</b> · ' + H.players.map(function (p) { return esc(nickOf(p.slot)) + ' ' + esc(p.result) + ' 피니시 ' + fmtR(p.E) + (p.sp_used ? ' · SP ×' + p.sp_mult : ''); }).join(' / ') + '</span>' +
          (open ? H.players.map(function (p) { return '<span class="calc">' + esc(nickOf(p.slot)) + ': 목표 ' + fmtR(p.T) + ' − 샷 기본 몫 ' + fmtR(p.settle) + ' − 이월 ' + fmtR(p.carry_in) + ' = 피니시 ' + fmtR(p.E) + (p.carry_out >= 0.5 ? ' · 다음 홀로 이월 ' + fmtR(p.carry_out) : '') + '</span>'; }).join('') : '') + '</button>';
      }).join('');
      return '<div class="overlay" data-a="overlayClose"><div class="sheet logsheet">' + sheetHead('<b>이벤트 로그</b><span class="small">행을 누르면 계산 근거</span>') +
        '<p class="small"><i class="lg s1"></i>샷 이벤트 <i class="lg s2"></i>홀 종료 이벤트 · 샷 기본 몫·목표·이월은 계산에만 쓰는 장부값이고 보스 HP에는 실제 피해만 반영돼요</p>' +
        (html || '<p class="sub">아직 이벤트가 없어요</p>') + '</div></div>';
    },
    /* DG-05 스코어카드: 피해 보기 = 샷 피해 + 홀 종료 공격 = 합계, 이월 표시 */
    dgScore: function () {
      var r = D.round, sim = D.sim, mode = D.scoreMode, holes = sim ? sim.holes : [];
      var cell = function (slot, h) {
        var H = holes[h - 1], x = H && H.players[slot];
        if (!x) return '<td class="small">·</td>';
        if (mode === 'golf') { var d = x.strokes - H.par; return '<td style="color:' + (d < 0 ? '#2D6FE0' : d > 0 ? '#D64545' : '#1B2620') + '">' + (d > 0 ? '+' + d : d) + '</td>'; }
        return '<td class="dcell"><b>' + fmtR(x.damage) + '</b><span>' + fmtR(x.shot_damage) + '+' + fmtR(x.E) + '</span>' + (x.carry_out >= 0.5 ? '<i>↪' + fmtR(x.carry_out) + '</i>' : '') + '</td>';
      };
      var tot = function (slot) {
        var xs = holes.map(function (H) { return { x: H.players[slot], par: H.par }; });
        if (mode === 'golf') { var d = xs.reduce(function (a, y) { return a + y.x.strokes - y.par; }, 0); return d > 0 ? '+' + d : String(d); }
        return fmtR(sim.players[slot].damage);
      };
      var hs = []; for (var h = 1; h <= 18; h++) hs.push(h);
      return '<div class="overlay" data-a="overlayClose"><div class="sheet">' + sheetHead('<b>스코어카드</b>', '<div class="chips"><button class="chip' + (mode === 'golf' ? ' on' : '') + '" data-a="dgScoreMode" data-v="golf">골프 점수</button><button class="chip' + (mode === 'dmg' ? ' on' : '') + '" data-a="dgScoreMode" data-v="dmg">파티 피해</button></div>') +
        '<div class="sc"><table><tr><th class="fix">이름</th>' + hs.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '<th>합계</th></tr>' +
        '<tr><th class="fix small">PAR</th>' + hs.map(function (h) { return '<td class="small">' + r.course.par[h - 1] + '</td>'; }).join('') + '<td></td></tr>' +
        r.participants.map(function (p) { return '<tr><th class="fix">' + esc(p.nickname) + '</th>' + hs.map(function (h) { return cell(p.slot, h); }).join('') + '<td><b>' + tot(p.slot) + '</b></td></tr>'; }).join('') +
        '</table></div><p class="small">' + (mode === 'dmg' ? '칸 = 합계 / 샷 피해 + 홀 종료 공격 · ↪ = 다음 홀로 이월(장부값)' : '이름 열 고정, 옆으로 밀어서 보기') + ' · 파티 피해 합계 ' + fmtR(sim ? sim.total : 0) + '</p></div></div>';
    },
    /* CM-02 모의 결제 */
    dgBuy: function (p) {
      var st = p.state || 'confirm';
      if (st === 'processing') return '<div class="overlay center"><div class="sheet"><b>결제 처리 중…</b><p class="sub">잠시만 기다려 주세요</p></div></div>';
      if (st === 'fail') return '<div class="overlay center"><div class="sheet"><b>결제를 처리하지 못했어요</b><p class="sub">시연용 결제 실패 상황입니다.</p><button class="btn" data-a="dgBuyGo" data-v="success">다시 시도</button><button class="btn ghost" data-a="close">닫기</button></div></div>';
      var g = D.result.grade;
      return '<div class="overlay center"><div class="sheet"><b style="font-size:18px">보물상자 1+1</b>' +
        '<div class="row g' + g + '" style="justify-content:flex-start"><img class="chesticon" src="' + asset('chest_' + g + '_closed.png') + '" alt=""><div><b class="gname">' + GRADE_NAME[g] + ' 상자 1개 추가</b><p class="sub">가격 1,100원 · 라운드당 1회</p></div></div>' +
        '<p class="notice">실제 결제되지 않는 시연용입니다</p>' +
        '<button class="btn purple" data-a="dgBuyGo" data-v="success">구매</button><button class="btn ghost" data-a="dgBuyGo" data-v="cancel">취소</button>' +
        '<button class="small" data-a="dgBuyGo" data-v="fail" style="padding:6px">결제 실패 상황 보기(시연)</button></div></div>';
    }
  });

  // ---- 던전 동작 ----
  Object.assign(A, {
    dgLoginOpen: function () {
      var saved = dgSaved();
      if (saved) { toast('진행 중인 레이드를 불러오는 중…'); dgResume(saved).then(function (ok) { if (ok) dgOpenRound(); else { D.code = ''; D.err = ''; go('dgLogin'); } }); return; }
      D.code = ''; D.err = ''; go('dgLogin');
    },
    dgResumeRing: function () {
      if (!D.round) { go('dungeon'); return; }
      // 같은 화면 세션에서 진행 중이던 레이드는 이미 같은 엔진 상태가 있으므로 바로 열고, 서버 확인은 뒤에서(v0.5 최적화)
      if (D.er && D.sim && !D.round.finished) { dgOpenRound(); dgSync({}); return; }
      dgResume(D.round.round_id).then(function (ok) { if (ok) dgOpenRound(); else go('dungeon'); });
    },
    dgShowResult: function () { go('dgResult'); },
    dgKey: function (d) {
      if (D.busy || Date.now() < D.lockUntil) return;
      if (d.v === 'del') D.code = D.code.slice(0, -1); else if (d.v === 'clr') D.code = ''; else if (D.code.length < 6) D.code += d.v;
      D.err = ''; render();
      if (D.code.length === 6) {
        D.busy = true; render();
        setTimeout(function () { // 프로토타입: 111111만 성공(실연동 시 스크린 번호 확인 API)
          D.busy = false;
          if (D.code === '111111') { D.fails = 0; D.guests = []; D.job = mainJob(); toast('스마트로그인 완료'); go('dgLobby'); }
          else { D.fails++; D.code = ''; D.err = '번호를 다시 확인해 주세요'; if (D.fails >= 5) { D.lockUntil = Date.now() + 60000; D.fails = 0; var t = setInterval(function () { if (Date.now() >= D.lockUntil) clearInterval(t); if (view.name === 'dgLogin') render(); }, 1000); } render(); }
        }, 600);
      }
    },
    dgJobSheet: function () { popup = { type: 'dgJobs' }; render(); },
    dgPickJob: function (d) { D.job = d.v; popup = null; render(); },
    dgGuestAdd: function () {
      var used = {}; D.guests.forEach(function (g) { used[g] = 1; });
      var pool = M.guests.filter(function (g) { return g.use && !used[g.id]; });
      if (!pool.length || D.guests.length >= 5) return;
      D.guests.push(pool[Math.floor(Math.random() * pool.length)].id); render();
    },
    dgGuestDel: function (d) { D.guests = D.guests.filter(function (g) { return g !== d.v; }); render(); },
    dgClose: function () { go('map'); toast('입장 대기는 골프존앱 메인 [스크린로그인]에서 다시 열 수 있어요'); },
    dgLeave: function () { popup = { type: 'confirm', title: '레이드에서 나갈까요?', text: '입장 대기 중인 파티가 해산됩니다.', yes: '나가기', run: function () { D.guests = []; go('dungeon'); } }; render(); },
    dgNext: function () {
      D.busy = true; render();
      act('roundCreate', { guest_ids: D.guests, job_id: D.job || mainJob() }).then(function (res) {
        D.busy = false;
        if (!res.ok) { toast(res.error.message); render(); return; }
        D.er = null; D.result = null; dgApply(res.data.round); dgSave(D.round.round_id); S.active_round = { round_id: D.round.round_id, status: 'READY' };
        D.round.participants.forEach(function (p) { var im = new Image(); im.src = APP_CONFIG.LOOK_IMAGES ? charStage(p.job_id, Number(p.look_stage || 0), true) : charFallback(p.job_id, true); }); // 첫 샷 전에 공격 그림 미리(G)
        go('dgReady');
      });
    },
    dgStart: function () {
      D.busy = true; render();
      Api.call('roundSync', { round_id: D.round.round_id, start: true }, { read: true }).then(function (res) {
        D.busy = false;
        if (!res.ok) { toast(res.error.message); render(); return; }
        dgApply(res.data.round);
        // 응답 전에 다른 화면으로 나갔으면 끌어오지 않고 뒤에서 진행(홈 배너·레이드 링으로 복귀)
        if (view.name === 'dgReady') dgOpenRound(); else { dgSchedule(); render(); }
      });
    },
    dgSp: function (d, el) {
      el.disabled = true;
      // 같은 엔진으로 적용 홀을 미리 계산해 바로 표시(서버 응답이 오면 서버 값으로 맞춤, v0.5 최적화)
      var guess = null;
      try {
        var gi = Engine.indexAt(M, D.er, now()), greq = (D.er.sp_requests || []).concat([{ slot: 0, atEvent: gi }]);
        var gme = Engine.simulateRound(M, D.er, gi, greq).players[0];
        if (gme.sp_state === 'WAIT' || gme.sp_state === 'RESERVED') guess = { state: gme.sp_state, hole: gme.pending_hole, at_event: gi };
      } catch (e) { guess = null; }
      if (guess) {
        D.spLocal = guess; D.er.sp_requests = greq; D.sim = dgSim(D.shown); render();
        var box0 = root.querySelector('.spwrap'); if (box0) spawn(box0, '<img class="spuse" src="' + asset('fx_sp_use.png') + '" alt="" onerror="this.remove()">', 900);
        toast(guess.state === 'WAIT' ? '특수공격 사용! 이번 홀 피니시에 적용돼요' : '홀 종료 뒤라 ' + guess.hole + 'H 피니시에 적용 예약했어요');
      } else el.textContent = '사용 중…';
      Api.call('spUse', { round_id: D.round.round_id, since_event: D.round.processed }, { read: true }).then(function (res) {
        if (!res.ok) { if (guess) { D.spLocal = null; D.er.sp_requests = greq.slice(0, -1); D.sim = dgSim(D.shown); } toast(res.error.message); render(); return; }
        var x = res.data; dgApply(x.round);
        if (guess) {
          D.spLocal = { state: x.state, hole: x.apply_hole, at_event: x.at_event };
          if (x.apply_hole !== guess.hole) toast('서버 기준으로 ' + x.apply_hole + 'H 피니시에 적용돼요');
          render(); dgSchedule(); return;
        }
        D.spLocal = { state: x.state, hole: x.apply_hole, at_event: x.at_event };
        render();
        var box = root.querySelector('.spwrap'); if (box) spawn(box, '<img class="spuse" src="' + asset('fx_sp_use.png') + '" alt="" onerror="this.remove()">', 900);
        toast(x.state === 'WAIT' ? '특수공격 사용! 이번 홀 피니시에 적용돼요' : '홀 종료 뒤라 ' + x.apply_hole + 'H 피니시에 적용 예약했어요');
        dgSchedule();
      });
    },
    dgNextHole: function (d, el) { el.disabled = true; D.animLast = true; dgSync({ advance: 'next_hole' }); },
    dgParty: function () { D.partyOpen = !D.partyOpen; render(); },
    dgLog: function () { popup = { type: 'dgLog' }; render(); },
    dgLogRow: function (d) { D.logOpen[d.v] = !D.logOpen[d.v]; render(); },
    dgScore: function () { popup = { type: 'dgScore' }; render(); },
    dgScoreMode: function (d) { D.scoreMode = d.v; render(); },
    dgFinish: function (d, el) {
      if (el) { el.disabled = true; el.textContent = '결과 계산 중…'; }
      act('roundFinish', { round_id: D.round.round_id }).then(function (res) {
        if (!res.ok) { toast(res.error.message); render(); return; }
        dgFinished(res.data); go('dgResult');
      });
    },
    dgOpenChests: function () { D.openState = 'closed'; D.opened = null; if (!D.chests.length) { toast('열 상자가 없어요'); return; } go('dgChest'); },
    dgOpen: function () {
      var c = D.chests[0]; D.openState = 'opening'; render();
      var started = Date.now(), loc = chestLocal(c);
      if (loc) { // 상자 내용은 레이드 종료 때 이미 정해져 있으므로 개봉 연출(1.5초) 뒤 바로 보여 주고 서버 확정은 뒤에서
        commit('chestOpen', { chest_id: c.chest_id, item_ids: loc.items.map(function (x) { return x.inv_item_id; }) });
        setTimeout(function () { chestApply(c.chest_id, loc); D.opened = loc; D.openState = 'done'; render(); }, 1500);
        return;
      }
      act('chestOpen', { chest_id: c.chest_id }).then(function (res) {
        var wait = Math.max(0, 1500 - (Date.now() - started));
        setTimeout(function () {
          if (!res.ok) { D.openState = 'closed'; toast(res.error.message); render(); return; }
          var con = res.data.contents; S.wallet = res.data.wallet; addMats(con.materials); addMats(con.special);
          S.items = S.items.concat(res.data.items); S.chests = S.chests.filter(function (x) { return x.chest_id !== c.chest_id; });
          D.opened = res.data; D.openState = 'done'; render();
        }, wait);
      });
    },
    dgNextChest: function () { D.chests.shift(); D.openState = 'closed'; D.opened = null; render(); },
    dgLater: function () { if (D.openState === 'done') D.chests.shift(); D.openState = 'closed'; D.opened = null; go('dgResult'); },
    dgItems: function () { D.chests.shift(); go('items', { tab: 'equip' }); },
    /* DG-07 [제작하러 가기]: 목표 장비, 없으면 방금 받은 특수 재료를 쓰는 대표 직업의 가장 낮은 등급 장비 */
    dgToCraft: function () {
      var got = D.opened ? Object.keys(D.opened.contents.special || {}) : [];
      if (D.openState === 'done') D.chests.shift();
      var id = S.member.goal_item_id;
      if (!id && got.length) {
        var it = M.items.filter(function (x) { var rc = IX.recipe[x.id]; return x.jobId === mainJob() && rc.specialMaterialId && got.indexOf(rc.specialMaterialId) >= 0; })
          .sort(function (a, b) { return a.grade - b.grade || b.cp - a.cp; })[0];
        if (it) id = it.id;
      }
      go('craft', { job: id ? IX.item[id].jobId : mainJob(), filter: 'all' });
      if (id) { popup = { type: 'craftDetail', id: id }; render(); }
    },
    dgBuy: function () { popup = { type: 'dgBuy', state: 'confirm' }; render(); },
    dgBuyGo: function (d) {
      var outcome = d.v;
      if (outcome !== 'cancel') { popup = { type: 'dgBuy', state: 'processing' }; render(); } else { popup = null; render(); }
      act('purchaseMock', { round_id: D.round.round_id, outcome: outcome }).then(function (res) {
        if (!res.ok) { popup = null; toast(res.error.message); render(); return; }
        if (outcome === 'cancel') return;
        if (res.data.status === 'FAIL') { popup = { type: 'dgBuy', state: 'fail' }; render(); return; }
        D.bonusDone = true; S.chests.push(res.data.chest); D.chests.push(res.data.chest); popup = null; toast('1+1 추가 상자 지급 완료'); render();
      });
    },
    dgExit: function () { D.round = null; D.er = null; D.chests = []; go('dungeon'); }
  });
  function dgOpenRound() {
    var r = D.round;
    if (r.status === 'READY') { go('dgReady'); return; }
    D.spLocal = null;
    if (D.coach === null && !(S.tutorial && S.tutorial.raid_coach_seen)) D.coach = 0;
    go('dgRaid'); dgSchedule();
  }
  // 레이드 화면 숨김 영역 3연속 터치 = 남은 홀 즉시 완료
  var _hidden = A.hidden;
  A.hidden = function () {
    if (view.name !== 'dgRaid') return _hidden();
    var t = Date.now(); D.taps = (D.taps || []).filter(function (x) { return t - x < 1800; }); D.taps.push(t);
    if (D.taps.length >= 3 && D.round && !D.round.finished) { D.taps = []; toast('남은 홀을 바로 완료합니다'); D.animLast = true; dgSync({ advance: 'finish' }); }
  };

  // ---------------- 타이머 ----------------
  // 0.25초: 레이드 이벤트 재생 / 1초: 남은 시간·카운터·링 갱신 / 1.6초: 사냥 공격 루프(화면이 보일 때만)
  setInterval(function () { if (S && M) dgTick(); }, 250);
  setInterval(function () {
    if (!S || !M || document.hidden) return;
    if (view.name === 'hunt' && S.hunt) {
      var el = document.getElementById('huntCounter'); if (el) el.innerHTML = huntCounterHtml();
      var btn = root.querySelector('[data-a=claim]'), html = claimButton();
      if (btn && btn.outerHTML !== html) { if (btn.disabled && html.indexOf('disabled') < 0) render(); else btn.outerHTML = html; }
    }
    if (view.name === 'map' && S.hunt) { var hb = root.querySelector('.huntnow'), hh = huntBar(); if (hb && hb.outerHTML !== hh) hb.outerHTML = hh; }
    if (view.name === 'dgRaid' && D.sim) { var nl = document.getElementById('dgNext'); if (nl) nl.innerHTML = nextLabel(); }
    patchRings();
    dgFinishBackground();
  }, 1000);
  setInterval(function () { if (view.name === 'hunt' && !document.hidden && S && S.hunt) huntAttack(); }, 1600);

  // ---------------- 시작 ----------------
  // 서버 깨우기(첫 요청 지연 줄임) + 기준 데이터와 저장 데이터를 동시에 받기(v0.5 최적화)
  Api.warm();
  var saveP = Api.state.token ? Api.call('loadSave', {}, { read: true }) : null;
  fetch(APP_CONFIG.MASTER_URL).then(function (r) { return r.json(); }).then(function (m) {
    M = m; IX = Engine.index(M);
    if (!saveP) { go('login'); return; }
    saveP.then(function (res) {
      if (res.ok) { Api.state.version = res.save_version; setSave(res.data); go('launcher'); dgRestore(); preloadLooks(); } else { popup = null; Api.logout(); go('login'); }
    });
  }, function () { root.innerHTML = '<div class="screen" style="padding:24px"><p>기준 데이터를 불러오지 못했어요. 새로고침해 주세요.</p></div>'; });
})();
