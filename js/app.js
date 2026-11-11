/* 균열의 페어웨이 프로토타입 — 화면 (v1.0)
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
  var queue = Promise.resolve(), pendingWrites = 0, writeSeq = 0, LAST = {};
  var BG = { setMainJob: 1, progress: 1, tutorialStep: 1, setGoal: 1, raidGuideSeen: 1, logEvent: 1 };
  function act(action, payload, opts) {
    if (BG[action]) return Api.call(action, payload, opts);
    pendingWrites++; writeSeq++;
    var run = function () {
      return Api.call(action, payload, opts).then(function (res) {
        if (res.ok && action !== 'missionClaim') missionAt = 0; // 미션 진행이 바뀌었을 수 있음 → 다음 사냥터 화면에서 다시 조회
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
  /* v1.0 B-47: 불러오기 응답이 그 사이 보낸 쓰기보다 늦게 도착하면(옛 상태) 화면을 덮지 않음 → 쓰기가 다 끝난 뒤 한 번 더 불러옴 */
  function reload() {
    var seq = writeSeq;
    return queue.then(function () {
      seq = writeSeq;
      return Api.call('loadSave', {}, { read: true });
    }).then(function (res) {
      if (!res.ok) return res;
      if (seq !== writeSeq || pendingWrites > 0) return reload();
      setSave(res.data); return res;
    });
  }
  function hiddenOn() { return !!(S && S.features && S.features.hidden); }
  function setSave(save) {
    if (S && S.features && !save.features) save.features = S.features;
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
      (hiddenOn() ? '<div class="hidden-zone" data-a="hidden"></div>' : '');
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
        title = '추천 코스 30곳 · 효율 높은 순';
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
        (function () { var e = Engine.huntEfficiency(M, Number(h.cp_at_start || cpOf(j)), c); return '<div class="huntwho"><span>사냥 중 · <b>' + esc(job(j).name) + ' ' + fmt(Number(h.cp_at_start || cpOf(j))) + '</b>' + (j !== mainJob() ? ' <i>(현재 대표: ' + esc(job(mainJob()).name) + ')</i>' : '') + '</span>' + (h.tutorial ? '' : '<span class="eff' + (e < 1 ? ' low' : '') + '">효율 ' + Math.round(e * 100) + '%</span>') + '</div>'; })() +
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
      // v1.0.2 U2: 지금 장착하면 강해지는 장비(빈 칸 포함) → 재료 모으면 강해지는 장비 → 보유·같거나 낮은 장비 순
      list.forEach(function (x) { x.gain = cpGain(x.it.id); x.owned = S.items.some(function (i) { return i.item_id === x.it.id; }); x.rank = x.gain > 0 ? (x.short.length ? 1 : 0) : 2; });
      list.sort(function (a, b) { return a.rank - b.rank || a.short.length - b.short.length || a.it.grade - b.it.grade; });
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
            '<div style="flex:1"><div class="row"><b>' + esc(x.it.name) + (goal === x.it.id ? ' <span class="badge">목표</span>' : '') + (x.owned ? ' <span class="badge own">보유 중</span>' : '') + '</b><span class="' + (x.short.length ? 'lbl-bad' : x.gain > 0 ? 'lbl-ok' : 'lbl-mute') + '" style="font-size:12px">' + (x.short.length ? '재료 부족' : x.gain > 0 ? '업그레이드 가능' : '재제작') + '</span></div>' +
            '<p class="sub">' + GRADE_NAME[x.it.grade] + ' · 장비 전투력 ' + fmt(x.it.cp) + ' · <span class="' + (x.gain > 0 ? 'gainup' : 'gainno') + '">' + (x.gain > 0 ? '장착 시 +' + fmt(x.gain) : x.gain === 0 ? '현재와 동일' : '현재 장비보다 낮음') + '</span></p><p class="small">' + lines.filter(function (l) { return !l.special; }).map(function (l) { return esc(matName(l.id)) + ' ' + l.have + '/' + l.need; }).join(' · ') + ' · 골드 ' + fmt(rc.gold) + '</p>' +
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
        }).join('') : '<p class="sub">보관 중인 상자가 없어요 · 던전 레이드에서 얻을 수 있어요</p>' + (dgActive() ? '<button class="btn purple" data-a="dgResumeRing">진행 중인 레이드로</button>' : '<button class="btn ghost" data-a="tab" data-v="dungeon">던전 레이드 알아보기</button>');
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
        '<button class="btn ghost" data-a="chPractice">3홀 챌린지 연습 다시 하기</button>' +
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
        '<div class="row mynext"><span>' + (d.me.rank === 1 ? '1위를 지키고 있어요!' : (d.me.next_gap ? (d.me.rank - 1) + '위 추월까지 전투력 <b>' + fmt(d.me.next_gap + 1) + '</b> <span class="small">(동점은 먼저 도달한 순)</span>' : (d.me.rank - 1) + '위와 동점 · 전투력 <b>1</b>만 올려도 앞서요')) + '</span><button class="chip gold" data-a="tab" data-v="craft">제작하러 가기</button></div>'
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
      '</span></button>'; // v1.0.2 U3: 랭킹 격차는 랭킹 화면에서
  }
  /** 받을 수 있는 미션 보상 수(완료·미수령). 사냥터 화면이 보일 때 30초마다 뒤에서 갱신 */
  function missionReady() {
    var d = LAST.missions; if (!d || !d.missions) return 0;
    return d.missions.filter(function (x) { return x.done && !x.claimed; }).length;
  }
  var missionAt = 0, claimAt = 0, MCLAIMED = {};
  /** v1.0.3 A1: 화면에서 받은 미션은 서버가 '수령'으로 확정할 때까지 수령 완료로 고정(늦게 온 조회가 '받기'로 되돌리지 않게) */
  function missionsFix(data) {
    if (!data || !data.missions) return data;
    data.missions.forEach(function (m) { if (MCLAIMED[m.mission_id]) { if (m.claimed) delete MCLAIMED[m.mission_id]; else m.claimed = true; } });
    return data;
  }
  function missionRefresh(force) {
    if (!S || (!force && Date.now() - missionAt < 30000) || pendingWrites > 0) return;
    missionAt = Date.now(); var t0 = Date.now();
    Api.call('missions', {}, { read: true }).then(function (res) {
      if (!res.ok || !S || claimAt >= t0) return; // 요청 뒤에 보상을 받았으면 지난 값이므로 버림
      var before = missionReady(); LAST.missions = missionsFix(res.data);
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
    else { var tm = h.tick_minutes * 60000; sub = elapsedLabel(el, h) + ' · 보상 ' + t + '회 · 다음 보상 ' + nextTickLabel(h); }
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
    return e + ' 경과 · 최대 ' + (h.tutorial ? '30초 체험' : M.huntConst.maxHours + '시간');
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
        '<div class="cpcmp"><span>전투력</span><b>' + fmt(cpNow) + '</b><span>→</span><b style="color:' + (gain > 0 ? '#2E8B57' : '#4A5650') + '">' + fmt(cpNow + Math.max(0, gain)) + '</b><span class="small">' + (gain > 0 ? '+' + fmt(gain) : gain === 0 ? '현재와 동일' : '현재 장비보다 낮음') + '</span></div>' +
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
        '<div class="row g' + it.grade + '" style="justify-content:flex-start">' + itemIcon(p.item.item_id) + '<div><b>' + esc(it.name) + '</b><p class="sub">장비 전투력 ' + fmt(p.item.cp) + ' · ' + (function () { var cur = equippedAt(it.jobId, it.partId), g = Number(p.item.cp) - (cur && cur.inv_item_id !== p.item.inv_item_id ? Number(cur.cp) : 0); return g > 0 ? '<b style="color:#2E8B57">장착 시 +' + fmt(g) + '</b>' : g === 0 ? '장착해도 그대로(현재와 동일)' : '현재 장비보다 낮음'; })() + '</p></div></div>' +
        '<button class="btn" data-a="equip" data-v="' + p.item.inv_item_id + '" data-tut="equip">바로 장착</button><button class="btn ghost" data-a="close">닫기</button></div></div>';
    },
    itemDetail: function (p) {
      var x = S.items.filter(function (i) { return i.inv_item_id === p.id; })[0]; if (!x) return '';
      var it = IX.item[x.item_id], cur = equippedAt(it.jobId, it.partId), diff = x.cp - (cur ? cur.cp : 0);
      return '<div class="overlay"><div class="sheet"><div class="row" style="justify-content:flex-start">' + itemIcon(x.item_id) + '<div><b style="font-size:18px">' + esc(it.name) + '</b><p class="sub">' + GRADE_NAME[it.grade] + (x.is_great === 'Y' ? ' · 대성공' : '') + ' · ' + job(it.jobId).name + ' 전용 · 전투력 ' + fmt(x.cp) + '</p></div></div>' +
        (x.equipped_job_id ? '<p class="sub">' + josa(job(it.jobId).name, '이', '가') + ' 장착 중</p><button class="btn ghost" data-a="unequip" data-v="' + x.inv_item_id + '">장착 해제</button>'
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
      var B = Engine.bal(M), ti = targetInfo(D.round && D.round.participants && D.round.participants[0] ? D.round.participants[0].job_id : null);
      var rows = [1, 2, 3, 4, 5].map(function (g) {
        return '<tr><td>' + GRADE_NAME[g] + '</td><td>' + B.chestQty[g] + '개</td><td>' + (B.chestEquipProb[g] * 100).toFixed(1).replace('.0', '') + '%</td><td>' + esc(specialText(Engine.chestSpecialRow(M, g, ti.tg))) + '</td></tr>';
      }).join('');
      var hunt = M.huntTiers.filter(function (t) { return t.specialDropProb > 0; }).map(function (t) { return t.star + '성 ' + (t.specialDropProb * 100).toFixed(3).replace(/0+$/, '') + '%'; }).join(' · ');
      return '<div class="overlay" data-a="overlayClose"><div class="sheet">' + sheetHead('<b>확률 안내</b>') +
        '<p class="sub">상자 재료는 <b>목표 등급</b> 기준: ' + esc(job(ti.job).name) + ' 8부위 중 가장 낮은 등급 + 1 → 지금 <b>' + GRADE_NAME[ti.tg] + '</b>' + (ti.why ? ' (' + esc(ti.why) + ')' : '') + '</p>' +
        '<p class="sub">재료 단계: 목표 등급 70% · 한 단계 아래 30% · 직업 계열 70%</p>' +
        '<div class="sc"><table style="font-size:13px"><tr><th>상자</th><th>재료 수</th><th>완제품</th><th>특수 재료(지금 목표 기준)</th></tr>' + rows + '</table></div>' +
        '<p class="small">재료 수는 난이도·인원 보너스로 늘어날 수 있어요 · 사냥 균열 파편: ' + hunt + ' (5분마다, 효율 적용)</p>' +
        '<p class="small">제작 대성공: 일반·고급 10%, 희귀 8%, 영웅 6%, 전설 5% · SP 배율 1.2~2.0배</p></div></div>';
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
        (open ? '' : '<p class="need">전투력 ' + fmt(sk.unlockCp - cp) + ' 더 올리면 해금 · 해금 시 기준 데미지 <b>' + fmt(Math.round(sk.unlockCp * sk.coef * job(j).dmgCoef)) + '</b> 이상 (전투력 ' + fmt(sk.unlockCp) + ' × ' + sk.coef + ')</p>') + '</div>' +
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
      var d = p.data, GO = { HUNT_START: 'map', HUNT_CLAIM: 'hunt', CRAFT: 'craft', COMPOSE: 'mat', HUNT_MINUTES: 'hunt', RAID_FINISH: 'dungeon', CH3_FINISH: 'ch' };
      var rw = function (r) { return [r.gold ? fmt(r.gold) + 'G' : '', Object.keys(r.materials || {}).map(function (k) { return matName(k) + ' ' + r.materials[k]; }).join(' '), r.tickets ? '3홀 챌린지 이용권 ' + r.tickets + '장' : ''].filter(Boolean).join(' + '); };
      var body = !d ? '<p class="sub">불러오는 중…</p>' : d.missions.slice().sort(function (a, b) { return a.order - b.order; }).map(function (m) {
        var prog = Math.min(m.progress, m.target), all = m.event_type === 'ALL_CLEAR';
        var btn = m.claimed ? '<span class="small">수령 완료</span>' : m.done ? '<button class="chip on" data-a="missionClaim" data-v="' + m.mission_id + '">받기</button>'
          : GO[m.event_type] ? '<button class="chip" data-a="missionGo" data-v="' + GO[m.event_type] + '">' + (m.event_type === 'CH3_FINISH' ? '도전하기' : '바로가기') + '</button>' : '';
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
  /** v1.0.2 F2: 상자 목표 등급과 그 이유(직업 8부위 중 가장 낮은 칸) */
  function targetInfo(jobId) {
    var j = jobId || mainJob(), tg = Engine.targetGrade(M, j, S.items), low = null;
    M.parts.forEach(function (pt) { var e = equippedAt(j, pt.id), g = e ? IX.item[e.item_id].grade : 0; if (!low || g < low.g) low = { g: g, part: pt.id }; });
    var why = !low ? '' : low.g === 0 ? '빈 칸(' + partName(low.part) + ')이 있어서' : '가장 낮은 칸이 ' + GRADE_NAME[low.g] + '(' + partName(low.part) + ')이라서';
    return { tg: tg, why: why, job: j };
  }
  function specialText(row) { if (!row) return '특수 재료 없음'; return matName(row.id) + ' ' + (row.min === row.max ? row.max : row.min + '~' + row.max) + (row.prob < 1 ? ' (' + Math.round(row.prob * 100) + '%)' : ''); }
  /** DG-06 상자 미리보기: 실제 상자 계산(목표 등급·특수 재료 표)과 같은 기준 */
  function chestPreview(g, con, jobId) {
    var ti = targetInfo(jobId), tg = con && con.target_grade ? con.target_grade : ti.tg, row = Engine.chestSpecialRow(M, g, tg);
    return '<p class="small">상자 내용 미리보기 · ' + esc(job(ti.job).name) + ' 기준</p>' +
      '<div class="chestpv"><div><i>기본 재료</i><b>' + GRADE_NAME[tg] + (tg > 1 ? ' 70% · ' + GRADE_NAME[tg - 1] + ' 30%' : '') + '</b><span>' + esc(ti.why ? '목표 ' + GRADE_NAME[tg] + ' · ' + ti.why : '') + '</span></div>' +
      '<div><i>특수 재료</i><b>' + esc(specialText(row)) + '</b></div><div><i>완제품 장비</i><b>' + (Engine.bal(M).chestEquipProb[g] * 100).toFixed(1).replace('.0', '') + '%</b></div></div>';
  }
  function fmtN(n) { n = Number(n || 0); return Math.round(n * 10) % 10 ? n.toFixed(1) : String(Math.round(n)); }
  /** 별 5칸: 채움(노랑) · 반 별 · 빈 별(회색) */
  function starsHtml(v) {
    v = Math.max(0, Math.min(5, Math.round(Number(v || 0) * 2) / 2)); var out = '';
    for (var i = 1; i <= 5; i++) out += '<i class="st ' + (v >= i ? 'f' : v >= i - 0.5 ? 'h' : 'e') + '">★</i>';
    return '<span class="stars" aria-label="' + v + '점">' + out + '</span>';
  }
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
    { sel: '[data-tut=spbtn]', text: ['SP가 100이 되면 특수공격!', '특수공격 자동이 켜져 있으면 준비되면 자동으로 써요 · 피니시 1.2~2배'] }
  ];
  function coachSpec() {
    // GZ-02 첫 진입 안내: ID/PW 로그인 후 골프존앱 메인에서 [게임] 탭으로 모험 시작(인트로를 아직 안 본 회원, v0.5 보완)
    if (view.name === 'launcher') return S && S.member.intro_seen !== 'Y' && !TUT.gameHintOff && !popup
      ? { sel: '.gzm-game', text: ['[게임] 탭을 눌러 보세요!', '균열의 페어웨이의 세계로 모험을 떠나 볼까요?'], face: 'pino_cheer', launch: true } : null;
    if (view.name === 'chPlay') return CHC.practice && CHC.coach !== null && !popup && CHC.phase === 'ready' ? Object.assign({ chp: true }, CH_COACH[CHC.coach]) : null;
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
    if (popup && r && !below) pos = 'top:10px'; // v1.0.3 C16: 팝업 내용(무엇을 만들었는지 등)을 가리지 않게 화면 위쪽에
    var btns = sp.launch ? '<button class="small" data-a="gameHintOff">나중에</button><button class="chip on" data-a="enterGame">게임 탭으로</button>'
      : sp.chp ? '<button class="small" data-a="chCoachEnd">닫기</button><span class="small">' + (CHC.coach + 1) + '/' + CH_COACH.length + '</span><button class="chip on" data-a="chCoachNext">' + (CHC.coach < CH_COACH.length - 1 ? '다음' : '확인') + '</button>'
      : sp.raid ? '<button class="small" data-a="coachClose">닫기</button><button class="chip on" data-a="coachNext">' + (D.coach < RAID_COACH.length - 1 ? '다음' : '확인') + '</button>'
      : sp.replay ? '<button class="small" data-a="tutReplayEnd">닫기</button><span class="small">' + tutCur() + '/6</span><button class="chip on" data-a="tutReplayNext">' + (tutCur() < 6 ? '다음' : '완료') + '</button>'
        : '<button class="small" data-a="tutSkip">건너뛰기</button><span class="small">' + tutLabel() + '</span>' + (sp.go ? '<button class="chip on" data-a="' + sp.go[0] + '">' + sp.go[1] + '</button>' : '') + (sp.ok ? '<button class="chip on" data-a="tutOk">' + sp.ok + '</button>' : '');
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
      var eff0 = Engine.huntEfficiency(M, cpOf(mainJob()), c);
      if (eff0 < 1 && !d.ok && !tutActive()) { // C20: 효율 낮은 코스는 시작 전에 한 번 안내
        popup = { type: 'confirm', title: '효율 ' + Math.round(eff0 * 100) + '% 코스예요', text: '권장 전투력 ' + fmt(IX.tier[c.star].recCp) + ' · 지금은 보상이 ' + Math.round(eff0 * 100) + '%만 쌓여요. 효율 100% 코스에서 더 많이 모을 수 있어요.', yes: '그래도 시작', no: '다른 코스 보기', run: function () { A.pickCourse({ v: d.v, ok: 1 }); } }; render(); return;
      }
      if (S.hunt) {
        if (S.hunt.course_id === c.id) { go('hunt'); return; }
        var t0 = huntTicksSafe(S.hunt), none = t0 === 0;
        popup = { type: 'confirm', title: euro(c.name) + ' 이동할까요?',
          text: none ? '아직 쌓인 보상이 없어요. 지금 사냥을 끝내고 ' + c.name + '에서 새로 시작해요.' : '쌓인 보상을 받고 ' + c.name + '에서 새로 시작해요.',
          yes: none ? '보상 없이 ' + euro(c.name) + ' 이동' : '보상 받고 ' + euro(c.name) + ' 이동', no: '취소',
          run: function () { if (none) cancelHunt(c.id); else claim(false, c.id); } }; render(); return;
      }
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
        LAST.missions = popup.data = missionsFix(res.data); render();
      });
    },
    missionClaim: function (d, el) {
      el.disabled = true; claimAt = Date.now(); MCLAIMED[d.v] = 1;
      var ms = popup && popup.type === 'missions' && popup.data && (popup.data.missions || []).filter(function (x) { return x.mission_id === d.v; })[0];
      if (ms && ms.done && !ms.claimed) { // 보상은 기준 데이터로 정해져 있으므로 바로 반영
        var r0 = ms.reward || {}; ms.claimed = true; ms.claimed_at = new Date(now()).toISOString();
        S.wallet.gold += r0.gold || 0; addMats(r0.materials || {}); if (r0.tickets && S.chances) S.chances.tickets = Math.min(S.chances.ticket_max || 10, (S.chances.tickets || 0) + r0.tickets); render();
        toast('미션 보상 ' + [r0.gold ? fmt(r0.gold) + 'G' : '', Object.keys(r0.materials || {}).map(function (k) { return matName(k) + ' ' + r0.materials[k]; }).join(' '), r0.tickets ? '이용권 ' + r0.tickets + '장' : ''].filter(Boolean).join(' + '));
        commit('missionClaim', { mission_id: d.v }, function (data) { claimAt = Date.now(); if (data.chances) S.chances = data.chances; LAST.missions = missionsFix(data.missions); if (popup && popup.type === 'missions') { popup.data = LAST.missions; render(); } });
        return;
      }
      act('missionClaim', { mission_id: d.v }).then(function (res) {
        if (!res.ok) { toast(res.error.message); render(); return; }
        S.wallet = res.data.wallet; if (res.data.materials) S.materials = res.data.materials; if (res.data.chances) S.chances = res.data.chances;
        if (popup && popup.type === 'missions') popup.data = res.data.missions;
        render();
        var r = res.data.reward; toast('미션 보상 ' + [r.gold ? fmt(r.gold) + 'G' : '', Object.keys(r.materials || {}).map(function (k) { return matName(k) + ' ' + r.materials[k]; }).join(' '), r.tickets ? '이용권 ' + r.tickets + '장' : ''].filter(Boolean).join(' + '));
      });
    },
    missionGo: function (d) {
      popup = null;
      if (d.v === 'ch') { A.chOpen(); return; }
      if (d.v === 'mat') go('items', { tab: 'mat' }); else if (d.v === 'hunt') go(S.hunt ? 'hunt' : 'map'); else go(d.v);
    },
    rank: function () {
      go('rank', { data: rankAt ? LAST.rank || null : null }); // A7: 장착·대표 변경 뒤(rankAt=0)에는 지난 값을 보여 주지 않고 새로 받음
      rankAt = Date.now();
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
      S.items.forEach(function (i) { if (i.inv_item_id === d.v) i.equipped_job_id = ''; }); popup = null; rankAt = 0; render();
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
      S.member.main_job_id = d.v; rankAt = 0; render();
      act('setMainJob', { job_id: d.v }).then(function (res) { if (res.ok) toast(josa(job(d.v).name, '을', '를') + ' 대표 캐릭터로 설정했어요' + (S.hunt && S.hunt.job_id && S.hunt.job_id !== d.v ? ' · 진행 중인 사냥은 ' + euro(job(S.hunt.job_id).name) + ' 계속돼요' : '')); });
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
      '<p class="small">○○ 등급 이상 4부위 = 그 등급 외형 · 6세트 = 발밑 문양 · 8세트 = 오라 기둥(외형 연출). 랭킹·레이드에서 다른 골퍼에게 이 모습이 보여요</p></div>';
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
  /** 보상 없이 종료(+이동). v1.0.2 F1: 종료 요청을 먼저 줄 세운 뒤 새 사냥 시작(순서가 바뀌면 새 사냥이 서버에서 거절돼 사라짐) */
  function cancelHunt(thenCourse) {
    S.hunt = null; commit('huntClaim', { cancel: true });
    if (thenCourse) startHunt(thenCourse); else go('map');
  }
  function huntTicksSafe(h) { return h && h.seed && !h.pending ? Engine.huntTicks(M, Date.parse(h.started_at), now(), h.tutorial) : null; }
  function nextTickLabel(h) {
    var per = (h.tick_minutes || M.huntConst.tickMinutes) * 60000, el = Math.max(0, now() - Date.parse(h.started_at)), left = per - (el % per);
    return Math.floor(left / 60000) + ':' + ('0' + Math.floor(left % 60000 / 1000)).slice(-2);
  }
  function claim(skip, thenCourse) {
    var h = S.hunt; if (!h) return;
    var noTicks = function () {
      if (thenCourse) { cancelHunt(thenCourse); return; } // v1.0.2: 이동은 이미 확인함 → 두 번째 확인창 없이 이동
      popup = { type: 'confirm', title: '보상 없이 종료할까요?', text: h.tutorial ? '체험 보상은 시작 30초 뒤에 쌓여요.' : '아직 쌓인 보상이 없어요(5분마다 계산).', yes: '보상 없이 종료', no: '계속 사냥', run: function () {
        cancelHunt(null);
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
      // v1.0: 수령 요청을 먼저 줄 세운 뒤 화면 반영(이동·계속 사냥의 huntStart가 수령보다 먼저 가지 않게)
      var after = function () {};
      commit('huntClaim', payload, function (data) { after(data); });
      apply(local);
      after = (function (data) {
        // 경계 시각에 틱 수가 달라졌으면 서버 값으로 다시 맞춤
        if (data.reward.ticks !== local.reward.ticks || data.reward.gold !== local.reward.gold) {
          reload().then(function () { if (popup && popup.type === 'huntResult' && popup.res === local) popup.res = data; render(); });
        }
      });
      return;
    }
    act('huntClaim', payload).then(function (res) {
      if (S.hunt !== h) return; // v1.0.3 A4: 그 사이 사냥이 바뀌었으면 늦은 응답 무시
      if (!res.ok && res.error.code === 'NO_TICKS') { if (thenCourse && thenCourse === h.course_id) { toast('아직 받을 보상이 없어요 · 사냥은 계속돼요'); return; } noTicks(); return; }
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
      setTimeout(function () { missionRefresh(true); rankRefresh(1); }, 300); // v1.0.3 B12: 미션·랭킹 미리 받기
    });
  });
  // 인트로: 컷 등장·진행 점·마지막 컷에서만 [모험 시작]
  root.addEventListener('scroll', function (e) {
    if (e.target.matches && e.target.matches('[data-scroll="intro"]') && e.target.querySelector('.mcut')) { introScroll(e.target); return; }
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
      // v1.0.2 A: 클럽은 왼쪽, 이번 샷 데이터는 가운데 크게(이 샷 데이터로 공격한다는 것을 보여 줌)
      '<div class="shotbody"><div class="clubcol"><div class="clubic">' + img('icon_club_' + CLUB_FILE[s.club] + '.png') + '</div><b>' + esc(s.club_name) + '</b>' + (s.holeout ? '<em>홀아웃!</em>' : '') + '</div>' +
      '<div class="metrics big">' + m.map(function (x) { return '<span><i>' + x[0] + '</i><b>' + x[1] + '</b></span>'; }).join('') + '</div></div></div>' +
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
    else if (st.state === 'WAIT') label = (st.hole || (D.sim && D.sim.position.hole) || '') + 'H 피니시 적용 대기'; // A6: 홀 번호로 표시
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
    return '<span class="nl">' + (ev.type === 'SHOT' ? '다음 샷 · ' + esc(nickOf(ev.slot)) : '홀 스코어') + '</span><b class="nt">' + left + '초</b>';
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
        mine + '<div class="dgmore">' +
        '<div class="dghero"><img src="' + asset('boss_riftlord_idle.png') + '" alt="" onerror="this.remove()"><div><h2 class="title">스크린 라운드가 곧 던전 레이드</h2><p>스크린로그인 후 GS에서 플레이하면 던전 레이드가 함께 진행돼요.</p></div></div>' +
        '<div class="gsdata"><b class="small">GS 연동 데이터</b><div class="chips wrap">' + ['코스 난이도', '라운드 설정', '개인 설정', '샷데이터', '홀 스코어'].map(chip).join('') + '</div></div>' +
        '<div class="flow">' + steps.map(function (s, i) {
          return '<div class="fstep reveal"><i class="fno">' + '①②③④'[i] + '</i><div><b>' + s[0] + '</b><p class="sub">' + s[1] + '</p>' + s[2] + '</div></div>';
        }).join('') + '</div>' +
        '<div class="card entry"><b>입장 방법</b><p class="sub">레이드 입장은 골프존앱 메인 상단 [스크린로그인]에서</p>' +
        '<div class="miniapp"><div class="mock"><i class="m1"></i><i class="m2"></i><i class="m3"></i><i class="m4"></i></div>' +
        '<img src="' + asset('mini_app_main.png') + '" alt="골프존앱 메인 화면" onerror="this.remove()"><i class="pulse"></i></div></div></div>');
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
      // v1.0.2 B: 코스·그린 난이도 별(골프존 스크린 표기, 0.5 = 반 별) · 라운드 설정 4개 같은 굵기 · 점수 내역 + 데이터 기반 결론
      var sc = r.score || { course: null, room: null, personal: null, total: r.diff_score };
      var flow = [
        ['GS 코스', esc(r.course.name) + (reg ? ' <span class="reg">' + esc(reg.name) + '</span>' : ''),
          r.course.course_diff !== undefined ? '<span class="diffstars"><span class="ds">코스 ' + starsHtml(r.course.course_diff / 2) + '</span><span class="ds">그린 ' + starsHtml(r.course.green_diff / 2) + '</span></span>' : ''],
        ['라운드 설정', '<span class="rsets">' + Object.keys(rs).map(function (k) { return '<span><i>' + esc(k) + '</i><em>' + esc(rs[k]) + '</em></span>'; }).join('') + '</span>', ''],
        ['난이도 점수', '<span class="scoresum">' + (sc.course !== null ? '<span><i>GS 코스</i><em>' + fmtN(sc.course) + '점</em></span><span><i>+ 라운드 설정</i><em>' + fmtN(sc.room) + '점</em></span><span><i>+ 개인 설정</i><em>' + fmtN(sc.personal) + '점</em></span><span class="tot"><i>= 총점</i><em>' + fmtN(sc.total) + '점</em></span>' : '<span class="tot"><i>총점</i><em>' + fmtN(sc.total) + '점</em></span>') + '</span>',
          '<b class="verdict"><span>난이도 ' + esc(r.zone) + ' 확정</span><span>' + esc(zone.bossRank) + ' 등급 보스 출현!</span></b>'],
        ['지역 보스', esc(r.boss.name), reg ? esc(reg.name) + ' 지역' : ''],
        ['보스 HP', fmt(r.boss.hp_max), '최고 보상 ' + GRADE_NAME[zone.maxRewardGrade] + ' 상자']
      ];
      return dgScreen('<div class="row"><b style="font-size:20px">레이드 준비</b><span class="simbadge">시뮬레이션</span></div>' +
        '<div class="bossbox"><img src="' + bossImg(r.boss.id) + '" alt="" onerror="this.remove()"><div class="bossname">' + esc(r.boss.name) + '</div></div>' +
        '<p class="sub" style="text-align:center">"' + esc(r.boss.line) + '"</p>' +
        '<ol class="gsflow">' + flow.map(function (f, i) { return '<li style="animation-delay:' + (i * 0.45) + 's"><span class="k">' + f[0] + '</span>' + (i === 1 || i === 2 ? '<div class="fv">' + f[1] + '</div>' : '<b>' + f[1] + '</b>') + (f[2] ? '<span class="small">' + f[2] + '</span>' : '') + '</li>'; }).join('') + '</ol>' +
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
      var body = '<b style="font-size:20px">라운드 결과</b>' +
        '<div class="card"><div class="row"><b style="color:' + (x.killed_at ? 'var(--ok)' : 'var(--bad)') + '">' + (x.killed_at ? '보스 처치 · ' + x.killed_at + 'H' : '보스 생존') + '</b><span>' + esc(r ? r.boss.name : '') + '</span></div>' +
        '<p class="sub">파티 피해 ' + fmt(ps.reduce(function (a, p) { return a + Math.round(p.damage); }, 0)) + ' · 데미지 비율 ' + Math.round(x.ratio * 100) + '%</p>' +
        '<div class="stack"><i class="s1" style="width:' + (shotSum / tot * 100) + '%"></i><i class="s2" style="width:' + (holeSum / tot * 100) + '%"></i></div>' +
        '<div class="row small"><span><i class="lg s1"></i>샷 공격 ' + Math.round(shotSum / tot * 100) + '%</span><span><i class="lg s2"></i>홀 종료 공격 ' + Math.round(holeSum / tot * 100) + '%</span></div></div>' +
        '<div class="card"><b>기여 순위</b>' + ps.sort(function (a, b) { return b.damage - a.damage; }).map(function (p, i) {
          var pp = r && r.participants[p.slot];
          return '<div class="crow"><b class="rno">' + (i + 1) + '</b>' + (pp ? charPic(pp.job_id, { stage: Number(pp.look_stage || 0), set: Number(pp.set_tier || 0) }, 'idle', 'mini') : '') + '<span style="flex:1">' + esc(r ? nickOf(p.slot) : '#' + p.slot) + (p.slot === 0 ? ' (나)' : '') + '</span><span class="small">' + fmt(p.damage) + ' · ' + Math.round(p.damage / tot * 100) + '%</span>' +
            '<div class="stack thin"><i class="s1" style="width:' + (p.shot_damage / tot * 100) + '%"></i><i class="s2" style="width:' + (p.hole_damage / tot * 100) + '%"></i></div></div>';
        }).join('') + '</div>' +
        '<div class="card g' + g + '" style="border:2px solid var(--gc)"><div class="row" style="justify-content:flex-start"><img class="chesticon" src="' + asset('chest_' + g + '_closed.png') + '" alt="" onerror="this.remove()"><div><b class="gname" style="font-size:18px">' + esc(x.grade_name) + ' 상자 1개</b>' +
        '<p class="sub">' + (x.capped ? '데미지 비율로는 ' + esc(x.grade_by_ratio) + '이지만 난이도 ' + x.zone + ' 구간 최고 등급이 적용됐어요' : '데미지 비율 ' + Math.round(x.ratio * 100) + '%로 결정') + '</p></div></div>' +
        chestPreview(g, x.contents, r && r.participants[0] && r.participants[0].job_id) + '</div>' +
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
        '<p class="small"><i class="lg s1"></i>샷 공격 <i class="lg s2"></i>홀 마무리 공격 · 줄을 누르면 계산 과정을 볼 수 있어요</p>' +
        (html || '<p class="sub">아직 이벤트가 없어요</p>') + '</div></div>';
    },
    /* DG-05 스코어카드: 피해 보기 = 샷 피해 + 홀 종료 공격 = 합계, 이월 표시 */
    dgScore: function () {
      var r = D.round, sim = D.sim, mode = D.scoreMode, holes = sim ? sim.holes : [];
      var cell = function (slot, h) {
        var H = holes[h - 1], x = H && H.players[slot];
        if (!x) return '<td class="small">·</td>';
        if (mode === 'golf') { var d = x.strokes - H.par; return '<td style="color:' + (d < 0 ? '#2D6FE0' : d > 0 ? '#D64545' : '#1B2620') + '">' + (d > 0 ? '+' + d : d) + '</td>'; }
        var rs0 = Math.round(x.shot_damage), re0 = Math.round(x.E); // C27: 칸 합계 = 표시한 두 값의 합
        return '<td class="dcell"><b>' + fmt(rs0 + re0) + '</b><span>' + fmt(rs0) + '+' + fmt(re0) + '</span></td>';
      };
      var tot = function (slot) {
        var xs = holes.map(function (H) { return { x: H.players[slot], par: H.par }; });
        if (mode === 'golf') { var d = xs.reduce(function (a, y) { return a + y.x.strokes - y.par; }, 0); return d > 0 ? '+' + d : String(d); }
        return fmt(holes.reduce(function (a, H) { var x = H.players[slot]; return a + Math.round(x.shot_damage) + Math.round(x.E); }, 0));
      };
      var hs = []; for (var h = 1; h <= 18; h++) hs.push(h);
      return '<div class="overlay" data-a="overlayClose"><div class="sheet">' + sheetHead('<b>스코어카드</b>', '<div class="chips"><button class="chip' + (mode === 'golf' ? ' on' : '') + '" data-a="dgScoreMode" data-v="golf">골프 점수</button><button class="chip' + (mode === 'dmg' ? ' on' : '') + '" data-a="dgScoreMode" data-v="dmg">파티 피해</button></div>') +
        '<div class="sc"><table><tr><th class="fix">이름</th>' + hs.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '<th>합계</th></tr>' +
        '<tr><th class="fix small">PAR</th>' + hs.map(function (h) { return '<td class="small">' + r.course.par[h - 1] + '</td>'; }).join('') + '<td></td></tr>' +
        r.participants.map(function (p) { return '<tr><th class="fix">' + esc(p.nickname) + '</th>' + hs.map(function (h) { return cell(p.slot, h); }).join('') + '<td><b>' + tot(p.slot) + '</b></td></tr>'; }).join('') +
        '</table></div><p class="small">' + (mode === 'dmg' ? '칸 = 합계 / 샷 공격 + 홀 마무리 공격' : '이름 열 고정, 옆으로 밀어서 보기') + ' · 파티 피해 합계 ' + fmt(sim ? holes.reduce(function (a, H) { return a + H.players.reduce(function (b, x) { return b + Math.round(x.shot_damage) + Math.round(x.E); }, 0); }, 0) : 0) + '</p></div></div>';
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
          if (D.code === '111111') { D.fails = 0; D.guests = []; D.job = mainJob(); toast('스크린로그인 완료'); go('dgLobby'); }
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
      if (D.busy) return; D.busy = true;
      // v1.0.3 B11: 누르는 즉시 플레이 화면(시작 시각은 서버 응답으로 맞춤)
      dgApply(Object.assign({}, D.round, { status: 'ACTIVE', started_at: new Date(now()).toISOString(), processed: 0 }));
      dgOpenRound();
      Api.call('roundSync', { round_id: D.round.round_id, start: true }, { read: true }).then(function (res) {
        D.busy = false;
        if (!res.ok) { toast(res.error.message); return; }
        dgApply(res.data.round);
        if (view.name === 'dgRaid') render(); else dgSchedule();
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
        toast(guess.state === 'WAIT' ? '특수공격 사용! ' + guess.hole + 'H 피니시에 적용돼요' : '홀 종료 뒤라 ' + guess.hole + 'H 피니시에 적용 예약했어요');
      } else el.textContent = '사용 중…';
      Api.call('spUse', { round_id: D.round.round_id, since_event: D.round.processed }, { read: true }).then(function (res) {
        if (!res.ok) { if (guess) { D.spLocal = null; D.er.sp_requests = greq.slice(0, -1); D.sim = dgSim(D.shown); } toast(res.error.message); render(); return; }
        var x = res.data; dgApply(x.round);
        if (guess) {
          D.spLocal = { state: x.state, hole: x.apply_hole, at_event: x.at_event };
          if (x.apply_hole !== guess.hole) toast('홀이 넘어가 ' + x.apply_hole + 'H 피니시에 적용돼요(SP는 1번만 사용)');
          render(); dgSchedule(); return;
        }
        D.spLocal = { state: x.state, hole: x.apply_hole, at_event: x.at_event };
        render();
        var box = root.querySelector('.spwrap'); if (box) spawn(box, '<img class="spuse" src="' + asset('fx_sp_use.png') + '" alt="" onerror="this.remove()">', 900);
        toast(x.state === 'WAIT' ? '특수공격 사용! ' + x.apply_hole + 'H 피니시에 적용돼요' : '홀 종료 뒤라 ' + x.apply_hole + 'H 피니시에 적용 예약했어요');
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
    if (D.coach === null && !(S.tutorial && (S.tutorial.raid_coach_seen || S.tutorial.tutorial_raid_at))) D.coach = 0; // v1.0.2 U5: 던전 체험에서 배운 사람은 생략
    go('dgRaid'); dgSchedule();
  }
  // 레이드 화면 숨김 영역 3연속 터치 = 남은 홀 즉시 완료
  var _hidden = A.hidden;
  A.hidden = function () {
    if (!hiddenOn()) return; // v1.0: 회원DB '숨김 기능' Y 계정만(로그인 때 확정)
    if (view.name !== 'dgRaid') return _hidden();
    var t = Date.now(); D.taps = (D.taps || []).filter(function (x) { return t - x < 1800; }); D.taps.push(t);
    if (D.taps.length >= 3 && D.round && !D.round.finished) { D.taps = []; toast('남은 홀을 바로 완료합니다'); D.animLast = true; dgSync({ advance: 'finish' }); }
  };

  // ================= v1.0 =================
  // 온보딩(대표 캐릭터 선택 → 직업 지역 사냥 → 무기 → 던전 체험 → 3부위 → 외형 진화), 오늘 할 일, 업그레이드 배지,
  // 사냥 가득 알림·PUSH 미리보기, 기여 배지·SP 자동 사용, 미션 한 번에 받기, 퍼널 로그
  var BAL = null;
  function bal10() { return BAL || (BAL = Engine.bal(M)); }
  function v10() { return !!(S && S.tutorial && S.tutorial.flow === 'V10'); }
  // GPT v1.0 이미지(튜토리얼 보스·시작 배너·피노 포즈·기여 배지)는 도착 전까지 기존 그림으로 대신(404 방지)
  function v10a(name, fb) { return asset(APP_CONFIG.V10_IMAGES ? name : fb); }
  function needJob() { return v10() && !S.tutorial.job_chosen_at; }
  function tregion(j) { return bal10().tutorialRegion[j || mainJob()]; }
  function famOfJob(j) { return job(j).armorFamily || 'IRON'; }
  var FEV = {};
  function euro(w) { var c = String(w).charCodeAt(String(w).length - 1) - 0xAC00, b = c >= 0 && c <= 11171 ? c % 28 : 0; return w + (b && b !== 8 ? '으로' : '로'); }
  /** 퍼널 이벤트(같은 접속에서 1회) → L_GAME_LOG → 기획 시트 FUNNEL 탭 */
  function fev(name, extra) { if (FEV[name]) return; FEV[name] = 1; act('logEvent', Object.assign({ event_type: name }, extra || {})); }

  /** 던전 체험 뒤 3부위: 아직 일반 이상을 장착하지 않은 첫 부위 */
  function tutMissingPart() {
    var j = mainJob();
    return bal10().tutorialParts.filter(function (pt) { return !equippedAt(j, pt); })[0] || null;
  }
  function tutTargetItem(part) {
    return M.items.filter(function (it) { return it.jobId === mainJob() && it.partId === part && it.grade === 1; })[0];
  }
  function tutPhase6() {
    if (!S.tutorial.tutorial_raid_at) return 'raid';
    if (lookOf(mainJob()).stage >= 1) return 'done';
    return 'craft';
  }

  /* ---- 대표 캐릭터 선택(GM-00b) ---- */
  SCREENS.jobSelect = function (p) {
    var j = p.sel || 'WAR', jb = job(j), B = bal10(), reg = IX.region[B.tutorialRegion[j]], fam = famOfJob(j);
    var skills = M.skills.filter(function (s) { return s.jobId === j; }).sort(function (a, b) { return a.stage - b.stage; });
    var AT = { PHYS: '물리', MAGIC: '마법', MIXED: '물리+마법' };
    var parts = ['WEAPON', 'HELM', 'ARMOR', 'GLOVES'].map(function (pt) { var it = M.items.filter(function (x) { return x.jobId === j && x.partId === pt && x.grade === 1; })[0]; return it ? itemIcon(it.id) : ''; }).join('');
    return '<div class="screen jobsel"' + (APP_CONFIG.V10_IMAGES ? ' style="background-image:linear-gradient(#0B0716D9,#0B071699 18%,#13251CF2 50%),url(' + asset('bg_job_select.png') + ')"' : '') + '><div class="scroll">' +
      '<div class="coachhead">' + face('pino_cheer') + '<div><b style="font-size:19px">대표 캐릭터를 골라요</b><p class="sub">대표 캐릭터로 사냥하고, 레이드에서 공격해요. 나머지 3명도 나중에 함께 키울 수 있어요.</p></div></div>' +
      '<div class="jobtabs">' + JOBS.map(function (x) {
        return '<button class="jobtab' + (x === j ? ' on' : '') + '" data-a="jobPick" data-v="' + x + '">' + charPic(x, { stage: 0, set: 0 }, 'idle', 'mini') + '<b>' + esc(job(x).name) + '</b><span>' + esc(job(x).role) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="card jobcard" data-tut="jobcard">' +
      '<div class="row"><b style="font-size:20px">' + esc(jb.name) + '</b><span class="badge">' + esc(jb.role) + ' · ' + (AT[jb.attackType] || '') + '</span></div>' +
      '<p class="sub">' + esc(jb.concept) + ' · 무기 ' + esc(jb.weapon) + '</p>' +
      '<b class="small">외형 성장</b><div class="looksteps">' + [0, 1, 2, 3, 4, 5].map(function (s) { return '<div>' + charPic(j, { stage: s, set: 0 }, 'idle', 'mini') + '<span style="color:' + LOOK_COLOR[s] + '">' + LOOK_NAME[s] + '</span></div>'; }).join('') + '</div>' +
      '<p class="small">같은 등급 이상 장비 4부위를 갖추면 외형이 바뀌어요 · 주재료 ' + FAM_NAME[fam] + ' · 첫 사냥터 ' + esc(reg.name) + '</p>' +
      '<div class="jobmore">' +
      '<b class="small">주재료 · 첫 사냥터</b><div class="row" style="justify-content:flex-start;gap:10px">' + matIcon('MAT-' + fam + '-1') +
      '<div><b>' + FAM_NAME[fam] + ' 계열</b><p class="small">' + esc(reg.name) + ' 사냥터에서 많이 나와요 · 지역마다 나오는 재료가 달라요</p></div></div>' +
      '<b class="small">장비</b><div class="row" style="justify-content:flex-start;gap:8px">' + parts + '<span class="small">외 4부위</span></div>' +
      '<b class="small">스킬 (전투력이 오르면 해금)</b><div class="skillmini">' + skills.map(function (s) { return '<div><i>' + s.stage + '</i><b>' + esc(s.name) + '</b><span>×' + s.coef + (s.unlockCp > 100 ? ' · ' + fmt(s.unlockCp) : '') + '</span></div>'; }).join('') + '</div>' +
      '<p class="small rolefx">역할 · ' + esc(jb.roleEffect) + '</p></div></div>' +
      '</div><div class="dgfoot"><button class="btn purple" data-a="jobChoose" data-v="' + j + '"' + (p.busy ? ' disabled' : '') + '>' + (p.busy ? '준비 중…' : esc(euro(jb.name)) + ' 시작') + '</button>' +
      '<p class="small" style="text-align:center">시작 재료는 한 번만 받아요 · 대표 캐릭터는 캐릭터 탭에서 바꿀 수 있어요</p></div></div>';
  };
  A.jobPick = function (d) { view.p.sel = d.v; render(); };
  A.jobChoose = function (d) {
    if (view.p.busy) return; view.p.busy = true;
    // v1.0.3 B9: 시작 재료는 정해진 값 → 화면 먼저 반영, 서버 확정은 뒤에서
    var first = !S.tutorial.job_chosen_at;
    S.member.main_job_id = d.v; if (first) { addMats(bal10().starter[d.v] || {}); S.tutorial.job_chosen_at = new Date(now()).toISOString(); }
    fev('fn_job_' + d.v); tutDone(1); popup = null;
    toast(first ? job(d.v).name + ' 시작 재료를 받았어요' : josa(job(d.v).name, '을', '를') + ' 대표로 정했어요');
    go('map');
    act('chooseJob', { job_id: d.v }).then(function (res) {
      if (!res.ok) { toast(res.error.message); reload().then(render); return; }
      if (pendingWrites === 0 && res.data.materials) S.materials = res.data.materials;
      Object.assign(S.tutorial, res.data.tutorial || {}, { step: S.tutorial.step, done: S.tutorial.done });
    });
  };

  /* ---- 인트로·게임 진입: 대표 캐릭터를 아직 안 골랐으면 선택 화면 ---- */
  var _introDone = A.introDone, _enterGame = A.enterGame;
  A.introDone = function () {
    if (needJob()) { var first = S.member.intro_seen !== 'Y'; S.member.intro_seen = 'Y'; if (first) act('progress', { intro_seen: true }); go('jobSelect', { sel: mainJob() }); return; }
    _introDone();
  };
  A.enterGame = function () {
    fev('fn_game_enter');
    if (S.member.intro_seen === 'Y' && needJob()) { go('jobSelect', { sel: mainJob() }); return; }
    _enterGame();
  };

  /* ---- 튜토리얼 v1.0 안내 ---- */
  var _tutHome = tutHome, _tutSpec = tutSpec;
  tutHome = function (st) {
    if (!v10()) return _tutHome(st);
    if (st === 6) return tutPhase6() === 'raid' ? 'dungeon' : 'craft';
    return _tutHome(st === 1 ? 2 : st);
  };
  tutSpec = function () {
    if (!v10() || TUT.replay) return _tutSpec();
    var st = tutCur(), v = view.name, pp = popup && popup.type, j = mainJob(), treg = tregion(j), fam = FAM_NAME[famOfJob(j)];
    if (pp && ['huntResult', 'craftDetail', 'crafted', 'slotPick', 'tutChest'].indexOf(pp) < 0) return null;
    if (st <= 3) {
      if (st === 3 && (v === 'hunt' || S.hunt)) return _tutSpec();
      if (v === 'courses' && view.p.region === treg) return { sel: '[data-tut=course]', text: ['1성 코스에서 첫 사냥을 시작해요', '첫 사냥은 30초 체험이에요'] };
      if (v === 'map') return { sel: '[data-tut=jobregion]', text: [IX.region[treg].name + ' 사냥터에서 ' + fam + ' 재료가 많이 나와요', job(j).name + ' 장비의 주재료예요 · 지역을 눌러요'] };
      return TAB('map', '사냥터 탭에서 ' + IX.region[treg].name + ' 지역으로 가요');
    }
    if (st === 4 && v === 'craft' && !pp) return { sel: '[data-tut=craftWeapon]', text: ['받은 재료로 ' + job(j).name + ' 무기를 만들어요', '제작 전후 전투력을 미리 볼 수 있어요'] };
    if (st < 6) return _tutSpec();
    var ph = tutPhase6();
    if (ph === 'raid') {
      if (v === 'dungeon') return { sel: '[data-tut=tutRaid]', text: ['던전 레이드를 미리 체험해요', '튜토리얼 보스를 3홀 만에 쓰러뜨려 봐요'], face: 'pino_surprise' };
      return TAB('dungeon', '던전 탭에서 레이드를 체험해요');
    }
    if (ph === 'craft') {
      var part = tutMissingPart(), it = part && tutTargetItem(part);
      var have = 4 - (part ? bal10().tutorialParts.filter(function (x) { return !equippedAt(j, x); }).length : 0) - (equippedAt(j, 'WEAPON') ? 0 : 1);
      if (!part || !it) return null;
      var spare = S.items.filter(function (x) { return x.item_id === it.id && !x.equipped_job_id; })[0];
      if (pp === 'tutChest') return null; // 상자 팝업이 직접 안내
      if (pp === 'crafted') return { sel: '[data-tut=equip]', text: ['바로 장착해요', '4부위 중 ' + have + '부위 완료'] };
      if (pp === 'slotPick') return { sel: '[data-tut=pickEquip]', text: ['만든 장비를 골라 장착해요'] };
      if (pp === 'craftDetail') return { sel: '[data-tut=doCraft]', text: ['[제작]을 눌러요', partName(part) + ' · 4부위 중 ' + have + '부위 완료'] };
      if (spare && v === 'char') return { sel: '[data-tut=slot-' + part + ']', text: [partName(part) + ' 칸을 눌러 장착해요'] };
      if (v === 'craft') return { sel: '[data-tut=craftNext]', text: [josa(partName(part), '을', '를') + ' 만들어요', '무기 포함 4부위 = 외형 진화 · 지금 ' + have + '/4'], face: APP_CONFIG.V10_IMAGES ? 'pino_craft' : 'pino' };
      return { sel: '[data-a=tab][data-v=craft]', text: ['다음은 ' + josa(partName(part), '을', '를') + ' 만들어요', '첫 외형까지 ' + have + '/4'], go: ['tutCraftGo', '다음 장비 만들기'] };
    }
    return null;
  };
  var _coachSpec = coachSpec;
  coachSpec = function () { var sp = _coachSpec(); if (!sp && v10() && view.name === 'dungeon' && tutActive() && !popup) return tutSpec(); return sp; };
  // 6단계 완료 = 외형 진화(4부위). 진화 팝업을 본 뒤 완료 처리
  var _afterRender = afterRender;
  afterRender = function () {
    _afterRender();
    var ok6 = function () { return v10() && tutActive() && !TUT.replay && tutCur() === 6 && !popup && tutPhase6() === 'done'; };
    if (ok6()) setTimeout(function () { if (ok6()) { tutDone(6); render(); } }, 0); // 장착 직후 진화 팝업이 먼저 뜨도록 한 박자 뒤
  };
  // 제작 탭: 6단계는 대표 직업·부족 부위로 바로
  var _tab = A.tab;
  A.tab = function (d) {
    if (d.v === 'craft' && v10() && tutActive() && !TUT.replay && tutCur() === 6 && tutPhase6() === 'craft' && tutMissingPart()) { go('craft', { job: mainJob(), part: tutMissingPart() }); return; }
    _tab(d);
  };

  /* ---- 지도: 지역 핀에 주재료 표시 + 직업 지역 하이라이트 ---- */
  var _map = SCREENS.map;
  SCREENS.map = function (p) {
    var html = _map(p), treg = tregion(mainJob());
    M.regions.forEach(function (r) {
      var key = 'data-a="region" data-v="' + r.id + '">';
      var fam = r.mainFamily, tag = FAM_NAME[fam] ? '<span class="pfam f' + fam + '">' + img('icon_mat_' + fam.toLowerCase() + '_1.png') + FAM_NAME[fam] + '</span>' : '<span class="pfam">전 계열</span>';
      html = html.replace(key, 'data-a="region" data-v="' + r.id + '"' + (r.id === treg ? ' data-tut="jobregion"' : '') + '>' + tag);
    });
    return html.replace('<div class="row" style="gap:8px">', todayCard() + '<div class="row" style="gap:8px">');
  };

  /* ---- 제작: 6단계 대상 장비 표시 ---- */
  var _craft = SCREENS.craft;
  SCREENS.craft = function (p) {
    var html = _craft(p);
    if (v10() && tutActive() && tutCur() === 6 && tutPhase6() === 'craft') {
      var it = tutTargetItem(tutMissingPart()); if (it) html = html.replace('style="text-align:left" data-a="craftDetail" data-v="' + it.id + '"', 'style="text-align:left" data-a="craftDetail" data-v="' + it.id + '" data-tut="craftNext"');
    }
    return html;
  };

  /* ---- 오늘 할 일(B-51): 사냥 → 제작 → 레이드·상자 → 미션 ---- */
  function upgradeCount() {
    var n = 0, seen = {};
    M.items.forEach(function (it) {
      if (it.jobId !== mainJob() || seen[it.jobId + it.partId]) return; // 대표 캐릭터 기준(4직업 전체는 배지가 과하게 커짐)
      if (cpGain(it.id) > 0 && !Engine.craftShortage(M, it.id, S.wallet, S.materials).length) { seen[it.jobId + it.partId] = 1; n++; }
    });
    return n;
  }
  function equipUpCount() {
    return S.items.filter(function (x) { if (x.equipped_job_id) return false; var it = IX.item[x.item_id], cur = equippedAt(it.jobId, it.partId); return x.cp > (cur ? cur.cp : 0); }).length;
  }
  function todayCard() {
    if (tutActive() || needJob()) return '';
    var rows = [], h = S.hunt;
    if (!h) rows.push(['사냥 시작', '앱을 꺼도 최대 8시간 쌓여요', 'todoHunt', '']);
    else if (huntFull(h)) rows.push(['사냥 보상 받기', '가방이 가득 찼어요 · 받고 계속 사냥', 'todoHunt', 'hot']);
    else if (huntTicksNow(h) > 0) rows.push(['사냥 보상 확인', huntTicksNow(h) + '회 쌓임', 'todoHunt', '']);
    var up = upgradeCount(), eq = equipUpCount();
    if (eq) rows.push(['더 좋은 장비 장착', eq + '개 장착 가능', 'todoEquip', 'hot']);
    if (up) rows.push(['장비 업그레이드', up + '부위 업그레이드 가능', 'todoCraft', 'hot']);
    if (dgActive()) rows.push(['레이드 이어 보기', '진행 중인 레이드로 돌아가요', 'dgResumeRing', 'hot']);
    if (S.chests.length) rows.push(['상자 열기', S.chests.length + '개 남음', 'todoChest', 'hot']);
    else if (!dgActive()) rows.push(['던전 레이드', '스크린 라운드로 특수 재료 받기', 'todoRaid', '']);
    if (missionReady()) rows.push(['미션 보상', missionReady() + '개 받기', 'missions', 'hot']);
    // v1.0.2 U3: 지금 할 일 하나만 강조(나머지는 평범한 링크), 요약 숫자 없음
    rows.sort(function (a, b) { return (b[3] ? 1 : 0) - (a[3] ? 1 : 0); });
    return '<div class="card today">' + (APP_CONFIG.V10_IMAGES ? '<img class="todaypino" src="' + asset('pino_point.png') + '" alt="">' : '') + '<div class="row"><b>오늘 할 일</b></div>' +
      rows.slice(0, 4).map(function (r, i) { return '<button class="todo' + (i === 0 && r[3] ? ' hot' : '') + '" data-a="' + r[2] + '"><b>' + r[0] + '</b><span>' + esc(r[1]) + '</span><i>›</i></button>'; }).join('') + '</div>';
  }
  A.todoHunt = function () { go(S.hunt ? 'hunt' : 'courses', S.hunt ? {} : { region: 'REC' }); };
  A.todoEquip = function () { go('items', { tab: 'equip' }); };
  A.todoCraft = function () { go('craft', { job: mainJob() }); };
  A.todoChest = function () { go('items', { tab: 'chest' }); };
  A.todoRaid = function () { go('dungeon'); };

  /* ---- 하단 탭 업그레이드 배지(B-52) ---- */
  var _tabs = tabs;
  tabs = function (on) {
    var html = _tabs(on);
    if (tutActive()) return html;
    var up = upgradeCount(), eq = equipUpCount();
    if (up) html = html.replace('data-v="craft" class="' + (on === 'craft' ? 'on' : '') + '">제작', 'data-v="craft" class="' + (on === 'craft' ? 'on' : '') + '">제작<i class="upb">' + up + '</i>');
    if (eq) html = html.replace('data-v="char" class="' + (on === 'char' ? 'on' : '') + '">캐릭터', 'data-v="char" class="' + (on === 'char' ? 'on' : '') + '">캐릭터<i class="upb">↑</i>');
    return html;
  };

  /* ---- 상단 바 전투력: 화면 계산값으로 통일(B-49) ---- */
  var _topbar = topbar;
  topbar = function () {
    var c = charOf(mainJob()); if (c) c.cp = cpOf(mainJob());
    return _topbar();
  };

  /* ---- 사냥: 받고 계속 사냥(B-55) + 가득 참 배너·PUSH 미리보기 ---- */
  var _hunt = SCREENS.hunt;
  SCREENS.hunt = function (p) {
    var html = _hunt(p), h = S.hunt;
    if (h && !h.tutorial) html = html.replace('<div class="dgfoot" style="background:var(--bg)">', '<div class="dgfoot" style="background:var(--bg)">' + (huntFull(h) ? '<p class="fullnote">가방이 가득 찼어요 · 더 쌓이지 않아요</p>' : '') + '<button class="btn ghost" data-a="claimContinue">받고 계속 사냥</button>');
    return html;
  };
  A.claimContinue = function () {
    var h = S.hunt; if (!h) return;
    // v1.0.3 A3: 시작 응답을 기다리지 않고 시작 시각만으로 보상 수 판단 → 0이면 서버 요청 없이 바로 안내
    if (!Engine.huntTicks(M, Date.parse(h.started_at), now(), h.tutorial)) { toast('아직 받을 보상이 없어요 · 다음 보상까지 ' + nextTickLabel(h) + ' · 사냥은 계속돼요'); return; }
    var c = IX.course[h.course_id], mj = mainJob();
    if (!Engine.canEnterCourse(M, cpOf(mj), c)) { // A5: 대표를 바꿔 이 코스에 다시 들어갈 수 없으면 먼저 안내
      popup = { type: 'confirm', title: '이 코스에서 계속 사냥할 수 없어요', text: '현재 대표(' + job(mj).name + ' ' + fmt(cpOf(mj)) + ')는 ' + c.name + '에 들어갈 수 없어요. 보상만 받고 사냥을 끝낼까요?', yes: '보상 받고 종료', no: '취소', run: function () { claim(false); } }; render(); return;
    }
    claim(false, h.course_id);
  };
  function huntFullBanner() {
    var h = S && S.hunt; if (!h || h.tutorial || !huntFull(h)) return '';
    fev('fn_full_banner');
    return '<button class="fullbanner" data-a="todoHunt">' + img(APP_CONFIG.V10_IMAGES ? 'pino_bag.png' : 'icon_mission.png') + '<div><b>사냥 가방이 가득 찼어요</b><span>8시간 보상 · 받고 계속 사냥하면 다시 쌓여요</span></div><i>받기 ›</i></button>';
  }
  var _gameScreen = gameScreen;
  gameScreen = function (tab, body, foot) { return _gameScreen(tab, (view.name !== 'hunt' ? huntFullBanner() : '') + body, foot); };
  var _launcher = SCREENS.launcher;
  SCREENS.launcher = function (p) {
    var html = _launcher(p), h = S.hunt;
    if (h && !h.tutorial && huntFull(h) && LAST.pushShown !== h.started_at) {
      LAST.pushShown = h.started_at; fev('fn_push_view');
      html = html.replace('<div class="screen gzm">', '<div class="screen gzm"><button class="pushpv" data-a="pushOpen"><i style="background-image:url(' + asset('icon_game.png') + ')"></i><div><span>골프존 · 지금</span><b>사냥 가방이 가득 찼어요!</b><p>' + esc(josa(job(h.job_id || mainJob()).name, '이', '가')) + ' 8시간 동안 모은 보상을 받아 주세요 · PUSH 미리보기</p></div></button>');
    }
    return html;
  };
  A.pushOpen = function () { fev('fn_push_open'); go('hunt'); };

  /* ---- 던전 탭: 스크린 라운드로 시작 배너(B-56) + 던전 체험 ---- */
  var _dungeon = SCREENS.dungeon;
  SCREENS.dungeon = function (p) {
    var html = _dungeon(p);
    var trial = S.tutorial && !S.tutorial.tutorial_raid_at ? '<div class="card tutraid"><div class="row" style="justify-content:flex-start;gap:12px"><img class="tbimg" src="' + v10a('boss_tutorial_idle.png', 'boss_metro_idle.png') + '" alt=""><div style="flex:1"><b>던전 체험 · 연습장 골렘</b><p class="small">3홀 · 약 2분 · 계정당 1회 · ' + esc(job(mainJob()).name) + ' 3부위 재료 상자</p></div></div>' +
      '<button class="btn purple" data-a="tutRaidOpen" data-tut="tutRaid">던전 체험 시작</button></div>' : '';
    var start = '<div class="dgstart' + (APP_CONFIG.V10_IMAGES ? ' img' : '') + '"' + (APP_CONFIG.V10_IMAGES ? '' : ' style="background-image:linear-gradient(90deg,#0B0716EE 30%,#0B071660),url(' + asset('webtoon_07.jpg') + ')"') + '>' + (APP_CONFIG.V10_IMAGES ? '<img class="dgsimg" src="' + asset('dg_start_banner.png') + '" alt="">' : '') + '<b>스크린 라운드가 곧 레이드</b><p>매장에서 스크린로그인하고 18홀을 치면 보스를 공격해요</p><button class="btn gold" data-a="dgStartGo">스크린 라운드로 시작</button><span class="simbadge">체험 레이드</span></div>';
    return html.replace('<div class="scroll">', '<div class="scroll">' + trial + start);
  };

  // 레이드 입장은 골프존앱 상단 [스크린 로그인] 하나(C-11) → 그 버튼으로 데려가 강조
  A.dgStartGo = function () {
    fev('fn_dg_start_banner'); go('launcher');
    var b = root.querySelector('[data-a=launcherScreen]'); if (b) b.classList.add('spot');
    toast('골프존앱 상단 [스크린 로그인]으로 레이드를 시작해요');
  };
  /* ---- 튜토리얼 보스(대본형, 3홀 · 약 2분) ---- */
  var TB = null;
  var TB_SCRIPT = (function () {
    // [슬롯, 클럽, 판정, 피해] — 홀마다 샷 4번 + 피니시. 합계 = HP
    var H = [
      [[0, 'DRIVER', 'STRONG', 180], [1, 'DRIVER', 'NORMAL', 120], [2, 'IRON', 'NORMAL', 110], [0, 'IRON', 'CRIT', 260], ['F', 380]],
      [[1, 'DRIVER', 'STRONG', 160], [0, 'DRIVER', 'CRIT', 280], [2, 'IRON', 'STRONG', 150], [0, 'PUTTER', 'NORMAL', 110], ['F', 420]],
      [[2, 'DRIVER', 'NORMAL', 130], [0, 'DRIVER', 'STRONG', 200], [1, 'IRON', 'NORMAL', 120], [0, 'IRON', 'CRIT', 270], ['F', 560]]
    ];
    return H;
  })();
  // HP = 샷 합 + 1H 피니시 + 2·3H 피니시 ×2(특수공격). 특수공격을 안 써도 마지막 피니시에 처치
  var TB_HP = TB_SCRIPT.reduce(function (a, h, hi) { return a + h.reduce(function (b, e) { return b + (e[0] === 'F' ? e[1] * (hi ? 2 : 1) : e[3]); }, 0); }, 0);
  var TB_TIPS = [
    ['GS 샷데이터가 들어오면 바로 공격해요', '내 샷 판정(일반·강타·크리티컬)이 피해가 돼요'],
    ['홀이 끝나면 스코어로 피니시 공격!', '파·버디를 하면 피니시 피해가 커져요'],
    ['내 샷마다 SP가 쌓여요', 'SP 100이 되면 [특수공격]으로 피니시를 2배로']
  ];
  function tbParty() {
    var g = M.guests.filter(function (x) { return x.use; }).slice(0, 2);
    return [{ nickname: S.member.nickname, job_id: mainJob(), look: lookOf(mainJob()), grade: S.member.grade_code }].concat(g.map(function (x) { return { nickname: x.nickname, job_id: x.jobId, look: Engine.lookByCp(M, x.cp), grade: x.gradeCode }; }));
  }
  A.tutRaidOpen = function () {
    if (S.tutorial.tutorial_raid_at) { toast('던전 체험 보상은 이미 받았어요'); return; }
    TB = { hole: 0, ev: 0, hp: TB_HP, sp: 0, spReady: false, spUsed: false, tip: 0, paused: true, done: false, fast: false, log: [], party: tbParty(), last: null };
    fev('fn_tutorial_raid_open'); go('tutBoss');
  };
  SCREENS.tutBoss = function () {
    if (!TB) return SCREENS.dungeon();
    var hp = Math.max(0, TB.hp), pct = hp / TB_HP * 100, last = TB.last;
    var tip = TB.paused && !TB.done ? TB_TIPS[Math.min(TB.tip, TB_TIPS.length - 1)] : null;
    var spBtn = TB.done ? '' : '<div class="spwrap"><div class="row"><span class="small">SP</span><div class="bar sp" style="flex:1"><i style="width:' + TB.sp + '%"></i></div><b class="small">' + TB.sp + '/100</b></div>' +
      '<button class="btn ' + (TB.spReady && !TB.spUsed ? 'purple spbtn ready' : 'ghost spbtn') + '" data-a="tbSp"' + (TB.spReady && !TB.spUsed ? '' : ' disabled') + '>' + (TB.spUsed ? '이번 홀 피니시 ×2 적용' : TB.spReady ? '특수공격! 피니시 ×2' : '특수공격 충전 중') + '</button></div>';
    return '<div class="screen dg tutboss"><div class="topbar"><button class="home" data-a="tbExit" aria-label="나가기">‹</button><div class="who">던전 체험</div><span class="simbadge">튜토리얼</span></div><div class="scroll">' +
      '<div class="row raidtop"><b>' + (TB.done ? '처치!' : (TB.hole + 1) + 'H / 3H') + '</b><span class="sub">' + (TB.done ? '보상 상자를 받아요' : TB.paused ? (TB.ev === 0 && TB.hole === 0 ? '시작 대기' : '안내 중 · 잠시 멈춤') : '자동치기 진행 중') + '</span><button class="chip" data-a="tbFast">' + (TB.fast ? '보통 속도' : '빠르게 ×2') + '</button></div>' +
      '<div class="bossbox raid"><div class="bossfig"><img class="bidle" src="' + v10a('boss_tutorial_idle.png', 'boss_metro_idle.png') + '" alt=""><img class="bhit" src="' + v10a('boss_tutorial_hit.png', 'boss_metro_hit.png') + '" alt=""></div><div class="bossname">연습장 골렘</div><div class="fxlayer"></div></div>' +
      '<div class="card" style="background:#2A1A14"><div class="row"><span>HP</span><b>' + fmt(hp) + ' / ' + fmt(TB_HP) + '</b></div><div class="bar hp"><i style="width:' + pct + '%"></i></div></div>' +
      (last ? '<div class="card shotcard"><div class="row"><b>' + esc(last.who) + '</b><span class="small">' + esc(last.what) + '</span></div><p class="big" style="margin:0">-' + fmt(last.dmg) + '</p></div>' : '<div class="card shotcard"><p class="sub">스크린에서 샷이 들어오면 여기에 표시돼요</p></div>') +
      (tip ? '<div class="tbtip">' + face(TB.tip === 2 ? 'pino_surprise' : 'pino') + '<div><b>' + esc(tip[0]) + '</b><p>' + esc(tip[1]) + '</p></div>' + (TB.spReady && !TB.spUsed ? '<span class="small">아래 버튼 ↓</span>' : '<button class="chip on" data-a="tbGo">' + (TB.ev === 0 && TB.hole === 0 ? '시작' : '계속') + '</button>') + '</div>' : '') +
      (TB.done ? '<div class="card" style="text-align:center"><img class="chesticon" style="width:96px;height:96px;margin:0 auto" src="' + asset('chest_2_closed.png') + '" alt=""><b>고급 체험 상자</b><p class="small">' + esc(job(mainJob()).name) + ' 투구·갑옷·장갑 재료</p></div>' : '') +
      '</div><div class="dgfoot">' + (TB.done ? '<button class="btn gold" data-a="tbClaim"' + (TB.busy ? ' disabled' : '') + '>' + (TB.busy ? '상자 여는 중…' : '상자 열기') + '</button>' : spBtn) + '</div></div>';
  };
  function tbAnimate(ev, finish) {
    var box = root.querySelector('.bossbox'), fx = box && box.querySelector('.fxlayer'); if (!fx) return;
    var p = TB.party[finish ? 0 : ev[0]];
    fx.querySelectorAll('.attacker').forEach(function (x) { x.remove(); });
    spawn(fx, '<div class="attacker' + (finish || ev[0] === 0 ? ' me' : '') + (finish ? ' finish' : '') + '"><span class="nameplate"><b>' + esc(p.nickname) + '</b><i>' + esc(p.grade || '') + '</i></span>' + charPic(p.job_id, p.look, 'atk') + '</div>', 1700);
    if (!finish) spawn(fx, '<img class="clubfx" src="' + asset('fx_club_' + CLUB_FILE[ev[1]] + '.png') + '" alt="" onerror="this.remove()">', 700);
    else spawn(fx, '<img class="finishfx" src="' + asset('fx_finish_' + JOB_FILE[p.job_id] + '.png') + '" alt="" onerror="this.remove()">', 1300);
    box.classList.remove('hit'); void box.offsetWidth;
    setTimeout(function () { box.classList.add('hit'); spawn(fx, '<i class="sprite ' + (!finish && ev[2] === 'CRIT' ? 'crit' : 'hit') + '"></i>', 420); spawnFloat(fx, (finish ? '피니시 ' : '') + '-' + fmt(TB.last.dmg), finish ? 'finish' : ev[2] === 'CRIT' ? 'crit' : ev[2] === 'STRONG' ? 'strong' : ''); }, 600);
  }
  function tbStep() {
    if (!TB || TB.paused || TB.done || view.name !== 'tutBoss') return;
    var hole = TB_SCRIPT[TB.hole], ev = hole[TB.ev];
    if (ev[0] === 'F') {
      var mult = TB.spUsed ? 2 : 1, dmg = ev[1] * mult;
      TB.hp -= dmg; TB.last = { who: TB.party[0].nickname + ' · ' + (TB.hole + 1) + 'H 피니시', what: TB.spUsed ? '특수공격 ×2 · 파' : '파 · 홀 종료 공격', dmg: dmg };
      if (TB.spUsed) { TB.sp = 0; TB.spReady = false; TB.spUsed = false; }
      TB.ev = 0; TB.hole++;
      if (TB.hole >= TB_SCRIPT.length) { TB.hole = TB_SCRIPT.length - 1; TB.hp = Math.max(0, TB.hp); render(); tbAnimate(ev, true); TB.hp = 0; TB.done = true; fev('fn_tutorial_raid_kill'); setTimeout(render, 1400); return; }
      if (TB.hole === 1) { TB.tip = 1; TB.paused = true; }
      render(); tbAnimate(ev, true);
    } else {
      var p = TB.party[ev[0]];
      TB.hp -= ev[3]; TB.last = { who: p.nickname + (ev[0] === 0 ? ' (나)' : ''), what: { DRIVER: '드라이버', IRON: '아이언', PUTTER: '퍼터' }[ev[1]] + ' · ' + QUALITY_NAME[ev[2]], dmg: ev[3] };
      if (ev[0] === 0) { TB.sp = Math.min(100, TB.sp + (TB.hole === 2 ? 50 : 35)); if (TB.sp >= 100 && !TB.spReady) { TB.spReady = true; if (!TB.spTaught) { TB.spTaught = true; TB.tip = 2; TB.paused = true; } } } // U5: 특수공격 안내는 처음 한 번만
      TB.ev++; render(); tbAnimate(ev, false);
    }
    schedTb();
  }
  function schedTb() { clearTimeout(TB && TB.timer); if (TB && !TB.paused && !TB.done) TB.timer = setTimeout(tbStep, TB.fast ? 1500 : 3000); }
  A.tbGo = function () { if (!TB) return; if (TB.tip === 2 && TB.spReady && !TB.spUsed) { TB.paused = false; render(); return; } TB.paused = false; TB.tip = Math.min(TB.tip, 2); render(); schedTb(); };
  A.tbSp = function () { if (!TB || !TB.spReady) return; TB.spUsed = true; TB.paused = false; toast('특수공격! 이번 홀 피니시가 2배가 돼요'); var b = root.querySelector('.spwrap'); render(); b = root.querySelector('.spwrap'); if (b) spawn(b, '<img class="spuse" src="' + asset('fx_sp_use.png') + '" alt="" onerror="this.remove()">', 900); schedTb(); };
  A.tbFast = function () { if (!TB) return; TB.fast = !TB.fast; render(); if (!TB.paused) schedTb(); };
  A.tbExit = function () {
    if (TB && TB.done) { A.tbClaim(); return; }
    popup = { type: 'confirm', title: '던전 체험을 그만할까요?', text: '처음부터 다시 할 수 있어요. 보상은 보스를 쓰러뜨리면 받아요.', yes: '나가기', no: '계속하기', run: function () { clearTimeout(TB && TB.timer); TB = null; go('dungeon'); } }; render();
  };
  A.tbClaim = function () {
    if (!TB || TB.busy) return; TB.busy = true;
    // v1.0.3 B10: 체험 상자 내용은 정해진 값(엔진 tutorialChest) → 바로 열고, 서버 지급·개봉은 순서대로 뒤에서
    var c = Engine.tutorialChest(M, mainJob()), loc = { contents: c, items: [] };
    S.wallet.gold += c.gold; addMats(c.materials);
    S.tutorial.tutorial_raid_at = new Date(now()).toISOString(); TB = null;
    fev('tutorialRaid_chest');
    go('craft', { job: mainJob(), part: tutMissingPart() || '' });
    popup = { type: 'tutChest', res: loc }; render();
    act('tutorialRaid', {}).then(function (res) {
      if (!res.ok) { if (res.error.code !== 'ALREADY_DONE') toast(res.error.message); reload().then(render); return; }
      commit('chestOpen', { chest_id: res.data.chest.chest_id, item_ids: [] });
    });
  };
  POPUPS.tutChest = function (p) {
    var c = p.res.contents, j = mainJob();
    return '<div class="overlay center"><div class="sheet" style="align-items:center;text-align:center"><div class="row" style="justify-content:center;gap:4px"><img class="chesticon" style="width:110px;height:110px" src="' + asset('chest_2_open.png') + '" alt="">' + (APP_CONFIG.V10_IMAGES ? '<img style="width:96px;height:96px" src="' + asset('pino_bag.png') + '" alt="">' : '') + '</div>' +
      '<b style="font-size:20px">체험 상자 개봉!</b><p>골드 <b data-count="' + c.gold + '">0</b></p>' +
      '<div class="grid">' + Object.keys(c.materials).map(function (id) { return '<div class="cell lite g1">' + matIcon(id) + '<span>' + esc(matName(id)) + ' ×<b data-count="' + c.materials[id] + '">0</b></span></div>'; }).join('') + '</div>' +
      '<p class="sub">' + esc(job(j).name) + ' 투구·갑옷·장갑을 만들 수 있어요. 무기까지 4부위를 갖추면 외형이 바뀌어요!</p>' +
      '<button class="btn gold" data-a="tutCraftGo" data-tut="tutCraftGo">3부위 만들러 가기</button></div></div>';
  };
  A.tutCraftGo = function () { popup = null; go('craft', { job: mainJob(), part: tutMissingPart() || '' }); };

  /* ---- 튜토리얼 진행 표시(U5): 6단계 안을 던전 체험 → 첫 외형 1/3·2/3·3/3으로 ---- */
  function tutLabel() {
    var st = tutCur();
    if (!v10() || TUT.replay || st !== 6) return st + '/6';
    if (tutPhase6() === 'raid') return '마무리 1/2 · 던전 체험';
    var done = bal10().tutorialParts.filter(function (x) { return !!equippedAt(mainJob(), x); }).length;
    return '마무리 2/2 · 첫 외형 ' + done + '/3';
  }
  /* ---- 외형 진화 팝업은 처음 달성 때만(U5), 다시 맞춘 세트는 토스트 ---- */
  function lookBestKey() { return 'rf_lookbest_' + (S && S.member ? S.member.member_id : ''); }
  function lookBest() { try { return JSON.parse(localStorage.getItem(lookBestKey()) || '{}'); } catch (e) { return {}; } }
  function lookScore(lk) { return lk.stage * 10 + (lk.set || 0); }
  var _lookCheck0 = lookCheck;
  lookCheck = function (j, before) {
    _lookCheck0(j, before);
    if (!popup || popup.type !== 'evolve') return;
    var best = lookBest(), b = best[j] || 0, sc = lookScore(popup.to);
    if (sc <= b) { var p = popup; popup = null; toast(job(j).name + ' ' + LOOK_NAME[p.to.stage] + ' 외형' + (p.to.set ? ' · ' + setLabel(p.to) : '') + ' 다시 갖췄어요'); return; }
    best[j] = sc; try { localStorage.setItem(lookBestKey(), JSON.stringify(best)); } catch (e) {}
  };
  /* ---- 외형 진화 퍼널 ---- */
  var _lookCheck = lookCheck;
  lookCheck = function (j, before) { _lookCheck(j, before); if (popup && popup.type === 'evolve' && popup.to.stage > popup.from.stage) fev('fn_look_up', { job_id: j, stage: popup.to.stage }); };

  /* ---- 상자 개봉 → 업그레이드(B-53) ---- */
  var _chestOpened = POPUPS.chestOpened;
  POPUPS.chestOpened = function (p) {
    return _chestOpened(p).replace('<button class="btn" data-a="close">확인</button>', (upgradeCount() ? '<button class="btn gold" data-a="upgradeGo">이 재료로 업그레이드 (' + upgradeCount() + '부위)</button>' : '') + '<button class="btn' + (upgradeCount() ? ' ghost' : '') + '" data-a="close">확인</button>');
  };
  A.upgradeGo = function () {
    popup = null;
    var best = M.items.filter(function (it) { return cpGain(it.id) > 0 && !Engine.craftShortage(M, it.id, S.wallet, S.materials).length; }).sort(function (a, b) { return (b.jobId === mainJob()) - (a.jobId === mainJob()) || cpGain(b.id) - cpGain(a.id); })[0];
    if (!best) { go('craft'); return; }
    go('craft', { job: best.jobId }); popup = { type: 'craftDetail', id: best.id }; render();
  };
  var _dgChest = SCREENS.dgChest;
  SCREENS.dgChest = function (p) {
    var html = _dgChest(p), c = D.chests[0]; if (!c) return html;
    var left = D.chests.length - (D.openState === 'done' ? 1 : 0); // B-50: 연 상자는 빼고 표시
    html = html.replace('<span class="small">남은 상자 ' + D.chests.length + '개</span>', '<span class="small">' + (left ? '남은 상자 ' + left + '개' : '모든 상자를 열었어요') + '</span>');
    if (D.openState === 'done' && upgradeCount()) html = html.replace('<button class="btn ghost" data-a="dgItems">', '<button class="btn gold" data-a="upgradeGo">이 재료로 업그레이드 (' + upgradeCount() + '부위)</button><button class="btn ghost" data-a="dgItems">');
    return html;
  };

  /* ---- 레이드 결과: 기여 배지(B-57) ---- */
  var BADGE = { shot: '샷 공격 1위', grade: '피니시 1위', shield: '방패', magic: '관통', aim: '저격', team: '해독' };
  var ROLE_BADGE = { WAR: 'shield', MAG: 'magic', ARC: 'aim', ROG: 'team' };
  var _dgResult = SCREENS.dgResult;
  SCREENS.dgResult = function (p) {
    var html = _dgResult(p), x = D.result || {}, r = D.round, ps = x.players || [];
    if (!r || !ps.length) return html;
    var top = function (k) { return ps.slice().sort(function (a, b) { return b[k] - a[k]; })[0].slot; }, ts = top('shot_damage'), th = top('hole_damage');
    var badges = function (slot) {
      var out = [], pp = r.participants[slot];
      if (slot === ts) out.push('shot'); if (slot === th) out.push('grade');
      if (pp && ROLE_BADGE[pp.job_id]) out.push(ROLE_BADGE[pp.job_id]);
      return '<span class="cbadges">' + out.map(function (b) { return '<i class="cb cb-' + b + '">' + (APP_CONFIG.V10_IMAGES ? img('badge_' + b + '.png') : '') + '<em>' + BADGE[b] + '</em></i>'; }).join('') + '</span>';
    };
    ps.forEach(function (pl) {
      var nick = esc(nickOf(pl.slot)) + (pl.slot === 0 ? ' (나)' : '');
      html = html.replace('<span style="flex:1">' + nick + '</span>', '<span style="flex:1">' + nick + badges(pl.slot) + '</span>');
    });
    return html.replace(/<span class="simbadge">시뮬레이션<\/span>/g, '<span class="simbadge">체험 레이드</span>');
  };
  ['dgReady', 'dgRaid'].forEach(function (k) { var f = SCREENS[k]; SCREENS[k] = function (p) { return f(p).replace(/<span class="simbadge">시뮬레이션<\/span>/g, '<span class="simbadge">체험 레이드</span>'); }; });

  /* ---- SP 자동 사용(B-57): 준비되고 4초 안에 안 누르면 자동 ---- */
  D.autoSp = (function () { try { return localStorage.getItem('rf_autosp') !== 'N'; } catch (e) { return true; } })(); // C29: 새로고침해도 유지
  setInterval(function () {
    if (!S || !M || !D.sim || !D.autoSp || view.name !== 'dgRaid' || D.sim.finished || popup || D.coach !== null && D.coach !== undefined) { D.spReadyAt = 0; return; }
    var st = spState();
    if (st.state !== 'READY') { D.spReadyAt = 0; return; }
    if (!D.spReadyAt) { D.spReadyAt = Date.now(); return; }
    if (Date.now() - D.spReadyAt > 4000) { D.spReadyAt = 0; var b = root.querySelector('[data-a=dgSp]'); if (b && !b.disabled) { toast('특수공격 자동 사용!'); A.dgSp(b.dataset, b); } }
  }, 500);
  var _spButton = spButton;
  spButton = function () {
    var html = _spButton(); if (!html) return html;
    return html.replace('</b></div>', '</b><button class="autosp' + (D.autoSp ? ' on' : '') + '" data-a="autoSp" aria-label="특수공격 자동">자동 ' + (D.autoSp ? 'ON' : 'OFF') + '</button></div>');
  };
  A.autoSp = function () { D.autoSp = !D.autoSp; try { localStorage.setItem('rf_autosp', D.autoSp ? 'Y' : 'N'); } catch (e) {} toast('특수공격 자동 ' + (D.autoSp ? '켬 · 준비되면 4초 뒤 자동으로 써요' : '끔 · 준비되면 직접 눌러요')); render(); };

  /* ---- 미션(B-58): 이름·한 번에 받기·KST ---- */
  var _missions = POPUPS.missions;
  POPUPS.missions = function (p) {
    var html = _missions(p).replace(/레이드 참여/g, '레이드 완료(체험 제외)').replace('매일 00:00 초기화', '매일 00:00(한국 시간) 초기화').replace('레이드 참여는 선택', '레이드는 선택').replace('6개 중 5개를 완료하면 올클리어', '7개 중 6개를 완료하면 올클리어 · 이용권 1장 지급(최대 10장 보관)');
    var ready = p.data && (p.data.missions || []).filter(function (m) { return m.done && !m.claimed; }).length;
    // v1.0.3 A2: [한 번에 받기] 삭제(하나씩 받기만)
    return html;
  };
  A.missionClaimAll = function (d, el) {
    var list = (popup && popup.data && popup.data.missions || []).filter(function (m) { return m.done && !m.claimed && m.event_type !== 'ALL_CLEAR'; });
    var all = (popup && popup.data && popup.data.missions || []).filter(function (m) { return m.done && !m.claimed && m.event_type === 'ALL_CLEAR'; });
    if (el) el.disabled = true;
    var gold = 0, mats = {};
    list.concat(all).forEach(function (m) { var r = m.reward || {}; gold += r.gold || 0; Object.keys(r.materials || {}).forEach(function (k) { mats[k] = (mats[k] || 0) + r.materials[k]; }); });
    list.concat(all).forEach(function (m) { A.missionClaim({ v: m.mission_id }, { disabled: false }); });
    toast(list.concat(all).length + '개 수령 · 총 ' + [gold ? fmt(gold) + 'G' : '', Object.keys(mats).map(function (k) { return matName(k) + ' ' + mats[k]; }).join(' ')].filter(Boolean).join(' + ')); // U6: 합계
  };

  // ================= v1.0.2 새 인트로: 9컷 모션 웹툰(데이터 정의) =================
  // 컷마다 배경·레이어(위치 %·등장 시점)·대사(화자·등장 시점)·효과를 데이터로 정의 → 시나리오·타이밍은 이 표만 고치면 됨
  // 컷 기준점이 화면 55% 선을 지나면 재생(.play), 재생 없이 지나간 컷은 완료 상태(.done), 위로 돌아가도 강한 효과는 반복 안 함
  var INTRO = [
    { bg: 'webtoon_02.jpg', cam: 'zoomBall', pos: 'bottom',
      layers: [{ cls: 'ballglow', x: 52, y: 80, w: 16, at: 1500 }],
      lines: [{ who: 'nar', t: '{nick}님, 오늘도 마지막 퍼트를 앞두고 있습니다.', at: 400 }, { who: 'me', t: '이 퍼트만 넣으면…', at: 1000 }] },
    { bg: 'webtoon_01.jpg', cam: 'zoomRift', fx: ['flash', 'shake', 'particles'], pos: 'top',
      lines: [{ who: 'sfx', t: '쩌저적—!', at: 100 }, { who: 'me', t: '잠깐… 스크린이 열렸어?', at: 700 }] },
    { bg: 'intro_03_bg.webp', pos: 'top',
      layers: [{ img: 'pino_cheer.png', x: 62, y: 40, w: 28, at: 700, cls: 'pop float' }, { cls: 'sparkle', x: 64, y: 38, w: 24, at: 750 }],
      lines: [{ who: 'me', t: '여긴… 어느 골프장이야?', at: 400 }, { who: 'pino', t: '어서 와! 나는 캐디 요정 피노야.', at: 1000 }, { who: 'pino', t: '여긴 네가 알던 코스 너머의 세계야.', at: 1500 }] },
    { bg: 'intro_04_bg.webp', fx: ['riftglow'], pos: 'bottom',
      layers: [{ img: 'boss_riftlord_idle.png', x: 14, y: 4, w: 72, at: 300, cls: 'reveal' }],
      lines: [{ who: 'pino', t: '하지만 지금은 몬스터가 코스를 점령했어!', at: 800 }, { who: 'me', t: '저걸… 골프채로 상대하라고?', at: 1400 }] },
    { bg: 'intro_05_bg.webp', pos: 'top',
      layers: [{ job: 'WAR', x: 4, y: 53, w: 24, at: 300, cls: 'summon c-war' }, { job: 'MAG', x: 26, y: 53, w: 24, at: 550, cls: 'summon c-mag' },
        { job: 'ARC', x: 50, y: 53, w: 24, at: 800, cls: 'summon c-arc' }, { job: 'ROG', x: 75, y: 53, w: 24, at: 1050, cls: 'summon c-rog' }],
      lines: [{ who: 'pino', t: '혼자 싸우라는 게 아니야.', at: 200 }, { who: 'pino', t: '이 세계엔, 네 안의 네 가지 가능성이 있어.', at: 700 }, { who: 'me', t: '저 넷이… 전부 나라고?', at: 1300 }] },
    { bg: 'intro_06_bg.webp', pos: 'top',
      layers: [{ job: 'WAR', atk: true, x: 6, y: 40, w: 32, at: 0, cls: 'pop' }, { cls: 'hitfx', x: 26, y: 42, w: 16, at: 250 },
        { img: 'icon_mat_iron_1.png', x: 26, y: 46, w: 10, at: 500, cls: 'fly', tx: 190, ty: 300 }, { img: 'icon_mat_leather_1.png', x: 30, y: 42, w: 10, at: 600, cls: 'fly', tx: 150, ty: 330 },
        { img: 'icon_mat_cloth_1.png', x: 22, y: 44, w: 10, at: 700, cls: 'fly', tx: 230, ty: 310 },
        { cls: 'goldflash', x: 33, y: 56, w: 34, at: 1000 }, { img: 'icon_item_war_g2_weapon.png', x: 40, y: 59, w: 20, at: 1050, cls: 'pop glowitem' }],
      lines: [{ who: 'pino', t: '라운드가 없는 날엔 코스를 탐험하고,', at: 300 }, { who: 'pino', t: '모은 재료로 장비를 만들어 더 강해지는 거야.', at: 1000 }, { who: 'nar', t: '앱을 꺼도, 사냥은 계속된다.', at: 1500 }] },
    { bg: 'intro_07_bg.webp', fx: ['trail', 'flash2'], pos: 'mid', key: true,
      layers: [{ img: 'boss_riftlord_idle.png', x: 48, y: 0, w: 52, at: 0, cls: 'fadein bossr' }, { job: 'ARC', atk: true, stage: 3, x: 50, y: 30, w: 30, at: 300, cls: 'pop' },
        { cls: 'hitfx big', x: 64, y: 10, w: 26, at: 900 },
        { html: '<div class="minishotcard"><span class="gs">GS 샷데이터 수신</span><b>드라이버 · 비거리 232m · 방향각 +2°</b><em>크리티컬 · -1,280</em></div>', x: 36, y: 79, w: 62, at: 1000, cls: 'slide' }],
      lines: [{ who: 'pino', t: '그리고 다시 스크린 앞에 서면…', at: 100 }, { who: 'hl', t: '네 샷이, 이 세계의 공격이 돼!', at: 1100 }, { who: 'me', t: '내 샷으로 보스를 공격한다고?', at: 1700 }] },
    { bg: 'intro_08_bg.webp', fx: ['rune', 'volley', 'shake2', 'clear'], pos: 'top', key: true,
      layers: [{ img: 'boss_hydra_idle.png', x: 46, y: 30, w: 56, at: 0, cls: 'fadein bossh' },
        { party: 0, job: 'WAR', x: 0, y: 50, w: 22, at: 0, cls: 'fadein' }, { party: 1, job: 'MAG', x: 13, y: 60, w: 22, at: 100, cls: 'fadein' },
        { party: 2, job: 'ARC', x: 26, y: 50, w: 22, at: 200, cls: 'fadein' }, { party: 3, job: 'ROG', x: 30, y: 66, w: 22, at: 300, cls: 'fadein' },
        { cls: 'hitfx big', x: 58, y: 38, w: 30, at: 1200 }],
      lines: [{ who: 'pino', t: '함께 라운드하는 동료들과 힘을 모아!', at: 200 }, { who: 'me', t: '좋아, 이번 홀은 같이 끝내자!', at: 800 }, { who: 'hl', t: '홀 완료 · 합동 공격!', at: 1200 }] },
    { bg: 'webtoon_09.jpg', cam: 'depth', pos: 'top', last: true,
      lines: [{ who: 'pino', t: '아직 되찾아야 할 코스가 많아.', at: 500 }, { who: 'pino', t: '네 명의 너와 함께, 다음 코스로 가자!', at: 1000 }] }
  ];
  function introPath(p) { return /\.(jpg|webp)$/.test(p) && p.indexOf('.webp') > 0 ? APP_CONFIG.ASSET_DIR + p + (APP_CONFIG.ASSET_VER ? '?v=' + APP_CONFIG.ASSET_VER : '') : asset(p); }
  function introLayer(L, ci) {
    var st = 'left:' + L.x + '%;top:' + L.y + '%;width:' + L.w + '%;--d:' + (L.at || 0) + 'ms' + (L.tx ? ';--tx:' + L.tx + '%;--ty:' + L.ty + '%' : '');
    var inner = L.img ? '<img src="' + introPath(L.img) + '" alt="">' : L.job ? '<img src="' + charStage(L.job, L.stage !== undefined ? L.stage : 1, L.atk) + '" alt="" onerror="this.onerror=null;this.src=\'' + charFallback(L.job, L.atk) + '\'">' : (L.html || '');
    if (L.party !== undefined) { var g = (M.guests || [])[L.party]; inner += '<span class="ipname">' + esc(L.party === 0 ? S.member.nickname : g ? g.nickname : '동료') + '</span>'; }
    return '<div class="ily ' + (L.cls || '') + '" style="' + st + '">' + inner + '</div>';
  }
  var WHO = { me: '', pino: '피노', nar: '', sfx: '', hl: '' };
  SCREENS.intro = function () {
    var nick = esc(S.member.nickname);
    var cuts = INTRO.map(function (c, i) {
      var lines = c.lines.map(function (l) {
        return '<p class="iln w-' + l.who + '" style="--d:' + l.at + 'ms">' + (l.who === 'pino' ? '<img class="lface" src="' + asset('pino.png') + '" alt="">' : '') + (WHO[l.who] ? '<b>' + WHO[l.who] + '</b>' : '') + '<span>' + esc(l.t).replace('{nick}', nick) + '</span></p>';
      }).join('');
      var fx = (c.fx || []).map(function (f) { return '<i class="ifx fx-' + f + '"></i>'; }).join('');
      if ((c.fx || []).indexOf('particles') >= 0) for (var k = 0; k < 10; k++) fx += '<i class="ipt" style="left:' + (20 + (k * 37) % 60) + '%;--k:' + k + '"></i>';
      if ((c.fx || []).indexOf('trail') >= 0) fx += '<svg class="itrail" viewBox="0 0 100 150" preserveAspectRatio="none"><defs><linearGradient id="trg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#C9A6FF"/><stop offset="1" stop-color="#FFD66B"/></linearGradient></defs><path d="M28 84 Q 40 40 72 20" /></svg>';
      if ((c.fx || []).indexOf('volley') >= 0) fx += '<svg class="ivolley" viewBox="0 0 100 150" preserveAspectRatio="none">' + [[12, 95], [24, 108], [37, 95], [41, 118]].map(function (p, k) { return '<path style="--k:' + k + '" d="M' + p[0] + ' ' + p[1] + ' Q ' + (p[0] + 25) + ' ' + (p[1] - 45) + ' 74 78" />'; }).join('') + '</svg>';
      return '<section class="mcut cam-' + (c.cam || 'none') + (c.key ? ' key' : '') + '" data-ci="' + i + '">' +
        '<div class="ibg"><img src="' + introPath(c.bg) + '" alt=""' + (i > 1 ? ' loading="lazy"' : '') + '></div>' + fx +
        (c.layers || []).map(function (L) { return introLayer(L, i); }).join('') +
        '<div class="ilines p-' + c.pos + '">' + lines + '</div>' +
        (c.last ? '<div class="iend"><h1 class="title">균열의 페어웨이</h1><button class="btn purple" data-a="introDone">나의 모험 시작</button></div>' : '') +
        '</section>';
    }).join('');
    setTimeout(function () { introScroll(root.querySelector('[data-scroll="intro"]')); }, 60); // 첫 컷은 스크롤 없이 바로 재생
    return '<div class="screen intro v102" style="position:relative"><button class="skip" data-a="introSkip">건너뛰기 ›</button>' +
      '<div class="webtoon" data-scroll="intro">' + cuts + '<div style="height:40px"></div></div>' +
      '<div class="cutdots">' + INTRO.map(function (c, i) { return '<i class="' + (i === 0 ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
      '<div class="swipehint"><span>아래로 넘겨 보세요</span><b>⌄</b></div></div>';
  };
  function introScroll(box) {
    if (!box) return;
    var top = box.getBoundingClientRect().top, hgt = box.clientHeight, cur = -1;
    box.querySelectorAll('.mcut').forEach(function (c, i) {
      var b = c.getBoundingClientRect(), rel = b.top - top;
      if (rel < hgt * 0.55) {
        if (!c.classList.contains('play') && !c.classList.contains('done')) {
          if (b.bottom - top < hgt * 0.15) c.classList.add('done'); // 빠르게 지나간 컷: 연출 없이 읽을 수 있는 상태
          else c.classList.add('play');
        }
        cur = i;
      }
    });
    if (cur < 0) cur = 0;
    box.querySelectorAll('.mcut').forEach(function (c, i) { c.classList.toggle('cur', i === cur); });
    root.querySelectorAll('.cutdots i').forEach(function (d, i) { d.className = i === cur ? 'on' : ''; });
    var hint = root.querySelector('.intro .swipehint'); if (hint) hint.style.display = cur >= INTRO.length - 1 ? 'none' : '';
    view.p.cut = cur;
  }

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

  /* ================= 3홀 챌린지 (v1.1) =================
   * 유저의 임팩트 입력으로만 진행하는 연속 3홀. 화면은 같은 엔진(Engine.ch)으로 결과를 바로 그리고, 서버(challengeShot)가 뒤에서 같은 계산으로 확정한다.
   * 게임용 가상 샷·스코어이며 실제 GS 샷·핸디캡 기록과 섞지 않는다. 지도는 코드(SVG)로 그린 간략 지도(경로 좌표는 엔진의 레이아웃 메타데이터). */
  var CHC = { r: null, S: null, st: null, disp: null, phase: 'ready', pose: 'idle', p: 0.5, t0: 0, raf: 0, unsent: [], flushing: false, syncErr: false, hist: {},
    practice: false, coach: null, trails: [[], [], []], anim: null, holeEnd: null, loading: false, taps: [], speed: 'slow', busyPick: false };
  try { CHC.speed = localStorage.getItem('rf_ch_speed') === 'fast' ? 'fast' : 'slow'; } catch (e) {}
  var CH_PALS = {
    METRO: { bg: '#2d5a3f', fl: '#4f8c63', fair: '#6fb77f', green: '#9be08c', ge: '#3f7f4b', t1: '#1f4a32', t2: '#2f6b4a', wa: '#4a86c5', tee: '#cfe9d0' },
    GANGWON: { bg: '#264a33', fl: '#3f7650', fair: '#5ea06b', green: '#8fd48a', ge: '#2f6a43', t1: '#173a27', t2: '#245a3a', wa: '#4f86b5', tee: '#cbe5cf' },
    CHUNGCHEONG: { bg: '#4a5a34', fl: '#7a8c4f', fair: '#a2b867', green: '#c8e48b', ge: '#667a3d', t1: '#3a4a28', t2: '#58703a', wa: '#5b97c0', tee: '#e6efc9' },
    JEOLLA: { bg: '#2f6140', fl: '#559a63', fair: '#7cc986', green: '#a8ee93', ge: '#44864f', t1: '#214f33', t2: '#33783f', wa: '#4a8ac8', tee: '#d3efd1' },
    GYEONGSANG: { bg: '#44593a', fl: '#6f8a52', fair: '#94b66c', green: '#bde48e', ge: '#5d7a43', t1: '#33472b', t2: '#4c6b38', wa: '#5593c4', tee: '#e2efc9' },
    JEJU: { bg: '#2c5d52', fl: '#4b8f82', fair: '#78c4ae', green: '#a7ecd0', ge: '#3d8a78', t1: '#1d4a42', t2: '#2f7364', wa: '#3aa0b8', tee: '#d6efe7' },
    OVERSEAS: { bg: '#5a5a38', fl: '#8e8d58', fair: '#b9bb74', green: '#dcec9a', ge: '#767744', t1: '#444428', t2: '#66673a', wa: '#5b9ec6', tee: '#efefc9' },
    VIRTUAL: { bg: '#3d3a63', fl: '#605b9a', fair: '#8a84cf', green: '#b9b3f2', ge: '#4f4a86', t1: '#2b2850', t2: '#45407a', wa: '#6a8ee0', tee: '#e3e0fb' }
  };
  var CH_MAPCACHE = {};
  function chCfg() { return Engine.ch.cfg(M); }
  function chRegion() { return CHC.S ? CHC.S.region_id : 'METRO'; }
  function chRng(str) { var h = 1779033703; for (var i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return function () { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; }
  function chMinDist(g, x, y) { var m = 1e9; for (var i = 0; i < g.D.length; i++) { var d = Math.hypot(g.D[i][0] - x, g.D[i][1] - y); if (d < m) m = d; } return m; }
  /** 지도 배경(코드로 그림): 러프·페어웨이(경로 폭)·그린·티박스·장식(경로 밖에만). 공·궤적·홀컵·글자는 여기에 넣지 않는다 */
  function chMapStatic(h, region) {
    var key = h.layout_id + '|' + h.dist + '|' + region + '|' + (APP_CONFIG.CH_IMAGES ? 'i' : 'c'); if (CH_MAPCACHE[key]) return CH_MAPCACHE[key];
    var pal = CH_PALS[region] || CH_PALS.METRO, g = Engine.ch.geom(h.layout_id, h.dist), HH = g.H, out;
    if (APP_CONFIG.CH_IMAGES) { // GPT 지도 이미지 + 지역 색을 아주 약하게 입힘(8색 변형 이미지를 따로 만들지 않음)
      out = '<rect x="-300" y="-300" width="900" height="' + (HH + 600).toFixed(0) + '" fill="#5f9a2e"/>' +
        // 화면 비율이 지도보다 넓을 때 양옆 여백: 같은 지도를 크게 흐리게 깔아 자연스럽게 이어 보이게 함
        '<image href="' + asset('ch_map_' + h.layout_id + '.png') + '" x="-170" y="-60" width="640" height="' + (HH + 120).toFixed(0) + '" preserveAspectRatio="xMidYMid slice" style="filter:blur(7px)" opacity=".9"/>' +
        '<image href="' + asset('ch_map_' + h.layout_id + '.png') + '" x="0" y="0" width="300" height="' + HH.toFixed(2) + '" preserveAspectRatio="none"/>' +
        '<rect x="0" y="0" width="300" height="' + HH.toFixed(2) + '" fill="' + pal.bg + '" opacity=".16"/>';
      return (CH_MAPCACHE[key] = out);
    }
    var r = chRng('chmap:' + h.layout_id), x, y, i, w0 = g.wd[0];
    out = '<rect x="-300" y="-300" width="900" height="' + (HH + 600).toFixed(0) + '" fill="' + pal.bg + '"/>'; var pond = false, placed = 0;
    for (i = 0; i < 40 && !pond; i++) { x = 30 + r() * 240; y = 30 + r() * (HH - 60); if (chMinDist(g, x, y) > w0 / 2 + 46) { out += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="24" ry="13" fill="' + pal.wa + '" stroke="#fff" stroke-opacity=".5" stroke-width="1.5"/>'; pond = true; } }
    for (i = 0; i < 90 && placed < 22; i++) {
      x = 8 + r() * 284; y = 8 + r() * (HH - 16); var f = r();
      if (chMinDist(g, x, y) > w0 / 2 + 22) { out += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (6 + r() * 5).toFixed(1) + '" fill="' + (f > 0.5 ? pal.t1 : pal.t2) + '" stroke="#0b1712" stroke-width="1.2"/>'; placed++; }
    }
    var seg = function (col, extra) { var o = ''; for (var k = 1; k < g.D.length; k++) o += '<line x1="' + g.D[k - 1][0].toFixed(1) + '" y1="' + g.D[k - 1][1].toFixed(1) + '" x2="' + g.D[k][0].toFixed(1) + '" y2="' + g.D[k][1].toFixed(1) + '" stroke="' + col + '" stroke-width="' + (g.wd[k] + extra).toFixed(1) + '" stroke-linecap="round"/>'; return o; };
    out += seg(pal.fl, 14) + seg(pal.fair, 0);
    var hp = g.D[g.D.length - 1], t0 = g.D[0], gr = g.greenM * g.scale;
    out += '<circle cx="' + hp[0].toFixed(1) + '" cy="' + hp[1].toFixed(1) + '" r="' + gr.toFixed(1) + '" fill="' + pal.green + '" stroke="' + pal.ge + '" stroke-width="2.5"/>';
    out += '<rect x="' + (t0[0] - 15).toFixed(1) + '" y="' + (t0[1] - 3).toFixed(1) + '" width="30" height="10" rx="2" fill="' + pal.tee + '" stroke="' + pal.ge + '"/>';
    return (CH_MAPCACHE[key] = out);
  }
  /** 홀컵·깃발은 지도 위에 코드로 얹음(배경에 굽지 않음) */
  function chPin(g) { var hp = g.D[g.D.length - 1]; return '<circle cx="' + hp[0].toFixed(1) + '" cy="' + hp[1].toFixed(1) + '" r="2.2" fill="#10261a"/><line x1="' + hp[0].toFixed(1) + '" y1="' + hp[1].toFixed(1) + '" x2="' + hp[0].toFixed(1) + '" y2="' + (hp[1] - 20).toFixed(1) + '" stroke="#fff" stroke-width="1.4"/><path d="M' + hp[0].toFixed(1) + ' ' + (hp[1] - 20).toFixed(1) + 'l11 4-11 4z" fill="#e24b4a"/>'; }
  function chHoleOf(st) { return CHC.S.holes[Math.min(st.i, CHC.S.holes.length - 1)]; }
  function chGeomOf(h) { return Engine.ch.geom(h.layout_id, h.dist); }
  /** 카메라: 그린 안이면 그린 확대, PAR6은 공을 따라가며 확대, 그 외는 전체 */
  function chViewBox(g, h, d) {
    var hp = g.D[g.D.length - 1], rem = Engine.ch.remain(g, d), b = Engine.ch.xy(g, d.s, d.lat), asp = g.H / 300, w, hh;
    if (rem <= g.greenM) { w = 120; hh = w * asp; return { vb: (hp[0] - w / 2).toFixed(1) + ' ' + (hp[1] - hh / 2).toFixed(1) + ' ' + w + ' ' + hh.toFixed(1), z: 0.4, green: true }; }
    if (h.par >= 6) { w = 190; hh = w * asp; var x = Math.max(0, Math.min(300 - w, b.x - w / 2)), y = Math.max(0, Math.min(g.H - hh, b.y - hh / 2)); return { vb: x.toFixed(1) + ' ' + y.toFixed(1) + ' ' + w + ' ' + hh.toFixed(1), z: 0.65, green: false }; }
    return { vb: '0 0 300 ' + g.H.toFixed(1), z: 1, green: false };
  }
  function chOverlayHtml(g, d, z) {
    var trail = CHC.trails[d.i] || [], tee = Engine.ch.xy(g, 0, 0), line = 'M' + tee.x.toFixed(1) + ' ' + tee.y.toFixed(1), out = '', i;
    for (i = 0; i < trail.length; i++) line += 'L' + trail[i][0].toFixed(1) + ' ' + trail[i][1].toFixed(1);
    out += chPin(g) + '<path d="' + line + '" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="' + (1.6 * z) + '" stroke-dasharray="' + (5 * z) + ' ' + (4 * z) + '"/>';
    for (i = 0; i < trail.length; i++) out += '<circle cx="' + trail[i][0].toFixed(1) + '" cy="' + trail[i][1].toFixed(1) + '" r="' + (5 * z) + '" fill="#12261d" stroke="#F6C445" stroke-width="' + (1.2 * z) + '"/><text x="' + trail[i][0].toFixed(1) + '" y="' + (trail[i][1] + 3.4 * z).toFixed(1) + '" font-size="' + (9 * z) + '" text-anchor="middle" fill="#fff">' + (i + 1) + '</text>';
    var b = Engine.ch.xy(g, d.s, d.lat);
    return out + '<circle id="chBall" cx="' + b.x.toFixed(1) + '" cy="' + b.y.toFixed(1) + '" r="' + (4 * z) + '" fill="#fff" stroke="#111" stroke-width="' + (1.2 * z) + '"/>';
  }
  /** 임시 골퍼(코드로 그림). GOLFER_IMAGES=true로 GPT 이미지(golfer_{m|f}_{driver|iron|putter}_{back|impact|finish}.webp)를 쓰면 교체 */
  function chGolferSrc(gen, ck, pose) { return asset('golfer_' + (gen === 'F' ? 'f' : 'm') + '_' + ck + '_' + (pose === 'idle' ? 'impact' : pose) + '.png'); }
  function chPreload(gen) { ['driver', 'iron', 'putter'].forEach(function (c) { ['back', 'impact', 'finish'].forEach(function (p) { var im = new Image(); im.src = chGolferSrc(gen, c, p); }); }); }
  function chGolfer(gen, club, pose) {
    var f = gen === 'F', ck = { DRIVER: 'driver', IRON: 'iron', PUTTER: 'putter' }[club] || 'iron';
    if (APP_CONFIG.GOLFER_IMAGES) return '<img class="gimg" src="' + chGolferSrc(f ? 'F' : 'M', ck, pose) + '" alt="">';
    var Lg = { DRIVER: 40, IRON: 34, PUTTER: 24 }[club] || 34, putt = club === 'PUTTER';
    var ang = { idle: 20, back: putt ? 38 : 150, impact: -4, finish: putt ? -42 : -150 }[pose], lean = pose === 'finish' ? -7 : pose === 'back' ? 5 : 0;
    var hair = f ? '<path d="M21 12q0-10 10-9 8 1 8 9z" fill="#5a3b2a" stroke="#111" stroke-width="1.6"/><path d="M38 7q10 3 6 17-5-5-6-11z" fill="#5a3b2a" stroke="#111" stroke-width="1.6"/><path d="M20 9q10-5 20 0v3H20z" fill="#fff" stroke="#111" stroke-width="1.4"/>'
      : '<path d="M21 10q0-9 10-8 8 1 8 8z" fill="#3b2a22" stroke="#111" stroke-width="1.6"/><path d="M20 9q10-6 20 0v2H20z" fill="#2f6b4a" stroke="#111" stroke-width="1.4"/>';
    var legs = f ? '<path d="M21 44h20l3 10H18z" fill="#fff" stroke="#111" stroke-width="2"/><path d="M24 54v18M38 54v18" stroke="#111" stroke-width="5"/>' : '<path d="M23 46v26M37 46v26" stroke="#111" stroke-width="5.5"/>';
    return '<svg viewBox="0 0 64 78" width="100%" height="100%"><g transform="rotate(' + lean + ' 31 72)"><circle cx="30" cy="13" r="8" fill="#f2c9a0" stroke="#111" stroke-width="2"/>' + hair +
      '<path d="M21 25q10-6 20 0l-1 21H22z" fill="#4CC38A" stroke="#111" stroke-width="2"/>' + legs +
      '<g transform="rotate(' + ang + ' 31 34)"><line x1="31" y1="34" x2="31" y2="' + (34 + Lg) + '" stroke="#e8edf0" stroke-width="3" stroke-linecap="round"/><rect x="26" y="' + (32 + Lg) + '" width="11" height="5" rx="2" fill="#555" stroke="#111"/></g></g></svg>';
  }
  function chPose() { var el = document.getElementById('chGolfer'); if (!el || !CHC.S) return; el.innerHTML = chGolfer(CHC.S.gender, CHC.club || 'IRON', CHC.pose); }
  function chClone(o) { return JSON.parse(JSON.stringify(o)); }
  /** 서버가 확정한 로그를 처음부터 다시 재생해 홀별 공 궤적을 복원(새로고침·이어 하기) */
  function chReplay(S0, log) {
    var st = Engine.ch.start(M, S0), trails = [[], [], []], hist = {};
    log.forEach(function (e) {
      if (e.p === null) return; // 컨시드 샷은 앞선 샷에서 자동으로 이어짐
      var hi = st.i, o = Engine.ch.shot(M, S0, st, e.p); if (o.error) return;
      o.evs.forEach(function (ev) { var g = chGeomOf(S0.holes[hi]), b = Engine.ch.xy(g, ev.to.s, ev.to.lat); if (!ev.conceded) trails[hi].push([b.x, b.y]); });
      st = o.st; hist[st.n_shot] = JSON.stringify(st);
    });
    return { st: st, trails: trails, hist: hist };
  }
  function chAdopt(round) {
    CHC.r = round; CHC.S = round.setup; if (APP_CONFIG.GOLFER_IMAGES) chPreload(round.setup.gender); var rp = chReplay(round.setup, round.state.log || []);
    CHC.st = round.state; CHC.trails = rp.trails; CHC.hist = rp.hist; CHC.disp = chClone(round.state); CHC.unsent = []; CHC.syncErr = false; CHC.anim = null;
    CHC.phase = 'ready'; CHC.pose = 'idle'; CHC.holeEnd = null; CHC.club = null;
    S.challenge = round.status === 'ACTIVE' || round.status === 'RESULT' ? { round_id: round.round_id, status: round.status } : null;
  }
  function chEnter(round) {
    chAdopt(round);
    if (round.status === 'ACTIVE') go(round.state.n_shot === 0 ? 'chReady' : 'chPlay');
    else go('chResult');
  }
  // ---- 남은 횟수: 매일 기본 2회(한국 시간 00:00 초기화) → 다 쓰면 누적 이용권(최대 10장) 1장씩 ----
  function chChancesNow() {
    var c = S.chances || { basic_total: 2, basic_used: 0, tickets: 0, ticket_max: 10, date: '' }, today = new Date(now() + 9 * 3600000).toISOString().slice(0, 10), used = c.date === today ? c.basic_used : 0;
    return { left: c.unlimited ? c.basic_total : Math.max(0, c.basic_total - used), total: c.basic_total, tickets: c.tickets || 0, max: c.ticket_max || 10, unlimited: !!c.unlimited };
  }
  function chChanceText(c) { return '오늘 기본 ' + c.left + '/' + c.total + '회 · 이용권 ' + c.tickets + '장'; }
  // ---- 던전 탭 카드 ----
  function chCardHtml() {
    var cn = chChancesNow(), noChance = !cn.unlimited && cn.left <= 0 && cn.tickets <= 0;
    var c = S.challenge, txt = c ? (c.status === 'RESULT' ? '지난 원정의 보상을 선택해 주세요' : '진행 중인 원정이 있어요 · 이어서 칠 수 있어요') : noChance ? '오늘 기본 ' + cn.total + '회 완료 · 일일 미션 올클리어로 이용권 +1' : chChanceText(cn) + ' · 연속 3홀 약 3~5분',
      btn = c ? (c.status === 'RESULT' ? '보상 선택하기' : '이어 하기') : noChance ? '일일 미션 보기' : cn.left <= 0 && !cn.unlimited ? '이용권 1장으로 시작' : '3홀 챌린지 시작', act0 = noChance && !c ? 'missions' : 'chOpen';
    return '<div class="card chcard">' + (APP_CONFIG.CH_IMAGES ? '<img class="chbanner" src="' + asset('ch_banner.png') + '" alt="">' : '') + '<div class="row" style="justify-content:flex-start;gap:12px">' + (APP_CONFIG.CH_IMAGES ? '' : '<div class="chico">' + chGolfer(S.member.gender === 'F' ? 'F' : 'M', 'DRIVER', 'impact') + '</div>') + '<div style="flex:1"><b style="font-size:17px">3홀 챌린지</b><p class="sub">내 손끝의 샷이 캐릭터의 공격으로!</p><p class="small">' + txt + '</p>' + (!c && !chSeen() ? '<p class="small"><b style="color:var(--gold,#d9a441)">오늘 할 일</b> · 연습 3샷으로 방법 익히기 <button class="chip" data-a="chPractice">연습하기</button></p>' : '') + '</div></div>' +
      '<button class="btn gold" data-a="' + act0 + '">' + btn + '</button></div>';
  }
  var _dungeonCh = SCREENS.dungeon;
  SCREENS.dungeon = function (p) {
    var html = _dungeonCh(p), mark = '<span class="simbadge">체험 레이드</span></div>', k = html.indexOf(mark);
    if (k >= 0) return html.slice(0, k + mark.length) + chCardHtml() + html.slice(k + mark.length);
    return html.replace('<div class="scroll">', '<div class="scroll">' + chCardHtml());
  };
  A.chOpen = function () {
    if (CHC.loading) return; CHC.loading = true;
    Api.call('challengeStatus', {}, { read: true }).then(function (res) {
      CHC.loading = false;
      if (!res.ok) { toast(res.error.message); return; }
      if (res.data.chances) S.chances = res.data.chances;
      if (res.data.round) chEnter(res.data.round); else go('chIntro');
    });
  };
  // ---- 연습 3샷(첫 이용 안내): 서버 저장·횟수 차감·보상·미션 없음, 한 홀만 ----
  var CH_COACH = [
    { sel: '.ch-gauge', text: ['게이지가 움직여요', '가운데(노란 칸)에 맞춰 [임팩트!]를 눌러요'] },
    { sel: '.ch-info', text: ['클럽·남은 거리·타수를 확인해요', '타수가 적을수록 홀 종료 공격이 커져요'] },
    { sel: '#chBoss', text: ['샷마다 보스를 공격해요', '연습 3샷은 횟수·보상이 없어요'], face: 'pino_cheer' }
  ];
  function chSeen() { return !!(S.tutorial && S.tutorial.ch_guide_seen); }
  var chPrev = null;
  A.chPractice = function () {
    var j = mainJob(), r0 = { round_id: 'PRACTICE', status: 'ACTIVE' }, setup = Engine.ch.setup(M, { seed: 'PRACTICE-' + now(), gender: S.member.gender === 'F' ? 'F' : 'M', jobId: j, cp: cpOf(j), tier: 1 });
    setup.look = lookOf(j); setup.holes = setup.holes.slice(0, 1);
    chPrev = S.challenge; r0.setup = setup; r0.state = Engine.ch.start(M, setup);
    chAdopt(r0); S.challenge = chPrev; CHC.practice = true; CHC.coach = 0; go('chPlay');
  };
  function chPracticeLeave() { CHC.practice = false; CHC.coach = null; CHC.r = null; S.challenge = chPrev; }
  function chPracticeEnd() {
    cancelAnimationFrame(CHC.raf); chPracticeLeave(); CHC.phase = 'ready'; CHC.holeEnd = null;
    if (S.tutorial && !S.tutorial.ch_guide_seen) { S.tutorial.ch_guide_seen = new Date(now()).toISOString(); act('raidGuideSeen', { kind: 'ch' }); }
    go('dungeon');
    popup = { type: 'confirm', title: '연습 끝!', text: '이제 3홀 챌린지를 시작해 볼까요? 본 게임은 3홀을 이어서 치고, 끝나면 재료를 골라 받아요.', yes: '소개 보기', no: '나중에', run: function () { go('chIntro'); } }; render();
  }
  A.chCoachNext = function () { if (CHC.coach < CH_COACH.length - 1) { CHC.coach++; render(); } else A.chCoachEnd(); };
  A.chCoachEnd = function () { CHC.coach = null; render(); };
  // ---- 소개 / 준비 ----
  SCREENS.chIntro = function () {
    return dgScreen('<div class="row"><b style="font-size:20px">3홀 챌린지</b><span class="simbadge">게임용 가상 샷</span></div>' +
      '<p class="sub" style="text-align:center">내 손끝의 샷이 캐릭터의 공격으로!</p>' +
      '<ol class="gsflow"><li><span class="k">1</span><b>가운데에 맞춰 임팩트</b></li><li style="animation-delay:.3s"><span class="k">2</span><b>내 캐릭터가 보스를 공격</b></li><li style="animation-delay:.6s"><span class="k">3</span><b>원하는 재료를 골라 받기</b></li></ol>' +
      '<p class="small">연속 3홀 · 약 3~5분 · 제한시간 없음 · 실제 GS 라운드 기록과는 별개예요</p>' +
      '<div class="card"' + (chSeen() ? '' : ' style="border-color:var(--gold,#d9a441)"') + '><div class="row"><b>' + (chSeen() ? '연습해 보기' : '처음이라면 연습 3샷부터') + '</b><button class="chip' + (chSeen() ? '' : ' on') + '" data-a="chPractice">연습하기</button></div><p class="small">한 홀만 3샷 · 횟수·보상·미션과 무관해요</p></div>' +
      '<div class="card"><div class="row"><b>' + chChanceText(chChancesNow()) + '</b><span class="small">이용권 최대 ' + chChancesNow().max + '장</span></div><p class="small">매일 00:00(한국 시간)에 기본 2회가 새로 생겨요. 기본을 다 쓰면 이용권이 1장씩 쓰이고, 이용권은 일일 미션 올클리어로 받아요.</p></div>' +
      '<div style="flex:1"></div>' + (function () { var cn = chChancesNow(), none = !cn.unlimited && cn.left <= 0 && cn.tickets <= 0; return none ? '<button class="btn gold" data-a="missions">일일 미션 보기</button>' : '<button class="btn gold" data-a="chStart"' + (CHC.loading ? ' disabled' : '') + '>' + (CHC.loading ? '준비 중…' : cn.left <= 0 && !cn.unlimited ? '이용권 1장으로 시작' : '3홀 시작') + '</button>'; })());
  };
  A.chStart = function () {
    var cn = chChancesNow();
    if (!cn.unlimited && cn.left <= 0 && cn.tickets <= 0) { toast('오늘 기본 ' + cn.total + '회를 모두 했어요 · 일일 미션 올클리어로 이용권을 받을 수 있어요'); return; }
    if (!cn.unlimited && cn.left <= 0) { popup = { type: 'confirm', title: '이용권을 사용할까요?', text: '오늘 기본 ' + cn.total + '회를 모두 써서 이용권 1장을 사용해요. (남은 이용권 ' + (cn.tickets - 1) + '장)', yes: '사용하고 시작', no: '취소', run: chDoStart }; render(); return; }
    chDoStart();
  };
  function chDoStart() {
    if (CHC.loading) return; CHC.loading = true; render();
    act('challengeStart', {}).then(function (res) {
      CHC.loading = false;
      if (res.ok && res.data.chances) S.chances = res.data.chances;
      if (!res.ok && res.error.chances) { S.chances = res.error.chances; toast(res.error.message); render(); return; }
      if (!res.ok) { if (res.error.round) { toast(res.error.message); chEnter(res.error.round); return; } toast(res.error.message); render(); return; }
      chEnter(res.data.round);
    });
  };
  SCREENS.chReady = function () {
    var S0 = CHC.S; if (!S0) return SCREENS.dungeon();
    var zone = M.diffZones.filter(function (z) { return z.zone === S0.zone; })[0], reg = IX.region[S0.region_id], boss = IX.boss[S0.boss_id], rs = S0.settings;
    var holes = S0.holes.map(function (h) { return '<div class="chhole"><b>' + h.hole + 'H</b><span>PAR ' + h.par + '</span><span>' + h.dist + 'm</span><em>' + esc(Engine.ch.layout(h.layout_id).name) + '</em></div>'; }).join('');
    return dgScreen('<div class="row"><b style="font-size:20px">원정 준비</b><span class="simbadge">게임용 가상 샷</span></div>' +
      '<div class="bossbox"><img src="' + bossImg(S0.boss_id) + '" alt="" onerror="this.remove()"><div class="bossname">' + esc(boss.name) + '</div></div>' +
      '<ol class="gsflow"><li><span class="k">코스</span><b>' + esc(S0.course_name) + (reg ? ' <span class="reg">' + esc(reg.name) + '</span>' : '') + '</b></li>' +
      '<li style="animation-delay:.3s"><span class="k">대상 3홀 (실제 코스 기준)</span><div class="chholes">' + holes + '</div><span class="small">지도는 게임용 레이아웃이에요 · 실제 코스 지도가 아니에요</span></li>' +
      '<li style="animation-delay:.6s"><span class="k">라운드 설정</span><div class="fv"><span class="rsets">' + Object.keys(rs).map(function (k) { return '<span><i>' + esc(k) + '</i><em>' + esc(rs[k]) + '</em></span>'; }).join('') + '</span></div></li>' +
      '<li style="animation-delay:.9s"><span class="k">난이도</span><b>' + esc(S0.zone) + ' · ' + esc(zone.bossRank) + ' 보스</b><span class="small">점수 ' + S0.diff_score + ' · 보스 HP ' + fmt(S0.boss_hp) + ' · 최고 보상 ' + GRADE_NAME[zone.maxRewardGrade] + '</span></li></ol>' +
      '<div style="flex:1"></div><button class="btn gold" data-a="chGo">티샷 시작</button><button class="small" data-a="chAbortAsk" style="padding:8px">원정 포기 (보상 없음)</button>');
  };
  A.chGo = function () { go('chPlay'); };
  A.chAbortAsk = function () {
    popup = { type: 'confirm', title: '원정을 포기할까요?', text: '포기하면 이번 원정의 보상을 받을 수 없어요.', yes: '포기하기', no: '계속하기', run: function () {
      act('challengeFinish', { round_id: CHC.r.round_id, abort: true }).then(function (res) { if (res.ok) { S.challenge = null; CHC.r = null; go('dungeon'); } else toast(res.error.message); });
    } }; render();
  };
  // ---- 플레이 ----
  function chGaugeBg() {
    var c = chCfg().cut, pc = function (v) { return (50 - v * 50).toFixed(1); }, pe = function (v) { return (50 + v * 50).toFixed(1); };
    return 'linear-gradient(90deg,#b8474a 0 ' + pc(c[2]) + '%,#d9a441 ' + pc(c[2]) + '% ' + pc(c[1]) + '%,#7bc96f ' + pc(c[1]) + '% ' + pc(c[0]) + '%,#ffe27a ' + pc(c[0]) + '% ' + pe(c[0]) + '%,#7bc96f ' + pe(c[0]) + '% ' + pe(c[1]) + '%,#d9a441 ' + pe(c[1]) + '% ' + pe(c[2]) + '%,#b8474a ' + pe(c[2]) + '% 100%)';
  }
  function chHud(d, h, g) {
    var C = chCfg(), rem = Engine.ch.remain(g, d), club = d.done ? 'PUTTER' : Engine.ch.club(C, h.par, d.strokes, rem, g.greenM);
    return { club: club, rem: rem, clubName: { DRIVER: '드라이버', IRON: '아이언', PUTTER: '퍼터' }[club] };
  }
  SCREENS.chPlay = function () {
    var S0 = CHC.S; if (!S0 || !CHC.disp) return SCREENS.dungeon();
    var d = CHC.disp, h = chHoleOf(d), g = chGeomOf(h), hud = chHud(d, h, g), cam = chViewBox(g, h, d), boss = IX.boss[S0.boss_id];
    CHC.club = hud.club;
    var hpPct = Math.max(0, d.hp / S0.boss_hp * 100), look = S0.look || { stage: 0, set: 0 };
    var hole = CHC.holeEnd ? '<div class="ch-holecard"><b class="hr ' + CHC.holeEnd.result_key + '">' + CHC.holeEnd.hole + 'H ' + esc(CHC.holeEnd.result) + '</b><p>PAR ' + CHC.holeEnd.par + ' · ' + CHC.holeEnd.strokes + '타' + (CHC.holeEnd.conceded ? ' (컨시드)' : '') + (CHC.holeEnd.capped ? ' · 홀이 끝났어요' : '') + '</p>' +
      '<p class="small">샷 공격 ' + fmtR(CHC.holeEnd.shot_damage) + ' + 홀 종료 공격 ' + fmtR(CHC.holeEnd.E) + (CHC.holeEnd.sp_used ? ' · 특수공격 ×' + CHC.holeEnd.sp_mult : '') + '</p>' +
      '<button class="btn gold" data-a="chNext">' + (CHC.practice ? '연습 끝내기' : CHC.st.done ? '결과 보기' : '다음 홀') + '</button></div>' : '';
    var btnTxt = CHC.holeEnd ? '' : CHC.phase === 'swing' ? '임팩트!' : '샷 준비';
    return '<div class="screen ch">' + (hiddenOn() ? '<div class="hidden-zone" data-a="chHidden"></div>' : '') +
      '<div class="ch-head"><button class="ch-x" data-a="chExit" aria-label="나가기">‹</button><b>' + h.hole + 'H · PAR ' + h.par + '</b><span>' + (Math.min(d.i, 2) + 1) + '/3 · ' + h.dist + 'm (' + S0.tee + ')</span><span class="save' + (CHC.syncErr ? ' err' : '') + '" id="chSave">' + (CHC.syncErr ? '저장 실패' : CHC.unsent.length ? '저장 중…' : '저장됨') + '</span></div>' +
      '<div class="ch-bosswrap"><div class="bossbox raid" id="chBoss"><div class="bossfig"><img class="bidle" src="' + bossImg(boss.id) + '" alt="" onerror="this.remove()"><img class="bhit" src="' + bossImg(boss.id, true) + '" alt="" onerror="this.remove()"></div><div class="fxlayer" id="chFx"></div>' +
      '<div class="ch-rpg" id="chRpg">' + charPic(S0.job_id, look, 'idle', 'ch-rpgpic') + '</div><div class="ch-beam" id="chBeam"></div></div>' +
      '<div class="ch-hp"><div class="row"><b id="chHpTxt">HP ' + fmtR(Math.max(0, d.hp)) + ' / ' + fmt(S0.boss_hp) + '</b><span class="small" id="chSpTxt">SP ' + Math.round(d.sp) + '/100 · 자동 사용</span></div><div class="bar hp"><i id="chHpBar" style="width:' + hpPct + '%"></i></div><div class="bar sp thin"><i id="chSpBar" style="width:' + Math.min(100, d.sp) + '%"></i></div></div></div>' +
      '<div class="ch-map"><svg class="ch-svg" id="chSvg" viewBox="' + cam.vb + '">' + chMapStatic(h, chRegion()) + '<g id="chOv">' + chOverlayHtml(g, d, cam.z) + '</g></svg>' +
      '<div class="ch-vd" id="chVd"></div><span class="ch-zoom" id="chZoom" style="display:' + (cam.green ? 'block' : 'none') + '">그린 확대</span><span class="ch-maptag">간략 지도 · 게임용 레이아웃</span>' +
      '<div class="ch-golfer" id="chGolfer">' + chGolfer(S0.gender, hud.club, CHC.pose) + '</div>' + hole + '</div>' +
      '<div class="ch-bot"><div class="row ch-info"><b id="chClub">' + hud.clubName + '</b><span id="chRem">남은 ' + Math.round(hud.rem) + 'm</span><span id="chStk">' + d.strokes + '타 / 최대 ' + h.par * chCfg().maxMult + '</span></div>' +
      '<div class="ch-gauge" style="background:' + chGaugeBg() + '"><i class="ln"></i><i class="cu" id="chCu" style="left:' + (CHC.phase === 'swing' ? CHC.p * 100 : 50) + '%"></i></div>' +
      (CHC.holeEnd ? '<button class="ch-btn" disabled>홀 종료</button>' : '<button class="ch-btn" id="chBtn" data-a="chBtn">' + btnTxt + '</button>') +
      '<div class="row ch-sub"><button class="small" data-a="chSpeed" id="chSpeed">게이지 속도 · ' + (CHC.speed === 'fast' ? '보통' : '천천히') + '</button><span class="small">' + (CHC.syncErr ? '<button class="small" data-a="chRetry" style="color:var(--bad)">저장 다시 시도</button>' : '가운데에 가까울수록 좋은 샷') + '</span></div></div></div>';
  };
  // 게이지: 실제 경과 시간으로 한쪽 끝→반대쪽 끝(보통 2.4초·천천히 3.2초) 왕복. 입력 전까지 계속, 시간 초과 실패 없음
  function chPAt(t) { var dur = CHC.speed === 'fast' ? 2400 : 3200, k = ((t - CHC.t0) / dur) % 2; return k > 1 ? 2 - k : k; }
  function chTick(t) {
    if (CHC.phase !== 'swing') return;
    var p = chPAt(t);
    CHC.p = p; var cu = document.getElementById('chCu'); if (cu) cu.style.left = (p * 100) + '%';
    CHC.raf = requestAnimationFrame(chTick);
  }
  A.chSpeed = function () { CHC.speed = CHC.speed === 'fast' ? 'slow' : 'fast'; try { localStorage.setItem('rf_ch_speed', CHC.speed); } catch (e) {} var el = document.getElementById('chSpeed'); if (el) el.textContent = '게이지 속도 · ' + (CHC.speed === 'fast' ? '보통' : '천천히'); };
  A.chBtn = function () {
    if (CHC.phase === 'ready') {
      if (CHC.syncErr) { A.chRetry(); return; }
      if (CHC.unsent.length > 1) { toast('저장 중이에요. 잠시만요'); return; }
      CHC.phase = 'swing'; CHC.pose = 'back'; CHC.t0 = performance.now(); chPose(); var b = document.getElementById('chBtn'); if (b) b.textContent = '임팩트!';
      CHC.raf = requestAnimationFrame(chTick);
    } else if (CHC.phase === 'swing') chImpact();
  };
  // 앱이 가려지면 일시정지: 확정 전 게이지는 샷 준비 상태로 돌아간다(이미 확정된 샷은 다시 판정하지 않음)
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && CHC.phase === 'swing') { cancelAnimationFrame(CHC.raf); CHC.phase = 'ready'; CHC.pose = 'idle'; if (view.name === 'chPlay') render(); }
  });
  function chSay(text, qi) { var v = document.getElementById('chVd'); if (!v) return; v.textContent = text; v.className = 'ch-vd q' + qi; void v.offsetWidth; v.classList.add('go'); }
  function chImpact() {
    cancelAnimationFrame(CHC.raf);
    var C = chCfg(), S0 = CHC.S, p = Math.round(chPAt(performance.now()) * 10000) / 10000, no = CHC.st.n_shot, before = { i: CHC.st.i, s: CHC.st.s, lat: CHC.st.lat }, h = S0.holes[before.i], g = chGeomOf(h);
    CHC.phase = 'fly'; CHC.pose = 'impact'; chPose();
    var o = Engine.ch.shot(M, S0, CHC.st, p); if (o.error) { CHC.phase = 'ready'; return; }
    CHC.st = o.st; CHC.hist[o.st.n_shot] = JSON.stringify(o.st);
    CHC.unsent.push({ n: no, p: p }); chFlush(); var sv = document.getElementById('chSave'); if (sv) sv.textContent = '저장 중…';
    var gf = document.getElementById('chGolfer'); if (gf) { gf.classList.remove('fx'); void gf.offsetWidth; gf.classList.add('fx'); }
    chSay(C.qualName[o.evs[0].qi], o.evs[0].qi);
    var steps = o.evs.map(function (e, k) { return { to: e.to, dur: k ? 300 : 800 }; });
    setTimeout(function () { CHC.pose = 'finish'; chPose(); chFly(before, steps, o, g, h); }, 240); // 임팩트 → 피니시 자세, 공 이동
  }
  function chFly(from, steps, o, g, h) {
    var k = 0, cur = { s: from.s, lat: from.lat }, t0 = performance.now(), seg = steps[0], a = { s: cur.s, lat: cur.lat };
    var frame = function (t) {
      var u = Math.min(1, (t - t0) / seg.dur), e = 1 - Math.pow(1 - u, 3), s = a.s + (seg.to.s - a.s) * e, lat = a.lat + (seg.to.lat - a.lat) * e, b = Engine.ch.xy(g, s, lat), el = document.getElementById('chBall');
      if (el) { el.setAttribute('cx', b.x); el.setAttribute('cy', b.y); }
      if (u < 1) { requestAnimationFrame(frame); return; }
      k++; if (k < steps.length) { a = { s: seg.to.s, lat: seg.to.lat }; seg = steps[k]; t0 = performance.now(); requestAnimationFrame(frame); return; }
      finish();
    };
    var done = false, finish = function () { if (done) return; done = true; chLand(o, from, g, h); };
    setTimeout(finish, steps.reduce(function (sum, x) { return sum + x.dur; }, 0) + 250); // 화면이 가려져 프레임이 멈춰도 착지 처리는 이어서 진행
    requestAnimationFrame(frame);
  }
  function chLand(o, from, g, h) {
    var ev = o.evs[0], last = o.evs[o.evs.length - 1], b = Engine.ch.xy(g, ev.to.s, ev.to.lat);
    (CHC.trails[from.i] = CHC.trails[from.i] || []).push([b.x, b.y]);
    var d = chClone(o.st); if (o.hole_result) { d.i = from.i; d.s = last.to.s; d.lat = last.to.lat; d.strokes = o.hole_result.strokes; d.done = false; }
    CHC.disp = d;
    // 캐릭터 공격: 샷마다 보스 피격·피해 숫자·HP/SP 갱신(공격 연출이 게이지·버튼을 가리지 않게 상단 영역에서만)
    var fx = document.getElementById('chFx'), boss = document.getElementById('chBoss'), rpg = document.getElementById('chRpg'), beam = document.getElementById('chBeam');
    o.evs.forEach(function (e, i) { setTimeout(function () { spawnFloat(fx, '-' + fmtR(e.d), e.q === 'CRIT' ? 'crit' : e.q === 'STRONG' ? 'strong' : ''); }, i * 250); });
    if (boss) { boss.classList.remove('hit'); void boss.offsetWidth; boss.classList.add('hit'); setTimeout(function () { boss.classList.remove('hit'); }, 500); }
    if (rpg) { rpg.classList.add('atk'); setTimeout(function () { rpg.classList.remove('atk'); }, 520); }
    if (beam) { beam.classList.remove('go'); void beam.offsetWidth; beam.classList.add('go'); }
    var hp = document.getElementById('chHpBar'), ht = document.getElementById('chHpTxt'), sp = document.getElementById('chSpBar'), st2 = document.getElementById('chSpTxt');
    if (hp) hp.style.width = Math.max(0, o.st.hp / CHC.S.boss_hp * 100) + '%'; if (ht) ht.textContent = 'HP ' + fmtR(Math.max(0, o.st.hp)) + ' / ' + fmt(CHC.S.boss_hp);
    if (sp) sp.style.width = Math.min(100, o.st.sp) + '%'; if (st2) st2.textContent = 'SP ' + Math.round(o.st.sp) + '/100 · 자동 사용';
    if (o.evs.some(function (e) { return e.sp_auto; })) toast('특수공격 준비! 홀 종료 때 자동으로 써요');
    if (o.hole_result) setTimeout(function () { spawnFloat(fx, '홀 종료 -' + fmtR(o.hole_result.E), 'finish'); if (hp) hp.style.width = Math.max(0, o.st.hp / CHC.S.boss_hp * 100) + '%'; }, 650);
    setTimeout(function () {
      CHC.pose = 'idle';
      if (o.hole_result) { CHC.holeEnd = o.hole_result; CHC.phase = 'holeend'; render(); return; }
      if (CHC.practice && CHC.st.n_shot >= 3) { chPracticeEnd(); return; }
      CHC.phase = 'ready'; if (view.name === 'chPlay') render(); // 클럽·남은 거리·카메라(그린 확대) 갱신
    }, o.hole_result ? 900 : 380);
  }
  A.chNext = function () {
    if (CHC.practice) { chPracticeEnd(); return; }
    if (CHC.st.done) { CHC.holeEnd = null; CHC.phase = 'ready'; go('chResult'); return; }
    CHC.holeEnd = null; CHC.phase = 'ready'; CHC.pose = 'idle'; CHC.disp = chClone(CHC.st); render();
  };
  A.chExit = function () {
    popup = { type: 'confirm', title: CHC.practice ? '연습을 그만할까요?' : '원정에서 나갈까요?', text: CHC.practice ? '연습은 횟수·보상에 영향이 없어요. 언제든 다시 할 수 있어요.' : '지금까지 친 샷은 저장돼요. 나중에 이어서 할 수 있어요.', yes: '나가기', no: '계속하기', run: function () { cancelAnimationFrame(CHC.raf); CHC.phase = 'ready'; if (CHC.practice) chPracticeLeave(); go('dungeon'); } }; render();
  };
  // ---- 서버 저장(뒤에서 차례로). 연결이 끊기면 다음 샷을 막고 재시도를 안내 ----
  function chFlush() {
    if (CHC.practice) { CHC.unsent = []; return; } // 연습: 서버 저장 없음
    if (CHC.flushing || !CHC.unsent.length || !CHC.r) return;
    CHC.flushing = true;
    var it = CHC.unsent[0];
    Api.call('challengeShot', { round_id: CHC.r.round_id, shot_no: it.n, p: it.p }, { read: true }).then(function (res) {
      CHC.flushing = false;
      var sv = document.getElementById('chSave');
      if (!res.ok) {
        var c = res.error.code;
        if (c === 'NETWORK' || c === 'SERVER_ERROR' || c === 'BUSY') { CHC.syncErr = true; if (view.name === 'chPlay' && CHC.phase === 'ready') render(); else if (sv) { sv.textContent = '저장 실패'; sv.className = 'save err'; } return; }
        if (c === 'SESSION_EXPIRED') return;
        if (res.error.round) { toast('서버 기준으로 맞췄어요'); chAdopt(res.error.round); go(res.error.round.status === 'ACTIVE' ? 'chPlay' : 'chResult'); return; }
        toast(res.error.message); CHC.unsent = []; return;
      }
      CHC.unsent.shift(); CHC.syncErr = false;
      var rd = res.data.round, n = rd.state.n_shot;
      if (CHC.hist[n] && CHC.hist[n] !== JSON.stringify(rd.state)) { // 서버 값이 기준
        if (window.console) console.warn('challenge state mismatch at shot ' + n);
        if (!CHC.unsent.length && CHC.phase === 'ready') { chAdopt(rd); if (view.name === 'chPlay') render(); return; }
      }
      if (rd.status !== 'ACTIVE' || rd.reward) { CHC.r = rd; S.challenge = { round_id: rd.round_id, status: rd.status }; }
      else CHC.r = Object.assign({}, CHC.r, { state: rd.state });
      if (sv && !CHC.unsent.length) { sv.textContent = '저장됨'; sv.className = 'save'; }
      if (CHC.unsent.length) chFlush(); else if (view.name === 'chResult') render();
    });
  }
  A.chRetry = function () { CHC.syncErr = false; if (view.name === 'chPlay') render(); chFlush(); };
  // 숨김 기능 계정(회원DB '숨김 기능' = Y)만: 우측 상단 3연속 터치 → 남은 샷을 모두 완벽한 샷으로 확정(시연용). 서버에서도 검사
  A.chHidden = function () {
    var t = Date.now(); CHC.taps = CHC.taps.filter(function (x) { return t - x < 1500; }); CHC.taps.push(t);
    if (CHC.taps.length < 3) return; CHC.taps = [];
    if (CHC.practice || (CHC.phase !== 'ready' && CHC.phase !== 'holeend')) return;
    if (CHC.unsent.length || CHC.flushing) { toast('저장 중이에요. 잠시 뒤 다시 눌러 주세요'); return; }
    Api.call('challengeAuto', { round_id: CHC.r.round_id }).then(function (res) {
      if (!res.ok) { toast(res.error.message); return; }
      chAdopt(res.data.round); go('chResult');
    });
  };
  // ---- 결과·재료 선택 ----
  function chProbText() {
    var C = chCfg(), T = CHC.S ? CHC.S.tier : 1;
    return '<div class="card"><b>확률 안내</b><p class="small">보상 등급(' + GRADE_NAME[1] + '~' + GRADE_NAME[5] + ')에 따라 선택 재료 수량이 정해져요: ' + C.matQty.join('·') + '개. 선택 재료 단계는 목표 단계 ' + T + '단계 70% / 한 단계 아래 30%(1단계는 100%)예요.</p>' +
      '<p class="small">특수 재료는 4번째 후보로 라운드당 최대 1종·1개가 나올 수 있고, 후보 중 1개만 받아요. 단계 조건(파편 3단계 이상 · 결정 4단계 이상 · 핵 5단계)을 채워야 나와요.</p>' +
      '<p class="small">후보 등장 확률(일반/고급/희귀/영웅/전설) 파편 ' + C.special.map(function (x) { return (x[0] * 100).toFixed(2).replace(/\.?0+$/, ''); }).join('/') + '% · 결정 ' + C.special.map(function (x) { return (x[1] * 100).toFixed(2).replace(/\.?0+$/, '') || '0'; }).join('/') + '% · 핵 ' + C.special.map(function (x) { return (x[2] * 100).toFixed(2).replace(/\.?0+$/, '') || '0'; }).join('/') + '%</p></div>';
  }
  SCREENS.chResult = function () {
    var S0 = CHC.S, st = CHC.st; if (!S0 || !st || !st.done) return SCREENS.dungeon();
    var res = (CHC.r && CHC.r.result) || Engine.ch.result(M, S0, st), rw = CHC.r && CHC.r.reward, sel = CHC.r && CHC.r.selected, boss = IX.boss[S0.boss_id], g = res.grade;
    var rows = st.holes.map(function (x) { return '<div class="crow"><b class="rno hn">' + x.hole + 'H</b><span style="flex:1">PAR ' + x.par + ' · ' + x.strokes + '타 <b class="hr ' + x.result_key + '">' + esc(x.result) + '</b></span><span class="small">피해 ' + fmt(Math.round(x.damage)) + '</span></div>'; }).join('');
    var sc = res.diff === 0 ? '이븐파' : (res.diff > 0 ? '+' : '') + res.diff;
    var cands = '';
    if (!rw) cands = '<div class="card"><p class="sub">' + (CHC.syncErr ? '저장이 끊겼어요. 연결을 확인하고 다시 시도해 주세요.' : '보상을 확인하고 있어요…') + '</p>' + (CHC.syncErr ? '<button class="btn ghost" data-a="chRetry">다시 시도</button>' : '') + '</div>';
    else {
      cands = '<div class="card g' + g + '" style="border:2px solid var(--gc)"><b class="gname" style="font-size:18px">원정 결과 ' + esc(res.grade_name) + '</b><p class="sub">선택 재료 ' + rw.tier + '단계 · ' + (sel ? '받은 재료는 아래와 같아요' : '아래에서 1개를 선택하세요') + '</p>' +
        '<p class="small">' + (res.capped ? '피해 비율로는 ' + esc(res.grade_by_ratio) + '이지만 난이도 ' + res.zone + ' 구간 최고 등급이 적용됐어요' : '피해 비율 ' + Math.round(res.ratio * 100) + '%로 결정') + '</p>' +
        '<div class="chcands' + (rw.candidates.length > 3 ? ' n4' : '') + '">' + rw.candidates.map(function (c) {
          var m = IX.material[c.material_id], on = sel === c.key;
          return '<button class="chcand' + (c.special ? ' sp' : '') + (on ? ' on' : '') + '" data-a="chPick" data-key="' + c.key + '"' + (sel ? ' disabled' : '') + '>' + matIcon(c.material_id) + '<b>' + esc(m ? m.name : c.material_id) + '</b><span>×' + c.qty + (c.special ? ' · 특수' : '') + '</span></button>';
        }).join('') + '</div>' + (sel ? '' : '<p class="small">특수 재료를 고르면 이번 기본 재료는 받지 않아요. 선택은 한 번만 할 수 있어요.</p>') + '</div>';
    }
    return dgScreen('<b style="font-size:20px">3홀 챌린지 결과</b>' +
      '<div class="card"><div class="row"><b style="color:' + (res.killed_at ? 'var(--ok)' : 'var(--bad)') + '">' + (res.killed_at ? '보스 처치 · ' + res.killed_at + 'H' : '보스 생존') + '</b><span>' + esc(boss.name) + '</span></div>' +
      '<p class="sub">합계 ' + res.strokes + '타 (PAR ' + res.par + ' · ' + sc + ') · 피해 ' + fmt(res.total_damage) + ' · 피해 비율 ' + Math.round(res.ratio * 100) + '%</p>' +
      '<div class="small">' + esc(S0.course_name) + ' · ' + S0.start_hole + '~' + (S0.start_hole + 2) + 'H</div>' + rows + '</div>' + cands +
      '<button class="small" data-a="chProbs" style="padding:8px">확률 보기</button>' +
      (sel ? '<button class="btn gold" data-a="chDone">던전으로</button>' : '') + '<button class="btn ghost" data-a="chLink">GS 레이드 소개 보기</button>');
  };
  A.chPick = function (d) {
    if (CHC.busyPick || !CHC.r || CHC.r.selected) return; CHC.busyPick = true;
    var key = d.key, c = CHC.r.reward.candidates.filter(function (x) { return x.key === key; })[0];
    act('challengeChooseReward', { round_id: CHC.r.round_id, key: key }).then(function (res) {
      CHC.busyPick = false;
      if (!res.ok) { toast(res.error.message); if (res.error.round) { CHC.r = res.error.round; render(); } return; }
      CHC.r = res.data.round; S.materials = res.data.materials; S.wallet = res.data.wallet; S.challenge = null;
      var m = IX.material[c.material_id]; toast((m ? m.name : '재료') + ' ' + c.qty + '개를 받았어요'); render();
    });
  };
  POPUPS.chProbs = function () { return '<div class="overlay center"><div class="sheet"><b style="font-size:18px">3홀 챌린지 확률 안내</b>' + chProbText() + '<button class="btn ghost" data-a="close">닫기</button></div></div>'; };
  A.chProbs = function () { popup = { type: 'chProbs' }; render(); };
  A.chDone = function () { go('dungeon'); };
  A.chLink = function () { go('dungeon'); toast('던전 탭의 [스크린 라운드로 시작]에서 GS 레이드를 볼 수 있어요'); };

  /* ================= 새로고침해도 보던 화면 유지(30분) =================
   * 위로 당겨 새로고침하거나 앱을 다시 열어도 골프존앱 메인으로 돌아가지 않고 마지막 게임 화면(탭·스크롤)으로 이어진다.
   * 저장은 이 기기에만(localStorage): 화면 이름·단순 값 파라미터·스크롤. 팝업·레이드 진행·3홀 챌린지는 서버 상태로 이어 하므로 화면 이름만 기억 */
  var VK0 = null; try { VK0 = JSON.parse(localStorage.getItem('rf_view') || 'null'); } catch (e) {} // 처음 열 때의 값(메인 화면으로 가는 순간 지워지기 전에 읽어 둠)
  var VKEEP = { map: 1, courses: 1, craft: 1, items: 1, char: 1, rank: 1, dungeon: 1, hunt: 1, chIntro: 1, chReady: 1, chPlay: 1, chResult: 1 }, VKEEP_MS = 30 * 60000, vkTimer = 0;
  function vkSave(name, p) {
    try {
      if (!S || !S.member) return;
      if (VKEEP[name]) {
        var q = {}; Object.keys(p || {}).forEach(function (k) { var v = p[k]; if (v === null || ['string', 'number', 'boolean'].indexOf(typeof v) >= 0) q[k] = v; });
        localStorage.setItem('rf_view', JSON.stringify({ u: S.member.member_id, n: name, p: q, at: Date.now(), sc: 0 }));
      } else if (name === 'launcher' || name === 'login' || name === 'intro' || name === 'jobSelect') localStorage.removeItem('rf_view');
    } catch (e) {}
  }
  var _goKeep = go;
  go = function (name, p) { _goKeep(name, p); vkSave(name, p); };
  root.addEventListener('scroll', function (e) {
    if (!e.target.classList || !e.target.classList.contains('scroll') || vkTimer) return;
    vkTimer = setTimeout(function () { vkTimer = 0; try { var v = JSON.parse(localStorage.getItem('rf_view') || 'null'), sc = root.querySelector('.scroll'); if (v && sc && VKEEP[view.name]) { v.sc = Math.round(sc.scrollTop); v.at = Date.now(); localStorage.setItem('rf_view', JSON.stringify(v)); } } catch (x) {} }, 400);
  }, true);
  function vkRestore() {
    try {
      var v = VK0; VK0 = null;
      if (!v || !S || !S.member || v.u !== S.member.member_id || Date.now() - v.at > VKEEP_MS || S.member.intro_seen !== 'Y' || needJob()) return false;
      var n = v.n;
      if (/^ch[A-Z]/.test(n)) { if (S.challenge) A.chOpen(); else go(n === 'chIntro' ? 'chIntro' : 'dungeon'); return true; }
      if (n === 'hunt' && !S.hunt) n = 'map';
      if (n === 'rank') { A.rank(); return true; }
      go(n, v.p || {});
      if (v.sc) setTimeout(function () { var sc = root.querySelector('.scroll'); if (sc) sc.scrollTop = v.sc; }, 80);
      return true;
    } catch (e) { return false; }
  }

  // ---------------- 시작 ----------------
  // 서버 깨우기(첫 요청 지연 줄임) + 기준 데이터와 저장 데이터를 동시에 받기(v0.5 최적화)
  Api.warm();
  var saveP = Api.state.token ? Api.call('loadSave', {}, { read: true }) : null;
  fetch(APP_CONFIG.MASTER_URL).then(function (r) { return r.json(); }).then(function (m) {
    M = m; IX = Engine.index(M);
    if (!saveP) { go('login'); return; }
    saveP.then(function (res) {
      if (res.ok) { Api.state.version = res.save_version; setSave(res.data); go('launcher'); vkRestore(); dgRestore(); preloadLooks(); setTimeout(function () { missionRefresh(true); rankRefresh(1); }, 300); } else { popup = null; Api.logout(); go('login'); }
    });
  }, function () { root.innerHTML = '<div class="screen" style="padding:24px"><p>기준 데이터를 불러오지 못했어요. 새로고침해 주세요.</p></div>'; });
})();
