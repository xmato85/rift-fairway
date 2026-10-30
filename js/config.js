// 서버 주소: 로컬 개발 서버는 '/api', 배포 시 Apps Script 웹앱 URL
window.APP_CONFIG = {
  API_URL: location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? '/api'
    : 'https://script.google.com/macros/s/AKfycbzzLZAcYP9YMH52uFBrTLGi7SehLOl7QxOmHwnjSQQm7WGuZb-ibrxuEIkJXnq7YB0S/exec',
  MASTER_URL: 'data/master.json',
  ASSET_DIR: 'assets/'
};
