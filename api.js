/* 서버 통신: { action, request_id, session_token, save_version, payload } (R-44)
 * 재화가 바뀌는 요청은 저장 상태를 표시하고, 실패 시 같은 request_id로 3회까지 재시도(R-18, R-20) */
var Api = (function () {
  var S = { token: null, version: null, onSave: function () {}, onExpired: function () {}, onTime: function () {} };
  try { S.token = localStorage.getItem('rf_token'); } catch (e) {}
  function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); }
  function post(body) {
    return fetch(APP_CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }
  function call(action, payload, opts) {
    opts = opts || {};
    var body = { action: action, request_id: uuid(), session_token: S.token, save_version: S.version, payload: payload || {} };
    var tries = 0, write = !opts.read;
    if (write) S.onSave('saving');
    function attempt() {
      tries++;
      return post(body).then(function (res) {
        if (res.save_version !== undefined) S.version = res.save_version;
        var d = res.ok && res.data, st = d && (d.server_time || (d.round && d.round.server_time) || (d.hunt && d.hunt.server_time));
        if (st) S.onTime(st); // 서버 시각 기준(사냥 틱·레이드 이벤트 표시)
        if (!res.ok && res.error) {
          if (res.error.code === 'SESSION_EXPIRED') { S.onExpired(res.error.message); }
          if (res.error.code === 'VERSION_CONFLICT' && res.error.save_version !== undefined) S.version = res.error.save_version;
          if (write) S.onSave(res.error.code === 'SERVER_ERROR' ? 'error' : 'saved');
        } else if (write) S.onSave('saved');
        return res;
      }, function (err) {
        if (tries < 3) return new Promise(function (ok) { setTimeout(ok, 800 * tries); }).then(attempt);
        if (write) S.onSave('error');
        return { ok: false, error: { code: 'NETWORK', message: '연결이 불안정해요. 다시 시도해 주세요' } };
      });
    }
    return attempt();
  }
  function login(id, pw) {
    return post({ action: 'login', payload: { member_id: id, pw: pw, device_info: navigator.userAgent.slice(0, 120), entry_path: 'launcher' } })
      .then(function (res) {
        if (res.ok) { S.token = res.data.session_token; S.version = res.save_version; try { localStorage.setItem('rf_token', S.token); } catch (e) {} }
        return res;
      }, function () { return { ok: false, error: { code: 'NETWORK', message: '서버에 연결할 수 없어요' } }; });
  }
  function logout() { S.token = null; try { localStorage.removeItem('rf_token'); } catch (e) {} }
  return { call: call, login: login, logout: logout, state: S, uuid: uuid };
})();
