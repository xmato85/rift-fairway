/* 균열의 페어웨이 프로토타입 — 화면 (1차: 진입·사냥·제작·아이템·캐릭터·튜토리얼)
 * 화면ID는 화면설계서 v0.4와 같다. 계산은 engine.js, 저장은 api.js(서버)로 한다. */
(function () {
  var M = null, IX = null, S = null;            // master, index, save
  var view = { name: 'boot', p: {} }, popup = null, toastMsg = null, toastTimer = null, saveState = '';
  var offset = 0;                                // 서버 시각 - 기기 시각
  var root = document.getElementById('app');
  var JOBS = ['WAR', 'MAG', 'ARC', 'ROG'];
  var JOB_FILE = { WAR: 'war', MAG: 'mag', ARC: 'arc', ROG: 'rog' };
  var GRADE_NAME = { 1: '일반', 2: '고급', 3: '희귀', 4: '영웅', 5: '전설' };
  var FAM_NAME = { IRON: '철', LEATHER: '가죽', CLOTH: '천' };

  // ---------------- 공통 ----------------
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n || 0).toLocaleString('ko-KR'); }
  function now() { return Date.now() + offset; }
  function asset(name) { return APP_CONFIG.ASSET_DIR + name; }
  function img(name) { return '<img src="' + asset(name) + '" alt="" onerror="this.remove()">'; }
  function toast(msg) { toastMsg = msg; clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastMsg = null; render(); }, 2600); render(); }
  function go(name, p) { view = { name: name, p: p || {} }; popup = null; render(); var sc = root.querySelector('.scroll'); if (sc) sc.scrollTop = 0; }
  function job(id) { return IX.job[id]; }
  function mainJob() { return S.member.main_job_id || 'WAR'; }
  function charOf(j) { return S.characters.filter(function (c) { return c.job_id === j; })[0]; }
  function itemIcon(itemId, extra) {
    var it = IX.item[itemId], part = IX.part ? null : null;
    var pn = M.parts.filter(function (p) { return p.id === it.partId; })[0].name;
    return '<div class="icon g' + it.grade + '"' + (extra || '') + '>' + img('icon_eq_' + JOB_FILE[it.jobId] + '_' + it.partId.toLowerCase() + '.png') + '<span>' + pn + '</span></div>';
  }
  function matIcon(id) {
    var m = IX.material[id];
    return '<div class="icon g' + m.tier + '">' + img('icon_mat_' + m.family.toLowerCase() + '_' + m.tier + '.png') + '<span>' + esc(m.name.slice(0, 4)) + '</span></div>';
  }
  function cpOf(j) { return Engine.characterCp(M, j, S.items.filter(function (x) { return x.equipped_job_id; })); }

  // 쓰기 요청은 순서대로 하나씩(버전 충돌 방지)
  var queue = Promise.resolve();
  function act(action, payload, opts) {
    var run = function () {
      return Api.call(action, payload, opts).then(function (res) {
        if (!res.ok && res.error && res.error.code === 'VERSION_CONFLICT') { toast(res.error.message); return reload().then(function () { return res; }); }
        return res;
      });
    };
    var pr = queue.then(run, run); queue = pr.then(function () {}, function () {}); return pr;
  }
  function reload() {
    return Api.call('loadSave', {}, { read: true }).then(function (res) {
      if (res.ok) setSave(res.data);
      return res;
    });
  }
  function setSave(save) {
    S = save; offset = Date.parse(save.server_time) - Date.now();
  }
  Api.state.onSave = function (s) { saveState = s; var el = root.querySelector('.save'); if (el) { el.textContent = saveLabel(); el.className = 'save' + (s === 'error' ? ' err' : ''); } };
  Api.state.onExpired = function (msg) { popup = { type: 'expired', msg: msg }; render(); };
  function saveLabel() { return saveState === 'saving' ? '저장 중…' : saveState === 'saved' ? '저장됨' : saveState === 'error' ? '저장 실패' : ''; }

  // ---------------- 렌더 ----------------
  function render() {
    var html = SCREENS[view.name] ? SCREENS[view.name](view.p) : '';
    if (popup && POPUPS[popup.type]) html += POPUPS[popup.type](popup);
    if (toastMsg) html += '<div class="toast">' + esc(toastMsg) + '</div>';
    root.innerHTML = html;
  }
  function topbar() {
    var c = charOf(mainJob());
    return '<div class="topbar"><button class="home" data-a="home" aria-label="골프존 홈">⌂</button>' +
      '<div class="who">' + esc(job(mainJob()).name) + ' <b>' + fmt(c ? c.cp : 0) + '</b>' + (S.member.is_demo === 'Y' ? ' <span class="badge">시연 모드</span>' : '') + '</div>' +
      '<div class="gold">G ' + fmt(S.wallet.gold) + '</div><div class="save' + (saveState === 'error' ? ' err' : '') + '">' + saveLabel() + '</div></div>' +
      '<div class="hidden-zone" data-a="hidden"></div>';
  }
  function tabs(on) {
    return '<nav class="tabs">' + [['map', '사냥터'], ['craft', '제작'], ['items', '아이템'], ['char', '캐릭터'], ['dungeon', '던전']].map(function (t) {
      return '<button data-a="tab" data-v="' + t[0] + '" class="' + (on === t[0] ? 'on' : '') + '">' + t[1] + '</button>';
    }).join('') + '</nav>';
  }
  function gameScreen(tab, body) { return '<div class="screen">' + topbar() + '<div class="scroll">' + tutorialCoach() + body + '</div>' + tabs(tab) + '</div>'; }

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

    /* GZ-02 골프존앱 메인(추천탭) 런처 */
    launcher: function () {
      var apps = ['예약', '스코어', '레슨', '마켓', '이벤트', '골프장', '[게임]', '더보기'];
      return '<div class="screen gz"><div class="scroll" style="padding:20px">' +
        '<div class="row"><p style="font-size:22px;font-weight:700;color:#1F3F8F">GOLFZON</p><button class="chip" style="background:#E3E8DF;color:#1B2620" data-a="logout">로그아웃</button></div>' +
        '<p style="font-size:18px;font-weight:700">' + esc(S.member.nickname) + '님, 오늘도 굿샷!</p>' +
        '<div style="height:150px;border-radius:16px;background:linear-gradient(135deg,#2A1F5C,#13251C);color:#F3F5EE;padding:16px;display:flex;flex-direction:column;justify-content:flex-end"><p style="font-family:Black Han Sans;font-size:24px">균열의 페어웨이</p><p style="font-size:13px;opacity:.8">스크린 라운드가 레이드가 되는 방치형 RPG</p></div>' +
        '<div class="launcher">' + apps.map(function (a) {
          return a === '[게임]' ? '<div class="game" data-a="enterGame"><i></i><b style="color:#6A4BD8">게임</b></div>' : '<div><i></i>' + a + '</div>';
        }).join('') + '</div>' +
        '<p class="sub" style="color:#4A5650">추천탭 아이콘 [게임]을 누르면 게임이 열립니다</p>' +
        '</div></div>';
    },

    /* GM-00 인트로 웹툰(P0 축약 4컷 ①②⑦⑨) */
    intro: function () {
      var n = esc(S.member.nickname);
      var cuts = [
        ['webtoon_01.png', 'linear-gradient(#0B1712,#2A1F5C)', ['균열의 페어웨이']],
        ['webtoon_02.png', 'linear-gradient(#13251C,#2B4A3A)', [n + '님, 오늘도 스크린 앞에 섰습니다.', '"이 퍼트만 넣으면…"']],
        ['webtoon_07.png', 'linear-gradient(#2B4A3A,#6A4BD8)', ['"안녕! 나는 캐디 요정 피노야."', '"균열 너머 이 세계의 코스는 몬스터에게 점령당했어."']],
        ['webtoon_09.png', 'linear-gradient(#6A4BD8,#13251C)', ['"네 명의 너와 함께, 코스를 되찾으러 가자!"']]
      ];
      return '<div class="screen" style="position:relative"><button class="skip" data-a="introDone">건너뛰기 ›</button><div class="webtoon" data-scroll="intro">' +
        cuts.map(function (c, i) {
          return '<section class="cut' + (i === 0 ? ' in' : '') + '" style="background-image:url(' + asset(c[0]) + '),' + c[1] + '">' +
            (i === 0 ? '<h1 class="title" style="font-size:40px;text-align:center;margin-bottom:auto;margin-top:120px">균열의 페어웨이</h1>' : c[2].map(function (t) { return '<p>' + t + '</p>'; }).join('')) + '</section>';
        }).join('') +
        '<div style="padding:20px"><button class="btn purple" data-a="introDone">모험 시작</button></div></div></div>';
    },

    /* GM-01 사냥터 지역 지도 */
    map: function () {
      var pos = { METRO: [16, 18], GANGWON: [55, 10], CHUNGCHEONG: [12, 36], JEOLLA: [10, 56], GYEONGSANG: [52, 46], JEJU: [18, 78], OVERSEAS: [56, 70], VIRTUAL: [48, 86] };
      var cp = cpOf(mainJob());
      var pins = M.regions.map(function (r) {
        var open = M.courses.some(function (c) { return c.regionId === r.id && Engine.canEnterCourse(M, cp, c); });
        var p = pos[r.id];
        return '<button class="pin' + (open ? '' : ' lock') + '" style="left:' + p[0] + '%;top:' + p[1] + '%" data-a="region" data-v="' + r.id + '">' + esc(r.name) + ' ' + r.courseCount + (open ? '' : ' · 잠김') + '</button>';
      }).join('');
      return gameScreen('map',
        '<button class="btn gold" data-a="region" data-v="REC" data-coach="rec">지금 사냥 가능한 코스 보기</button>' +
        '<div class="map" style="background-image:url(' + asset('map_world.png') + '),radial-gradient(circle at 30% 30%,#24503B,#15301F 70%);background-size:cover">' + pins + '</div>' +
        huntBar());
    },

    /* GM-02 코스 목록 */
    courses: function (p) {
      var cp = cpOf(mainJob()), list;
      if (p.region === 'REC') {
        list = M.courses.filter(function (c) { return Engine.canEnterCourse(M, cp, c); })
          .sort(function (a, b) { return Engine.huntEfficiency(M, cp, b) - Engine.huntEfficiency(M, cp, a) || b.star - a.star; }).slice(0, 30);
      } else {
        list = M.courses.filter(function (c) { return c.regionId === p.region; })
          .sort(function (a, b) { return status(b).rank - status(a).rank || b.star - a.star; });
      }
      function status(c) {
        if (!Engine.canEnterCourse(M, cp, c)) return { t: '잠김 · 전투력 ' + fmt(IX.tier[c.star].entryCp) + ' 필요', cls: 'lbl-bad', rank: 0 };
        var e = Engine.huntEfficiency(M, cp, c);
        return e >= 1 ? { t: '입장 가능 · 효율 100%', cls: 'lbl-ok', rank: 2 + c.star / 10 } : { t: '효율 낮음 · ' + Math.round(e * 100) + '%', cls: 'lbl-warn', rank: 1 + e };
      }
      var title = p.region === 'REC' ? '내 전투력에 맞는 코스' : IX.region[p.region].name;
      return gameScreen('map', '<div class="row"><button class="chip" data-a="tab" data-v="map">‹ 지도</button><b style="flex:1">' + esc(title) + '</b><span class="small">' + list.length + '개</span></div>' +
        list.map(function (c, i) {
          var st = status(c), fam = FAM_NAME[IX.region[c.regionId].mainFamily] || '전 계열';
          return '<button class="card' + (i === 0 && p.region === 'REC' ? ' hl' : '') + '" style="text-align:left' + (st.rank === 0 ? ';opacity:.6' : '') + '" data-a="pickCourse" data-v="' + c.id + '"' + (i === 0 ? ' data-coach="course"' : '') + '>' +
            '<div class="row"><b>' + esc(c.name) + '</b><span class="' + st.cls + '" style="font-size:13px">' + st.t + '</span></div>' +
            '<p class="sub">' + '★'.repeat(c.star) + ' · ' + esc(IX.region[c.regionId].name) + ' · 주재료 ' + fam + '</p></button>';
        }).join(''));
    },

    /* GM-03 자동사냥 진행 */
    hunt: function () {
      var h = S.hunt;
      if (!h) return gameScreen('map', '<p class="sub">진행 중인 사냥이 없습니다.</p><button class="btn" data-a="tab" data-v="map">사냥터로</button>');
      var c = IX.course[h.course_id], t = Engine.huntTicks(M, Date.parse(h.started_at), now(), h.tutorial);
      var elapsed = Math.max(0, now() - Date.parse(h.started_at)), maxMs = h.max_ticks * h.tick_minutes * 60000;
      var full = t >= h.max_ticks, pct = Math.min(100, elapsed / maxMs * 100);
      var eff = Engine.huntEfficiency(M, Number(cpOf(h.job_id)), c), tier = IX.tier[c.star];
      var nextMin = full ? 0 : Math.ceil(((t + 1) * h.tick_minutes * 60000 - elapsed) / 60000);
      return gameScreen('map',
        '<div class="row"><button class="chip" data-a="tab" data-v="map">‹ 지도</button><b style="flex:1">' + esc(c.name) + '</b><span class="small">' + '★'.repeat(c.star) + '</span></div>' +
        '<div class="stage">' + JOBS.map(function (j) { return '<div class="hero" style="background:' + ({ WAR: '#6A4BD8', MAG: '#2E8B57', ARC: '#9CC7EE', ROG: '#E06A5A' })[j] + '">' + img('char_' + JOB_FILE[j] + '.png') + '</div>'; }).join('') + '<div class="mob"></div></div>' +
        '<div class="card"><b>' + elapsedLabel(elapsed, h) + '</b><div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<p class="sub">' + (full ? '가득 참 · 더 이상 쌓이지 않아요' : '보상 쌓이는 중 · 다음 보상 ' + nextMin + '분 후') + (h.tutorial ? ' · 튜토리얼 가속(1분=1회)' : '') + '</p></div>' +
        '<div class="card"><p style="color:var(--gold)">쌓인 보상(예상)</p><p>골드 약 ' + fmt(Math.round(t * tier.goldPerTick * eff)) + ' · 재료 약 ' + Math.round(t * tier.dropsPerTick * eff) + '개</p><p class="small">' + h.tick_minutes + '분마다 계산 · 받을 때 서버에서 확정</p></div>' +
        '<div style="flex:1"></div><button class="btn" data-a="claim" data-coach="claim">보상 받고 사냥 종료</button>');
    },

    /* GM-05 제작 */
    craft: function (p) {
      var j = p.job || mainJob(), filter = p.filter || 'can', mats = S.materials, w = S.wallet;
      var list = M.items.filter(function (it) { return it.jobId === j; }).map(function (it) {
        return { it: it, short: Engine.craftShortage(M, it.id, w, mats) };
      });
      if (filter === 'can') {
        var can = list.filter(function (x) { return !x.short.length; });
        list = can.length ? can : list.filter(function (x) { return x.it.grade === 1; });
      }
      list.sort(function (a, b) { return a.short.length - b.short.length || a.it.grade - b.it.grade; });
      return gameScreen('craft',
        '<div class="chips">' + JOBS.map(function (x) { return '<button class="chip' + (x === j ? ' on' : '') + '" data-a="craftJob" data-v="' + x + '">' + job(x).name + '</button>'; }).join('') + '</div>' +
        '<div class="chips"><button class="chip' + (filter === 'can' ? ' on' : '') + '" data-a="craftFilter" data-v="can">지금 만들 수 있는 것</button><button class="chip' + (filter === 'all' ? ' on' : '') + '" data-a="craftFilter" data-v="all">전체</button></div>' +
        (filter === 'can' && !list.some(function (x) { return !x.short.length; }) ? '<p class="sub">지금 만들 수 있는 장비가 없어요. 사냥으로 재료를 모아 보세요.</p>' : '') +
        list.map(function (x, i) {
          var rc = IX.recipe[x.it.id], have = Number(mats[rc.mainMaterialId] || 0);
          return '<button class="card" style="text-align:left" data-a="craftDetail" data-v="' + x.it.id + '"' + (i === 0 ? ' data-coach="craftItem"' : '') + '><div class="row" style="justify-content:flex-start">' + itemIcon(x.it.id) +
            '<div style="flex:1"><div class="row"><b>' + esc(x.it.name) + '</b><span class="' + (x.short.length ? 'lbl-bad' : 'lbl-ok') + '" style="font-size:12px">' + (x.short.length ? '재료 부족' : '제작 가능') + '</span></div>' +
            '<p class="sub">' + GRADE_NAME[x.it.grade] + ' · 전투력 +' + fmt(x.it.cp) + '</p><p class="small">' + esc(IX.material[rc.mainMaterialId].name) + ' ' + have + '/' + rc.mainQty + ' · 골드 ' + fmt(rc.gold) + '</p></div></div></button>';
        }).join(''));
    },

    /* GM-06 아이템(공용 인벤토리) */
    items: function (p) {
      var tab = p.tab || 'equip', body = '';
      if (tab === 'mat') {
        var ids = Object.keys(S.materials).filter(function (k) { return S.materials[k] > 0; }).sort();
        body = ids.length ? '<div class="grid">' + ids.map(function (id) { var m = IX.material[id]; return '<div class="cell g' + m.tier + '">' + matIcon(id) + '<b class="gname">' + esc(m.name) + '</b><span>' + fmt(S.materials[id]) + '개</span></div>'; }).join('') + '</div>'
          : '<p class="sub">아직 재료가 없어요 · 사냥터에서 모아 보세요</p><button class="btn ghost" data-a="tab" data-v="map">사냥하러 가기</button>';
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
        return '<button class="chip' + (tab === t[0] ? ' on' : '') + '" data-a="itemTab" data-v="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>' + body);
    },

    /* GM-07 캐릭터 */
    char: function (p) {
      var j = p.job || mainJob(), c = charOf(j), cp = cpOf(j), sk = Engine.topSkill(M, j, cp);
      var eq = S.items.filter(function (x) { return x.equipped_job_id === j; });
      var slots = M.parts.map(function (pt) {
        var x = eq.filter(function (e) { return IX.item[e.item_id].partId === pt.id; })[0];
        return x ? '<button class="cell g' + IX.item[x.item_id].grade + '" data-a="itemDetail" data-v="' + x.inv_item_id + '">' + itemIcon(x.item_id) + '<span>' + esc(IX.item[x.item_id].name) + '</span></button>'
          : '<button class="cell" data-a="slotPick" data-v="' + pt.id + '" data-j="' + j + '"><div class="icon"><span>' + pt.name + '</span></div><span class="small">비어 있음</span></button>';
      }).join('');
      var isMain = j === mainJob();
      return gameScreen('char',
        '<div class="chips">' + JOBS.map(function (x) { return '<button class="chip' + (x === j ? ' on' : '') + '" data-a="charJob" data-v="' + x + '">' + job(x).name + (x === mainJob() ? ' ★' : '') + '</button>'; }).join('') + '</div>' +
        '<div class="card"><div class="row"><b>' + (isMain ? '현재 대표: ' : '살펴보는 캐릭터: ') + esc(job(j).name) + '</b>' + (isMain ? '<span class="lbl-warn">★ 대표</span>' : '<button class="chip" data-a="setMain" data-v="' + j + '">대표로 설정</button>') + '</div>' +
        '<p class="sub">전투력 <b style="color:var(--text);font-size:18px">' + fmt(cp) + '</b> · 스킬 ' + esc(sk.name) + ' · 역할 ' + esc(job(j).role) + '</p></div>' +
        '<div class="stage" style="height:170px"><div class="hero" style="width:80px;height:120px;background:#6A4BD8">' + img('char_' + JOB_FILE[j] + '.png') + '</div></div>' +
        '<b>장비 8부위</b><div class="grid">' + slots + '</div>' +
        '<b style="margin-top:8px">설정</b>' +
        '<button class="btn ghost" data-a="replayTutorial">튜토리얼 다시 보기</button>' +
        '<button class="btn ghost" data-a="replayIntro">인트로 다시 보기</button>' +
        (S.member.is_demo === 'Y' ? '<button class="btn danger" data-a="resetDemo">시연 초기화</button>' : '') +
        '<button class="btn ghost" data-a="logout">로그아웃</button>');
    },

    /* 던전(2차 작업 예정) */
    dungeon: function () {
      return gameScreen('dungeon', '<div class="card"><b>던전 · 파티 레이드</b><p class="sub">스크린로그인 → 입장 대기 → 레이드 준비 → 레이드 → 결과·상자는 다음 업데이트에서 열립니다.</p></div>' +
        (S.chests.length ? '<button class="btn purple" data-a="itemTab" data-v="chest">보관 중인 상자 ' + S.chests.length + '개 보기</button>' : ''));
    }
  };
  function elapsedLabel(ms, h) {
    var m = Math.floor(ms / 60000), maxH = h.max_ticks * h.tick_minutes / 60;
    var e = m >= 60 ? Math.floor(m / 60) + '시간 ' + (m % 60) + '분' : m + '분';
    return e + ' 경과 / 최대 ' + (maxH >= 1 ? maxH + '시간' : h.max_ticks * h.tick_minutes + '분');
  }
  function huntBar() {
    if (!S.hunt) return '';
    var h = S.hunt, c = IX.course[h.course_id], t = Engine.huntTicks(M, Date.parse(h.started_at), now(), h.tutorial);
    var full = t >= h.max_ticks, pct = Math.min(100, (now() - Date.parse(h.started_at)) / (h.max_ticks * h.tick_minutes * 60000) * 100);
    return '<button class="card" style="text-align:left;background:var(--card2)" data-a="openHunt"><div class="row"><b>' + esc(c.name) + '</b><span class="' + (full ? 'lbl-warn' : 'sub') + '">' + (full ? '가득 참 · 받으러 가기' : '보상 쌓이는 중') + '</span></div><div class="bar"><i style="width:' + pct + '%"></i></div></button>';
  }

  // ---------------- 팝업 ----------------
  var POPUPS = {
    confirm: function (p) {
      return '<div class="overlay center"><div class="sheet"><b style="font-size:18px">' + esc(p.title) + '</b><p class="sub">' + esc(p.text || '') + '</p>' +
        '<button class="btn" data-a="confirmYes">' + esc(p.yes || '확인') + '</button><button class="btn ghost" data-a="close">' + esc(p.no || '취소') + '</button></div></div>';
    },
    /* GM-04 사냥 결과 */
    huntResult: function (p) {
      var rw = p.res.reward, mats = Object.keys(rw.materials);
      return '<div class="overlay center"><div class="sheet"><b style="font-size:20px;color:#2E8B57">지급 완료</b><p class="sub">' + esc(IX.course[p.course].name) + ' · ' + rw.ticks + '회 보상</p>' +
        '<p>골드 ' + fmt(rw.gold) + '</p>' + (mats.length ? '<p>' + mats.map(function (id) { return esc(IX.material[id].name) + ' ' + rw.materials[id]; }).join(' · ') + '</p>' : '<p class="sub">획득한 재료 없음</p>') +
        p.res.items.map(function (x) { var it = IX.item[x.item_id]; return '<div class="row g' + it.grade + '" style="justify-content:flex-start;border:2px solid var(--gc);border-radius:12px;padding:8px">' + itemIcon(x.item_id) + '<b class="gname">' + GRADE_NAME[it.grade] + ' · ' + esc(it.name) + '</b></div>'; }).join('') +
        '<button class="btn" data-a="rehunt" data-v="' + p.course + '">같은 코스 다시 사냥</button><button class="btn ghost" data-a="tab" data-v="craft" data-coach="toCraft">제작하러 가기</button><button class="btn ghost" data-a="close">닫기</button></div></div>';
    },
    craftDetail: function (p) {
      var it = IX.item[p.id], rc = IX.recipe[p.id], short = Engine.craftShortage(M, p.id, S.wallet, S.materials);
      var line = function (id, need) { var have = Number(S.materials[id] || 0); return '<div class="row"><span>' + esc(IX.material[id].name) + '</span><b style="color:' + (have >= need ? '#2E8B57' : '#D64545') + '">' + have + ' / ' + need + '</b></div>'; };
      var cur = S.items.filter(function (x) { return x.equipped_job_id === it.jobId && IX.item[x.item_id].partId === it.partId; })[0];
      var diff = it.cp - (cur ? cur.cp : 0);
      return '<div class="overlay"><div class="sheet"><div class="row" style="justify-content:flex-start">' + itemIcon(p.id) + '<div><b style="font-size:18px">' + esc(it.name) + '</b><p class="sub">' + GRADE_NAME[it.grade] + ' · ' + job(it.jobId).name + ' · 현재 장착 대비 ' + (diff >= 0 ? '+' : '') + fmt(diff) + '</p></div></div>' +
        line(rc.mainMaterialId, rc.mainQty) + (rc.subMaterialId ? line(rc.subMaterialId, rc.subQty) : '') +
        '<div class="row"><span>골드</span><b style="color:' + (S.wallet.gold >= rc.gold ? '#2E8B57' : '#D64545') + '">' + fmt(S.wallet.gold) + ' / ' + fmt(rc.gold) + '</b></div>' +
        (short.length ? '<p class="err">' + short.map(function (s) { return (s.id === 'GOLD' ? '골드 ' : IX.material[s.id].name + ' ') + fmt(s.need - s.have) + (s.id === 'GOLD' ? '' : '개') + ' 부족'; }).join(' · ') + '</p>' : '') +
        '<button class="btn" data-a="doCraft" data-v="' + p.id + '"' + (short.length ? ' disabled' : '') + ' data-coach="doCraft">' + (short.length ? '제작 (재료 부족)' : '제작') + '</button>' +
        (short.length ? '<button class="btn ghost" data-a="region" data-v="REC">재료 사냥터 보기</button>' : '') +
        '<button class="btn ghost" data-a="close">닫기</button></div></div>';
    },
    crafted: function (p) {
      var it = IX.item[p.item.item_id];
      return '<div class="overlay center"><div class="sheet"><b style="font-size:20px;color:' + (p.great ? '#B5720F' : '#2E8B57') + '">' + (p.great ? '대성공!' : '제작 완료') + '</b>' +
        '<div class="row g' + it.grade + '" style="justify-content:flex-start">' + itemIcon(p.item.item_id) + '<div><b>' + esc(it.name) + '</b><p class="sub">전투력 +' + fmt(p.item.cp) + ' · 인벤토리에 추가됨</p></div></div>' +
        '<button class="btn" data-a="equip" data-v="' + p.item.inv_item_id + '" data-coach="equip">바로 장착</button><button class="btn ghost" data-a="close">닫기</button></div></div>';
    },
    itemDetail: function (p) {
      var x = S.items.filter(function (i) { return i.inv_item_id === p.id; })[0]; if (!x) return '';
      var it = IX.item[x.item_id];
      var cur = S.items.filter(function (e) { return e.equipped_job_id === it.jobId && IX.item[e.item_id].partId === it.partId; })[0];
      var diff = x.cp - (cur ? cur.cp : 0);
      return '<div class="overlay"><div class="sheet"><div class="row" style="justify-content:flex-start">' + itemIcon(x.item_id) + '<div><b style="font-size:18px">' + esc(it.name) + '</b><p class="sub">' + GRADE_NAME[it.grade] + (x.is_great === 'Y' ? ' · 대성공' : '') + ' · ' + job(it.jobId).name + ' 전용 · 전투력 ' + fmt(x.cp) + '</p></div></div>' +
        (x.equipped_job_id ? '<p class="sub">' + job(it.jobId).name + '이(가) 장착 중</p><button class="btn ghost" data-a="unequip" data-v="' + x.inv_item_id + '">장착 해제</button>'
          : '<p class="sub">현재 장착 대비 ' + (diff >= 0 ? '+' : '') + fmt(diff) + '</p><button class="btn" data-a="equip" data-v="' + x.inv_item_id + '">장착</button><button class="btn ghost" data-a="sell" data-v="' + x.inv_item_id + '">판매 ' + fmt(Engine.sellPrice(M, x.item_id)) + 'G</button>') +
        '<button class="btn ghost" data-a="close">닫기</button></div></div>';
    },
    slotPick: function (p) {
      var list = S.items.filter(function (x) { var it = IX.item[x.item_id]; return it.jobId === p.job && it.partId === p.part && !x.equipped_job_id; });
      return '<div class="overlay"><div class="sheet"><b>' + job(p.job).name + ' · ' + M.parts.filter(function (x) { return x.id === p.part; })[0].name + '</b>' +
        (list.length ? list.map(function (x) { return '<button class="row card" style="background:#EEF2EA;color:#1B2620" data-a="equip" data-v="' + x.inv_item_id + '">' + itemIcon(x.item_id) + '<span style="flex:1;text-align:left">' + esc(IX.item[x.item_id].name) + ' · ' + fmt(x.cp) + '</span></button>'; }).join('')
          : '<p class="sub">장착할 수 있는 장비가 없어요</p><button class="btn" data-a="tab" data-v="craft">제작하러 가기</button>') +
        '<button class="btn ghost" data-a="close">닫기</button></div></div>';
    },
    chestOpened: function (p) {
      var c = p.res.contents;
      return '<div class="overlay center"><div class="sheet"><b style="font-size:20px">' + GRADE_NAME[c.grade] + ' 상자 개봉</b><p>골드 ' + fmt(c.gold) + '</p><p>' + Object.keys(c.materials).map(function (id) { return esc(IX.material[id].name) + ' ' + c.materials[id]; }).join(' · ') + '</p>' +
        p.res.items.map(function (x) { var it = IX.item[x.item_id]; return '<div class="row g' + it.grade + '" style="justify-content:flex-start">' + itemIcon(x.item_id) + '<b class="gname">' + esc(it.name) + '</b></div>'; }).join('') +
        '<button class="btn" data-a="close">확인</button></div></div>';
    },
    probs: function () {
      var rows = M.rewardGrades.map(function (g) { return '<tr><td>' + GRADE_NAME[g.grade] + '</td><td>' + g.tierProb.map(function (x) { return Math.round(x * 100) + '%'; }).join(' / ') + '</td><td>' + Math.round(g.equipDropProb * 100) + '%</td></tr>'; }).join('');
      return '<div class="overlay"><div class="sheet"><b>확률 안내</b><p class="sub">상자 등급별 재료 단계(1~5단계) 확률과 장비 드랍 확률</p><table style="font-size:13px;border-collapse:collapse"><tr><th>상자</th><th>재료 단계 1/2/3/4/5</th><th>장비</th></tr>' + rows + '</table>' +
        '<p class="sub">제작 대성공: 일반·고급 10%, 희귀 8%, 영웅 6%, 전설 5% · SP 배율 1.2~2.0배</p><button class="btn ghost" data-a="close">닫기</button></div></div>';
    },
    expired: function (p) {
      return '<div class="overlay center"><div class="sheet"><b>세션 종료</b><p class="sub">' + esc(p.msg) + '</p><button class="btn" data-a="logout">다시 로그인</button></div></div>';
    }
  };

  // ---------------- 튜토리얼(GM-08) ----------------
  var COACH = {
    '0': { screens: ['map'], text: '<b>① 1/5 · 피노</b> 추천 코스로 첫 사냥을 시작해 볼까요? [지금 사냥 가능한 코스 보기]를 눌러 주세요.' },
    '1': { screens: ['courses', 'map'], text: '<b>② 2/5 · 피노</b> 맨 위 추천 코스를 골라 사냥을 시작해요. 첫 사냥은 1분마다 보상이 쌓여요!' },
    '2': { screens: ['hunt', 'map'], text: '<b>③ 3/5 · 피노</b> 1분 이상 기다린 뒤 [보상 받고 사냥 종료]를 눌러 보상을 받아요.' },
    '3': { screens: ['craft', 'map', 'items'], text: '<b>④ 4/5 · 피노</b> [제작] 탭에서 무기를 만들어 볼까요? 초기 지급 철주괴로 만들 수 있어요.' },
    '4': { screens: ['craft', 'char', 'items', 'map'], text: '<b>⑤ 5/5 · 피노</b> 만든 장비를 장착하면 전투력이 올라요!' }
  };
  function tutorialCoach() {
    if (!S || !S.member || S.member.tutorial_step === 'DONE' || S.member.intro_seen !== 'Y') return '';
    var c = COACH[S.member.tutorial_step]; if (!c || c.screens.indexOf(view.name) < 0) return '';
    return '<div class="coach"><p>' + c.text + '</p><div class="row"><button class="small" data-a="tutSkip">건너뛰기</button><span class="small">캐릭터 › 설정에서 다시 볼 수 있어요</span></div></div>';
  }
  function tutorialTo(step) {
    if (!S || S.member.tutorial_step === 'DONE') return;
    if (step !== 'DONE' && Number(step) <= Number(S.member.tutorial_step)) return;
    S.member.tutorial_step = String(step);
    act('progress', { tutorial_step: String(step) }).then(function (res) {
      if (res.ok && res.data.reward_gold) { S.wallet.gold += res.data.reward_gold; toast('튜토리얼 완료! 보상 골드 ' + res.data.reward_gold); }
    });
  }

  // ---------------- 동작 ----------------
  var hiddenTaps = [];
  var A = {
    home: function () { go('launcher'); },
    tab: function (d) { go(d.v === 'map' && S.hunt && view.name === 'hunt' ? 'map' : d.v); },
    logout: function () { Api.logout(); S = null; go('login'); },
    enterGame: function () { go(S.member.intro_seen === 'Y' ? (S.hunt ? 'hunt' : 'map') : 'intro'); },
    introDone: function () {
      S.member.intro_seen = 'Y'; go('map');
      act('progress', { intro_seen: true });
    },
    region: function (d) { if (d.v === 'REC') tutorialTo(1); go('courses', { region: d.v }); },
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
    craftJob: function (d) { go('craft', { job: d.v, filter: view.p.filter }); },
    craftFilter: function (d) { go('craft', { job: view.p.job, filter: d.v }); },
    craftDetail: function (d) { popup = { type: 'craftDetail', id: d.v }; render(); },
    doCraft: function (d, el) {
      el.disabled = true; el.textContent = '제작 중…';
      act('craft', { item_id: d.v }).then(function (res) {
        if (!res.ok) { popup = null; toast(res.error.message); return; }
        S.wallet = res.data.wallet; S.items.push(res.data.item);
        var rc = IX.recipe[d.v]; S.materials[rc.mainMaterialId] -= rc.mainQty; if (rc.subMaterialId) S.materials[rc.subMaterialId] -= rc.subQty;
        popup = { type: 'crafted', item: res.data.item, great: res.data.great }; tutorialTo(4); render();
      });
    },
    equip: function (d) {
      act('equip', { inv_item_id: d.v }).then(function (res) {
        if (!res.ok) { toast(res.error.message); return; }
        var x = S.items.filter(function (i) { return i.inv_item_id === d.v; })[0], it = IX.item[x.item_id];
        S.items.forEach(function (i) { var t = IX.item[i.item_id]; if (i.equipped_job_id === it.jobId && t.partId === it.partId) i.equipped_job_id = ''; });
        x.equipped_job_id = it.jobId; S.characters = res.data.characters;
        var c = charOf(it.jobId); popup = null; toast(job(it.jobId).name + ' 전투력 ' + fmt(c.cp) + '(으)로 상승!');
        if (S.member.tutorial_step === '4') tutorialTo('DONE');
        go('char', { job: it.jobId });
      });
    },
    unequip: function (d) {
      act('unequip', { inv_item_id: d.v }).then(function (res) {
        if (!res.ok) { toast(res.error.message); return; }
        S.items.forEach(function (i) { if (i.inv_item_id === d.v) i.equipped_job_id = ''; }); S.characters = res.data.characters; popup = null; render();
      });
    },
    sell: function (d) {
      var x = S.items.filter(function (i) { return i.inv_item_id === d.v; })[0];
      popup = { type: 'confirm', title: '판매할까요?', text: IX.item[x.item_id].name + ' · ' + fmt(Engine.sellPrice(M, x.item_id)) + 'G (판매 후 되돌릴 수 없어요)', yes: '판매', run: function () {
        act('sellItem', { inv_item_id: d.v }).then(function (res) {
          if (!res.ok) { toast(res.error.message); return; }
          S.items = S.items.filter(function (i) { return i.inv_item_id !== d.v; }); S.wallet = res.data.wallet; toast(fmt(res.data.price) + 'G 획득'); render();
        });
      } }; render();
    },
    itemTab: function (d) { go('items', { tab: d.v }); },
    itemDetail: function (d) { popup = { type: 'itemDetail', id: d.v }; render(); },
    slotPick: function (d) { popup = { type: 'slotPick', part: d.v, job: d.j }; render(); },
    charJob: function (d) { go('char', { job: d.v }); },
    setMain: function (d) {
      S.member.main_job_id = d.v; render();
      act('setMainJob', { job_id: d.v }).then(function (res) { if (res.ok) toast(job(d.v).name + '을(를) 대표 캐릭터로 설정했어요'); });
    },
    chestOpen: function (d) {
      act('chestOpen', { chest_id: d.v }).then(function (res) {
        if (!res.ok) { toast(res.error.message); return; }
        var c = res.data.contents; S.wallet = res.data.wallet;
        Object.keys(c.materials).forEach(function (k) { S.materials[k] = (S.materials[k] || 0) + c.materials[k]; });
        S.items = S.items.concat(res.data.items); S.chests = S.chests.filter(function (x) { return x.chest_id !== d.v; });
        popup = { type: 'chestOpened', res: res.data }; render();
      });
    },
    probs: function () { popup = { type: 'probs' }; render(); },
    replayTutorial: function () { S.member.tutorial_step = '0'; toast('사냥터에서 튜토리얼을 다시 안내해요'); go('map'); },
    replayIntro: function () { go('intro'); },
    resetDemo: function () {
      popup = { type: 'confirm', title: '시연 초기화', text: '데모 계정의 모든 진행을 처음 상태로 되돌립니다.', yes: '초기화', run: function () {
        act('resetDemo', {}).then(function (res) { if (res.ok) { setSave(res.data.save); toast('시연 초기화 완료'); go('launcher'); } else toast(res.error.message); });
      } }; render();
    },
    tutSkip: function () { tutorialTo('DONE'); render(); },
    hidden: function () {
      var t = Date.now(); hiddenTaps = hiddenTaps.filter(function (x) { return t - x < 600 * 3; }); hiddenTaps.push(t);
      if (hiddenTaps.length >= 3) { hiddenTaps = []; if (view.name === 'hunt' && S.hunt) claim(true); }
    }
  };
  function startHunt(courseId) {
    act('huntStart', { course_id: courseId }).then(function (res) {
      if (!res.ok) { toast(res.error.message); return; }
      S.hunt = res.data.hunt; offset = Date.parse(res.data.hunt.server_time) - Date.now();
      tutorialTo(2); go('hunt');
    });
  }
  function claim(skip, thenCourse) {
    var h = S.hunt; if (!h) return;
    act('huntClaim', skip ? { skip: true } : {}).then(function (res) {
      if (!res.ok && res.error.code === 'NO_TICKS') {
        popup = { type: 'confirm', title: '보상 없이 종료할까요?', text: '아직 쌓인 보상이 없어요(' + h.tick_minutes + '분마다 계산).', yes: '보상 없이 종료', no: '계속 사냥', run: function () {
          act('huntClaim', { cancel: true }).then(function (r2) { if (r2.ok) { S.hunt = null; if (thenCourse) startHunt(thenCourse); else go('map'); } });
        } }; render(); return;
      }
      if (!res.ok) { toast(res.error.message); return; }
      S.hunt = null; S.wallet = res.data.wallet;
      var rw = res.data.reward; Object.keys(rw.materials).forEach(function (k) { S.materials[k] = (S.materials[k] || 0) + rw.materials[k]; });
      S.items = S.items.concat(res.data.items);
      tutorialTo(3);
      if (thenCourse) { startHunt(thenCourse); return; }
      view = { name: 'map', p: {} }; popup = { type: 'huntResult', res: res.data, course: h.course_id }; render();
    });
  }

  root.addEventListener('click', function (e) {
    var el = e.target.closest('[data-a]'); if (!el || el.disabled) return;
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
      setSave(res.data.save); go('launcher');
    });
  });
  // 인트로 컷 등장 연출
  root.addEventListener('scroll', function (e) {
    if (!e.target.matches || !e.target.matches('[data-scroll="intro"]')) return;
    e.target.querySelectorAll('.cut').forEach(function (c) { if (c.getBoundingClientRect().top < window.innerHeight * 0.7) c.classList.add('in'); });
  }, true);
  // 사냥 진행 표시 갱신(서버 요청 없이 화면에서 계산)
  setInterval(function () { if (!popup && (view.name === 'hunt' || view.name === 'map') && S && S.hunt) render(); }, 15000);

  // ---------------- 시작 ----------------
  fetch(APP_CONFIG.MASTER_URL).then(function (r) { return r.json(); }).then(function (m) {
    M = m; IX = Engine.index(M);
    if (!Api.state.token) { go('login'); return; }
    Api.call('loadSave', {}, { read: true }).then(function (res) {
      if (res.ok) { Api.state.version = res.save_version; setSave(res.data); go('launcher'); } else { popup = null; Api.logout(); go('login'); }
    });
  }, function () { root.innerHTML = '<div class="screen" style="padding:24px"><p>기준 데이터를 불러오지 못했어요. 새로고침해 주세요.</p></div>'; });
})();
