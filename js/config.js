// 서버 주소: 로컬 개발 서버는 '/api', 배포 시 Apps Script 웹앱 URL
window.APP_CONFIG = {
  API_URL: location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? '/api'
    : 'https://script.google.com/macros/s/AKfycbwwQbF1noTIGt5kkwhfdLQrAoi-T200w8KFish7ilbmkOmqvYHBWBwigIkxNQ2I6ILT/exec',
  MASTER_URL: 'data/master.json',
  ASSET_DIR: 'assets/',
  ASSET_VER: '0.6.3',
  // GPT 단계 이미지(char_{직업}_s0~s5[_atk].webp)를 assets에 올린 뒤 true로 바꾸면 단계 그림을 씀. false면 기존 그림 + 단계 색 처리
  LOOK_IMAGES: true,
  // 장비 아이콘 160종(icon_item_{직업}_g{등급}_{부위}.webp)·랭킹 메달(rank_medal_1~3.webp)을 올린 뒤 true
  ICON_IMAGES: true,
  RANK_MEDALS: true
};
