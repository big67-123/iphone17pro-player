'use strict';

/* ============ 工具 ============ */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function fmtTime(t) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const total = Math.floor(t);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

let toastTimer = null;
function toast(msg, ms = 1800) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function vibrate(ms = 15) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {}
}

/* ============ DOM ============ */
const video = $('#video');
const player = $('#player');
const app = $('#app');
const emptyState = $('#emptyState');
const fileNameEl = $('#fileName');
const playBtn = $('#playBtn');
const backBtn = $('#backBtn');
const fwdBtn = $('#fwdBtn');
const speedBtn = $('#speedBtn');
const lockBtn = $('#lockBtn');
const fullBtn = $('#fullBtn');
const settingsBtn = $('#settingsBtn');
const settingsPanel = $('#settingsPanel');
const settingsClose = $('#settingsClose');
const lockBadge = $('#lockBadge');
const boostBadge = $('#boostBadge');
const seekTrack = $('#seekTrack');
const seekFill = $('#seekFill');
const seekThumb = $('#seekThumb');
const seekBubble = $('#seekBubble');
const curTimeEl = $('#curTime');
const durTimeEl = $('#durTime');
const fileInput = $('#fileInput');
const rotateOverlay = $('#rotateOverlay');
const forceBtn = $('#forceBtn');
const forceToggleBtn = $('#forceToggleBtn');
const autoHideSwitch = $('#autoHideSwitch');

/* ============ 状态 / 设置 ============ */
const SPEEDS = [0.75, 1, 1.25, 1.5];
const BOOSTS = [1.25, 1.5, 2, 2.5];

let saved = {};
try { saved = JSON.parse(localStorage.getItem('ip17p.settings') || '{}'); } catch (_) {}

const savedSpeedIndex = SPEEDS.indexOf(Number(saved.speed));

const state = {
  speedIndex: savedSpeedIndex >= 0 ? savedSpeedIndex : 1,
  boostRate: BOOSTS.includes(Number(saved.boost)) ? Number(saved.boost) : 1.5,
  autoHide: saved.autoHide !== false,
  locked: false,
  controlsVisible: true,
  hideTimer: null,
  boostTimer: null,
  boostActive: false,
  boostJustEnded: 0,
  raf: 0,
  seek: null,
  fullscreen: false,
  objectUrl: null,
};

const currentRate = () => SPEEDS[state.speedIndex];

function applyPlaybackRate() {
  if (!video.duration) return;
  video.playbackRate = state.boostActive ? state.boostRate : currentRate();
}

function saveSettings() {
  const s = {
    speed: currentRate(),
    boost: state.boostRate,
    autoHide: state.autoHide,
  };
  try { localStorage.setItem('ip17p.settings', JSON.stringify(s)); } catch (_) {}
}

/* ============ 控制栏显示 / 自动隐藏 ============ */
function setControls(show, force) {
  if (state.locked) show = false;
  if (force) state.controlsVisible = show;
  player.classList.toggle('controls-hidden', !show);
  if (show && !state.locked) scheduleHide();
}

function scheduleHide() {
  clearTimeout(state.hideTimer);
  const busy = state.seek || settingsPanel.classList.contains('open') || state.locked;
  if (state.autoHide && !video.paused && !busy) {
    state.hideTimer = setTimeout(() => setControls(false), 3200);
  }
}

app.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.ctrl-btn, .seg button, .switch')) scheduleHide();
}, true);

/* ============ 播放 / 暂停 ============ */
function setPlayIcon(paused) {
  playBtn.innerHTML = `<svg class="icon"><use href="#i-${paused ? 'play' : 'pause'}"/></svg>`;
  playBtn.setAttribute('aria-label', paused ? '播放' : '暂停');
}

async function togglePlay() {
  if (!video.src) { toast('请先选择视频'); return; }
  if (video.paused) {
    try { await video.play(); } catch (_) { toast('无法播放，请重试'); }
  } else {
    video.pause();
  }
}

playBtn.addEventListener('click', togglePlay);

video.addEventListener('play', () => {
  setPlayIcon(false);
  setControls(true, true);
  cancelAnimationFrame(state.raf);
  state.raf = requestAnimationFrame(loop);
  scheduleHide();
});

video.addEventListener('pause', () => {
  setPlayIcon(true);
  setControls(true, true);
  cancelAnimationFrame(state.raf);
  updateProgress();
});

video.addEventListener('ended', () => {
  setPlayIcon(true);
  setControls(true, true);
  toast('播放完毕');
});

video.addEventListener('loadedmetadata', () => {
  durTimeEl.textContent = fmtTime(video.duration);
  applyPlaybackRate();
  updateProgress();
});

video.addEventListener('error', () => {
  if (video.error) toast('视频加载失败');
});

/* 点击画面：切换控制栏 */
video.addEventListener('click', () => {
  if (state.locked) return;
  if (state.boostTimer || state.boostActive || Date.now() - state.boostJustEnded < 350) return;
  setControls(player.classList.contains('controls-hidden'), true);
});

/* ============ 进度更新 ============ */
function updateProgress() {
  const d = video.duration || 0;
  const t = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const p = d ? clamp(t / d, 0, 1) : 0;
  if (!state.seek) {
    seekFill.style.width = `${p * 100}%`;
    seekThumb.style.left = `${p * 100}%`;
  }
  curTimeEl.textContent = fmtTime(t);
  durTimeEl.textContent = fmtTime(d);
}

function loop() {
  updateProgress();
  state.raf = requestAnimationFrame(loop);
}

/* ============ 前进 / 后退 10 秒 ============ */
function seekBy(delta) {
  if (!video.duration || !Number.isFinite(video.duration)) { toast('请先选择视频'); return; }
  video.currentTime = clamp(video.currentTime + delta, 0, video.duration);
  toast(delta > 0 ? '⏩ +10 秒' : '⏪ −10 秒', 900);
  updateProgress();
  scheduleHide();
}

function bindRepeat(el, fn) {
  let t = null, iv = null;
  const start = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    fn();
    t = setTimeout(() => { iv = setInterval(fn, 300); }, 420);
  };
  const stop = () => { clearTimeout(t); clearInterval(iv); };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
  el.addEventListener('pointerleave', stop);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

bindRepeat(backBtn, () => seekBy(-10));
bindRepeat(fwdBtn, () => seekBy(10));

/* ============ 长按画面：临时加速 ============ */
let boostPress = null;

video.addEventListener('pointerdown', (e) => {
  if (state.locked) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target !== video) return;
  clearTimeout(state.boostTimer);
  boostPress = { active: false };
  state.boostTimer = setTimeout(() => {
    if (!boostPress) return;
    boostPress.active = true;
    state.boostActive = true;
    if (!video.paused) applyPlaybackRate();
    boostBadge.textContent = `长按加速 ${state.boostRate}×`;
    boostBadge.hidden = false;
    vibrate(20);
  }, 480);
});

function endBoost() {
  clearTimeout(state.boostTimer);
  state.boostTimer = null;
  if (boostPress && boostPress.active) {
    state.boostActive = false;
    state.boostJustEnded = Date.now();
    applyPlaybackRate();
    boostBadge.hidden = true;
    vibrate(10);
  }
  boostPress = null;
}

video.addEventListener('pointerup', endBoost);
video.addEventListener('pointercancel', endBoost);
video.addEventListener('pointerleave', endBoost);
video.addEventListener('contextmenu', (e) => e.preventDefault());

/* ============ 进度条：点击跳转 / 长按拖动 ============ */
function pctFromEvent(e) {
  const r = seekTrack.getBoundingClientRect();
  return clamp((e.clientX - r.left) / r.width, 0, 1);
}

function showBubble(p) {
  const t = (video.duration || 0) * p;
  seekBubble.hidden = false;
  seekBubble.textContent = `→ ${fmtTime(t)}`;
  seekBubble.style.left = `${p * 100}%`;
  seekFill.style.width = `${p * 100}%`;
  seekThumb.style.left = `${p * 100}%`;
  seekTrack.classList.add('seeking');
}

function hideBubble() {
  seekBubble.hidden = true;
  seekTrack.classList.remove('seeking');
}

seekTrack.addEventListener('pointerdown', (e) => {
  if (state.locked || !video.duration) return;
  e.preventDefault();
  seekTrack.setPointerCapture(e.pointerId);
  const p = pctFromEvent(e);
  state.seek = { startX: e.clientX, moved: false, timer: null };
  showBubble(p);
  clearTimeout(state.hideTimer);
  state.seek.timer = setTimeout(() => {
    if (state.seek) state.seek.moved = true; // 长按进入拖动模式
  }, 420);
});

seekTrack.addEventListener('pointermove', (e) => {
  if (!state.seek) return;
  const p = pctFromEvent(e);
  if (!state.seek.moved && Math.abs(e.clientX - state.seek.startX) > 10) {
    state.seek.moved = true;
    clearTimeout(state.seek.timer);
  }
  if (state.seek.moved) showBubble(p);
});

function finishSeek(e) {
  if (!state.seek) return;
  clearTimeout(state.seek.timer);
  const p = pctFromEvent(e);
  if (video.duration) {
    video.currentTime = clamp(p * video.duration, 0, video.duration);
    toast(`已跳转到 ${fmtTime(video.currentTime)}`, 1200);
  }
  hideBubble();
  state.seek = null;
  updateProgress();
  scheduleHide();
}

seekTrack.addEventListener('pointerup', finishSeek);
seekTrack.addEventListener('pointercancel', () => {
  if (state.seek) {
    clearTimeout(state.seek.timer);
    hideBubble();
    state.seek = null;
    scheduleHide();
  }
});

/* ============ 倍速 ============ */
function updateSpeedUI() {
  speedBtn.textContent = `${currentRate()}×`;
  $$('#speedSeg [data-speed]').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.speed) === currentRate());
  });
  saveSettings();
}

speedBtn.addEventListener('click', () => {
  state.speedIndex = (state.speedIndex + 1) % SPEEDS.length;
  updateSpeedUI();
  applyPlaybackRate();
  toast(`播放速度 ${currentRate()}×`);
  scheduleHide();
});

$$('#speedSeg [data-speed]').forEach((b) => {
  b.addEventListener('click', () => {
    state.speedIndex = SPEEDS.indexOf(Number(b.dataset.speed));
    updateSpeedUI();
    applyPlaybackRate();
    toast(`播放速度 ${currentRate()}×`);
  });
});

$$('#boostSeg [data-boost]').forEach((b) => {
  b.addEventListener('click', () => {
    state.boostRate = Number(b.dataset.boost);
    $$('#boostSeg [data-boost]').forEach((x) => x.classList.toggle('active', x === b));
    toast(`长按加速倍率 ${state.boostRate}×`);
    saveSettings();
  });
});

/* ============ 自动隐藏开关 ============ */
function updateSwitchUI() {
  autoHideSwitch.classList.toggle('on', state.autoHide);
  autoHideSwitch.setAttribute('aria-checked', String(state.autoHide));
}

autoHideSwitch.addEventListener('click', () => {
  state.autoHide = !state.autoHide;
  updateSwitchUI();
  saveSettings();
  scheduleHide();
});

/* ============ 设置面板 ============ */
function openSettings() {
  settingsPanel.classList.add('open');
  setControls(true, true);
  clearTimeout(state.hideTimer);
}

function closeSettings() {
  settingsPanel.classList.remove('open');
  scheduleHide();
}

settingsBtn.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
settingsPanel.addEventListener('click', (e) => {
  if (e.target.classList.contains('settings-backdrop')) closeSettings();
});

/* ============ 锁屏 ============ */
function setLocked(v) {
  state.locked = v;
  player.classList.toggle('locked', v);
  lockBadge.hidden = !v;
  if (v) {
    setControls(false, true);
    toast('已锁定 · 长按 🔒 解锁');
    vibrate(20);
  } else {
    setControls(true, true);
    toast('已解锁');
    vibrate(10);
  }
}

lockBtn.addEventListener('click', () => setLocked(true));

let unlockTimer = null, unlockPending = false, unlockStartX = 0;

function cancelUnlock() {
  clearTimeout(unlockTimer);
  unlockPending = false;
  lockBadge.classList.remove('pressing');
}

lockBadge.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  unlockPending = true;
  unlockStartX = e.clientX;
  lockBadge.classList.add('pressing');
  unlockTimer = setTimeout(() => {
    if (unlockPending) setLocked(false);
    cancelUnlock();
  }, 650);
});

lockBadge.addEventListener('pointermove', (e) => {
  if (unlockPending && Math.abs(e.clientX - unlockStartX) > 12) cancelUnlock();
});

lockBadge.addEventListener('pointerup', () => {
  if (unlockPending) toast('长按 🔒 解锁');
  cancelUnlock();
});

lockBadge.addEventListener('pointercancel', cancelUnlock);
lockBadge.addEventListener('contextmenu', (e) => e.preventDefault());

/* ============ 全屏 ============ */
function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function toggleFullscreen() {
  if (isFullscreen()) {
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (fn) {
      const r = fn.call(document);
      if (r && r.catch) r.catch(() => {});
    }
  } else if (video.webkitEnterFullscreen) {
    video.webkitEnterFullscreen();
  } else {
    const el = document.documentElement;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fn) {
      const r = fn.call(el);
      if (r && r.catch) r.catch(() => {});
    } else {
      toast('当前环境不支持全屏');
    }
  }
  if (screen.orientation && screen.orientation.lock) {
    try {
      const r = screen.orientation.lock('landscape');
      if (r && r.catch) r.catch(() => {});
    } catch (_) {}
  }
}

fullBtn.addEventListener('click', toggleFullscreen);

function updateFullIcon() {
  fullBtn.innerHTML = `<svg class="icon"><use href="#i-${state.fullscreen ? 'full-exit' : 'full'}"/></svg>`;
}

document.addEventListener('fullscreenchange', () => {
  state.fullscreen = isFullscreen();
  updateFullIcon();
});
document.addEventListener('webkitfullscreenchange', () => {
  state.fullscreen = isFullscreen();
  updateFullIcon();
});
video.addEventListener('webkitbeginfullscreen', () => {
  state.fullscreen = true;
  updateFullIcon();
});
video.addEventListener('webkitendfullscreen', () => {
  state.fullscreen = false;
  updateFullIcon();
});

/* ============ 选择视频（相册 / 文件） ============ */
function pickVideo() {
  fileInput.click();
}

$('#openPhotosBtn').addEventListener('click', pickVideo);
$('#openFilesBtn').addEventListener('click', pickVideo);
$('#openTopBtn').addEventListener('click', pickVideo);

fileInput.addEventListener('change', () => {
  const f = fileInput.files && fileInput.files[0];
  if (f) loadFile(f);
  fileInput.value = '';
});

function loadFile(file) {
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|mkv|avi|3gp|mts|m2ts)$/i.test(file.name)) {
    toast('请选择视频文件');
    return;
  }
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = URL.createObjectURL(file);
  video.src = state.objectUrl;
  emptyState.classList.add('hidden');
  fileNameEl.textContent = file.name;
  fileNameEl.title = file.name;
  video.load();
  const p = video.play();
  if (p && p.catch) p.catch(() => {});
  toast(`已加载：${file.name}`, 2200);
  setControls(true, true);
}

/* 桌面端拖拽 / 粘贴 */
['dragover', 'dragenter'].forEach((ev) => {
  app.addEventListener(ev, (e) => { e.preventDefault(); app.classList.add('dragging'); });
});
['dragleave', 'drop'].forEach((ev) => {
  app.addEventListener(ev, (e) => { e.preventDefault(); app.classList.remove('dragging'); });
});
app.addEventListener('drop', (e) => {
  const f = Array.from((e.dataTransfer && e.dataTransfer.files) || [])
    .find((x) => x.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i.test(x.name));
  if (f) loadFile(f);
  else toast('请拖入视频文件');
});

document.addEventListener('paste', (e) => {
  const f = Array.from((e.clipboardData && e.clipboardData.files) || [])
    .find((x) => x.type.startsWith('video/'));
  if (f) loadFile(f);
});

/* ============ 键盘快捷键（电脑端） ============ */
document.addEventListener('keydown', (e) => {
  if (e.target.closest('button')) {
    if (e.code === 'Space') e.preventDefault();
    return;
  }
  switch (e.code) {
    case 'Space': e.preventDefault(); togglePlay(); break;
    case 'ArrowLeft': seekBy(-10); break;
    case 'ArrowRight': seekBy(10); break;
    case 'ArrowUp': video.volume = clamp(video.volume + 0.1, 0, 1); break;
    case 'ArrowDown': video.volume = clamp(video.volume - 0.1, 0, 1); break;
    case 'KeyF': toggleFullscreen(); break;
  }
});

/* ============ 横屏处理 ============ */
const mqPortrait = window.matchMedia('(orientation: portrait)');

function checkOrientation() {
  const portrait = mqPortrait.matches;
  const forced = document.body.classList.contains('forced-landscape');
  rotateOverlay.classList.toggle('show', portrait && !forced);
  forceToggleBtn.hidden = !forced;
  if (!portrait && forced) {
    document.body.classList.remove('forced-landscape');
    toast('已恢复正常横屏');
  }
}

if (mqPortrait.addEventListener) mqPortrait.addEventListener('change', checkOrientation);
else if (mqPortrait.addListener) mqPortrait.addListener(checkOrientation);
window.addEventListener('resize', checkOrientation);

forceBtn.addEventListener('click', () => {
  document.body.classList.add('forced-landscape');
  checkOrientation();
  toast('已强制横屏（画面已旋转）');
  vibrate(15);
});

forceToggleBtn.addEventListener('click', () => {
  document.body.classList.remove('forced-landscape');
  checkOrientation();
  toast('已退出强制横屏');
});

/* ============ 初始化 ============ */
updateSpeedUI();
updateFullIcon();
updateSwitchUI();
$$('#boostSeg [data-boost]').forEach((b) => {
  b.classList.toggle('active', Number(b.dataset.boost) === state.boostRate);
});
setControls(true, true);
checkOrientation();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
