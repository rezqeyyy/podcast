/* Podcast Studio — studio engine (framework-agnostic, runs in the browser)
 * - WebRTC mesh (each participant connects to each other participant)
 * - Signaling + presence via Supabase Realtime (works on serverless hosts like Vercel)
 * - Active-speaker detection with Web Audio
 * - Layouts: auto (speaker focus + "show everyone" moments), speaker, grid
 * - Host records a composite video (canvas) + mixed audio, saved locally
 */
let supabase = null;          // Supabase client, injected by startStudio()
let DEFAULT_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const MAX_PEERS = 8;
const CHANNEL_PREFIX = 'podcast-studio:';

// ---------------------------------------------------------------- helpers
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => performance.now();

const ICON = {
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8"/></svg>',
  micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.7-1.3"/><path d="M19 10v1a7 7 0 0 1-1.1 3.8M5 10v1a7 7 0 0 0 11.4 5.4M12 18v4M8 22h8M3 3l18 18"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-4v12l-6-4z"/></svg>',
  camOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16v1a1 1 0 0 1-1 1H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2m4 0h5a1 1 0 0 1 1 1v3l6-4v12"/><path d="M3 3l18 18"/></svg>',
  flip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 8a8 8 0 0 0-14.5-2M4 4v4h4M4 16a8 8 0 0 0 14.5 2M20 20v-4h-4"/></svg>',
  rec: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#ff4d5e"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="#fff"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 9M22 21a7 7 0 0 0-4-6.3"/></svg>',
  leave: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17l-5-5 5-5M5 12h11M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/></svg>',
  muteSmall: '<svg class="mute" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.7-1.3M19 10v1a7 7 0 0 1-1.1 3.8M5 10v1a7 7 0 0 0 11.4 5.4M3 3l18 18"/></svg>',
};

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function initials(name) {
  const w = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || '?') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
}
function colorFor(seed) {
  let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 55% 45%)`;
}
function fmtTime(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60;
  const p = n => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}
function fmtSize(b) { return b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : (b / 1e6).toFixed(1) + ' MB'; }
function show(screen) { $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + screen)); }
function openModal(id) { $('#' + id).classList.remove('hidden'); }
function closeModal(id) { $('#' + id).classList.add('hidden'); }

// ---------------------------------------------------------------- state
const S = {
  code: null, hostToken: null, title: '', name: '',
  isHost: false,
  localStream: null,
  mic: true, cam: true, hasMic: false, hasCam: false,
  micId: '', camId: '',
  iceServers: [],
  channel: null, myId: null, joinedAt: 0, joined: false, leaving: false, firstSync: true, hadHost: false,
  layoutMode: 'auto',     // set by host, synced to everyone
  roomRecording: false,
  // speaker detection / auto layout
  activeId: null, activeSince: 0,
  autoView: 'grid', viewSince: 0, lastAnyVoice: 0, overlapStart: 0, wideShotUntil: 0,
};
const parts = new Map(); // key -> participant ('me' for local, peer id for remote)

const AUDIO_CONSTRAINTS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const VIDEO_CONSTRAINTS = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };

// ---------------------------------------------------------------- audio
let audioCtx = null;
function ensureCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}
function attachAnalyser(p) {
  const track = p.stream && p.stream.getAudioTracks()[0];
  if (!track) return;
  if (p.analysedTrackId === track.id) return;
  detachAnalyser(p);
  const ctx = ensureCtx();
  try {
    p.source = ctx.createMediaStreamSource(new MediaStream([track]));
    p.analyser = ctx.createAnalyser();
    p.analyser.fftSize = 1024;
    p.analyser.smoothingTimeConstant = 0.3;
    p.buf = new Float32Array(p.analyser.fftSize);
    p.source.connect(p.analyser);
    p.analysedTrackId = track.id;
    if (rec.active) connectToRecorder(p);
  } catch (e) { console.warn('analyser failed', e); }
}
function detachAnalyser(p) {
  try { p.source && p.source.disconnect(); } catch (_) {}
  p.source = p.analyser = p.buf = null; p.analysedTrackId = null; p.recConnected = false;
}
function readLevel(p) {
  if (!p.analyser || p.mic === false) return 0;
  p.analyser.getFloatTimeDomainData(p.buf);
  let sum = 0; for (let i = 0; i < p.buf.length; i++) sum += p.buf[i] * p.buf[i];
  return Math.sqrt(sum / p.buf.length);
}

// ---------------------------------------------------------------- realtime (Supabase)
const randId = (n = 6) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

function sendBroadcast(event, payload) {
  if (!S.channel) return;
  S.channel.send({ type: 'broadcast', event, payload }).catch?.(() => {});
}
// ICE candidates are batched (~120 ms) to stay well under realtime rate limits.
const candBuf = new Map();
function signal(to, data) {
  if (data.candidate) {
    let buf = candBuf.get(to);
    if (!buf) {
      buf = []; candBuf.set(to, buf);
      setTimeout(() => { candBuf.delete(to); sendBroadcast('signal', { from: S.myId, to, data: { candidates: buf } }); }, 120);
    }
    buf.push(data.candidate);
    return;
  }
  sendBroadcast('signal', { from: S.myId, to, data });
}
function sendKick(to) { sendBroadcast('kick', { from: S.myId, to }); }

// Everything others need to know about me lives in my presence entry.
// The host's entry also carries the room state (layout, recording, title).
function trackMe() {
  if (!S.channel || !S.joined) return;
  const meta = {
    id: S.myId, name: S.name, isHost: S.isHost, joinedAt: S.joinedAt,
    mic: S.mic && S.hasMic, cam: S.cam && S.hasCam,
  };
  if (S.isHost) meta.room = { layout: S.layoutMode, recording: rec.active, title: S.title };
  S.channel.track(meta).catch?.(() => {});
}

// Peek into a room (who's there, is the host in) without announcing ourselves.
function probeRoom(code) {
  return new Promise(resolve => {
    const ch = supabase.channel(CHANNEL_PREFIX + code, { config: { presence: { key: 'probe-' + randId() } } });
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      const metas = Object.values(ch.presenceState()).map(arr => arr[arr.length - 1]).filter(Boolean);
      const host = metas.find(m => m.isHost);
      supabase.removeChannel(ch).finally(() => resolve({
        participants: metas.length, full: metas.length >= MAX_PEERS,
        hostName: host ? host.name : null, title: host?.room?.title || '',
      }));
    };
    ch.on('presence', { event: 'sync' }, () => setTimeout(finish, 300));
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') setTimeout(finish, 2500); // empty rooms never send a sync
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { done = true; supabase.removeChannel(ch); resolve(null); }
    });
  });
}

// ---------------------------------------------------------------- HOME
function parseCodeFromUrl() {
  const m = location.pathname.match(/^\/([A-Za-z0-9]{6})$/);
  const q = new URLSearchParams(location.search).get('code');
  return (m ? m[1] : q || '').toUpperCase();
}
function initHome() {
  const saved = localStorage.getItem('ps:name') || '';
  $('#host-name').value = saved; $('#guest-name').value = saved;
  const code = parseCodeFromUrl();
  if (code) {
    $('#join-code').value = code;
    setTimeout(() => ($('#guest-name').value ? $('#btn-join') : $('#guest-name')).focus(), 50);
  }
  $('#join-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
  $('#btn-create').onclick = createRoom;
  $('#btn-join').onclick = joinRoom;
  $('#guest-name').addEventListener('keydown', e => e.key === 'Enter' && joinRoom());
  $('#join-code').addEventListener('keydown', e => e.key === 'Enter' && joinRoom());
  $('#host-name').addEventListener('keydown', e => e.key === 'Enter' && createRoom());
}
async function createRoom() {
  const name = $('#host-name').value.trim();
  if (!name) { $('#home-error').textContent = 'Isi nama lu dulu.'; return $('#host-name').focus(); }
  const code = makeCode();
  S.code = code; S.hostToken = randId(16); S.name = name; S.title = $('#room-title').value.trim();
  S.lobbyInfo = null;
  sessionStorage.setItem('ps:host:' + code, JSON.stringify({ token: S.hostToken, title: S.title }));
  localStorage.setItem('ps:name', name);
  history.replaceState(null, '', '/' + code);
  goLobby();
}
async function joinRoom() {
  const code = $('#join-code').value.trim().toUpperCase();
  const name = $('#guest-name').value.trim();
  $('#home-error').textContent = '';
  if (code.length !== 6) { $('#home-error').textContent = 'Kode undangan harus 6 karakter.'; return $('#join-code').focus(); }
  if (!name) { $('#home-error').textContent = 'Isi nama lu dulu.'; return $('#guest-name').focus(); }
  $('#btn-join').disabled = true; $('#btn-join').textContent = 'Ngecek kode…';
  try {
    // The host refreshing the page keeps the host seat (same browser tab session).
    const saved = JSON.parse(sessionStorage.getItem('ps:host:' + code) || 'null');
    const info = await probeRoom(code);
    if (!info) { $('#home-error').textContent = 'Gagal nyambung ke server realtime. Coba lagi.'; return; }
    if (info.full) { $('#home-error').textContent = 'Studio udah penuh.'; return; }
    S.code = code; S.name = name;
    S.hostToken = saved ? saved.token : null;
    S.title = info.title || (saved && saved.title) || '';
    S.lobbyInfo = info;
    localStorage.setItem('ps:name', name);
    history.replaceState(null, '', '/' + code);
    goLobby();
  } finally { $('#btn-join').disabled = false; $('#btn-join').textContent = 'Gabung'; }
}

// ---------------------------------------------------------------- LOBBY
let lobbyMeterRaf = 0, lobbyAnalyser = null, lobbySource = null;
async function goLobby() {
  show('lobby');
  $('#lobby-title').textContent = S.title || (S.hostToken ? 'Studio lu' : 'Studio podcast');
  $('#lobby-eyebrow').textContent = S.hostToken ? 'Lu host · kode ' + S.code : 'Gabung · kode ' + S.code;
  const info = S.lobbyInfo;
  $('#lobby-sub').textContent = S.hostToken
    ? 'Cek mic & kamera dulu. Setelah masuk, klik kode di pojok kanan atas buat ngundang tamu.'
    : info && info.participants
      ? `${info.participants} orang udah di dalam${info.hostName ? ' bareng ' + info.hostName : ' (host belum masuk)'}.`
      : 'Belum ada orang di dalam. Kalau kodenya bener, lu bisa masuk duluan dan nunggu host.';
  $('#lobby-error').textContent = '';
  renderLobbyButtons();
  await startMedia();
  await fillDeviceSelects();
}
function renderLobbyButtons() {
  const m = $('#lobby-mic'), c = $('#lobby-cam');
  m.innerHTML = S.mic && S.hasMic ? ICON.mic : ICON.micOff;
  c.innerHTML = S.cam && S.hasCam ? ICON.cam : ICON.camOff;
  m.classList.toggle('off', !(S.mic && S.hasMic)); c.classList.toggle('off', !(S.cam && S.hasCam));
  m.disabled = !S.hasMic; c.disabled = !S.hasCam;
  $('#preview-off').classList.toggle('hidden', S.cam && S.hasCam);
}
async function startMedia() {
  stopLocalTracks();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    S.hasMic = S.hasCam = false; S.localStream = new MediaStream();
    $('#lobby-error').textContent = 'Browser nggak ngizinin akses mic/kamera. Buka lewat HTTPS (atau localhost). Lu masih bisa gabung buat dengerin.';
    renderLobbyButtons(); return;
  }
  const audio = S.micId ? { ...AUDIO_CONSTRAINTS, deviceId: { exact: S.micId } } : AUDIO_CONSTRAINTS;
  const video = S.camId ? { ...VIDEO_CONSTRAINTS, deviceId: { exact: S.camId } } : { ...VIDEO_CONSTRAINTS, facingMode: 'user' };
  let stream = null, msg = '';
  try { stream = await navigator.mediaDevices.getUserMedia({ audio, video }); }
  catch (e1) {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio }); msg = 'Kamera nggak kebaca atau ditolak — lu masuk pake suara aja.'; }
    catch (e2) {
      try { stream = await navigator.mediaDevices.getUserMedia({ video }); msg = 'Mic nggak kebaca atau ditolak.'; }
      catch (e3) { stream = new MediaStream(); msg = 'Mic & kamera nggak bisa diakses. Cek izin browser. Lu masih bisa gabung buat dengerin.'; }
    }
  }
  S.localStream = stream;
  S.hasMic = stream.getAudioTracks().length > 0;
  S.hasCam = stream.getVideoTracks().length > 0;
  stream.getAudioTracks().forEach(t => t.enabled = S.mic);
  stream.getVideoTracks().forEach(t => t.enabled = S.cam);
  $('#lobby-error').textContent = msg;
  $('#preview').srcObject = stream;
  renderLobbyButtons();
  startLobbyMeter();
}
function startLobbyMeter() {
  cancelAnimationFrame(lobbyMeterRaf);
  try { lobbySource && lobbySource.disconnect(); } catch (_) {}
  const t = S.localStream.getAudioTracks()[0];
  if (!t) { $('#preview-meter').style.width = '0%'; return; }
  const ctx = ensureCtx();
  lobbySource = ctx.createMediaStreamSource(new MediaStream([t]));
  lobbyAnalyser = ctx.createAnalyser(); lobbyAnalyser.fftSize = 1024;
  lobbySource.connect(lobbyAnalyser);
  const buf = new Float32Array(1024);
  const loop = () => {
    lobbyAnalyser.getFloatTimeDomainData(buf);
    let s = 0; for (const v of buf) s += v * v;
    const lvl = S.mic ? Math.min(1, Math.sqrt(s / buf.length) * 8) : 0;
    $('#preview-meter').style.width = (lvl * 100).toFixed(0) + '%';
    if ($('#screen-lobby').classList.contains('active')) lobbyMeterRaf = requestAnimationFrame(loop);
  };
  loop();
}
async function fillDeviceSelects() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devs = await navigator.mediaDevices.enumerateDevices();
  const fill = (sel, kind, current) => {
    const list = devs.filter(d => d.kind === kind);
    sel.innerHTML = list.length ? '' : '<option>(nggak ada)</option>';
    list.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId; o.textContent = d.label || `${kind === 'audioinput' ? 'Mic' : 'Kamera'} ${i + 1}`;
      if (d.deviceId === current) o.selected = true;
      sel.appendChild(o);
    });
    sel.disabled = !list.length;
  };
  const curMic = S.localStream.getAudioTracks()[0]?.getSettings().deviceId || S.micId;
  const curCam = S.localStream.getVideoTracks()[0]?.getSettings().deviceId || S.camId;
  fill($('#sel-mic'), 'audioinput', curMic);
  fill($('#sel-cam'), 'videoinput', curCam);
}
function initLobby() {
  $('#lobby-mic').onclick = () => { S.mic = !S.mic; S.localStream.getAudioTracks().forEach(t => t.enabled = S.mic); renderLobbyButtons(); };
  $('#lobby-cam').onclick = () => { S.cam = !S.cam; S.localStream.getVideoTracks().forEach(t => t.enabled = S.cam); renderLobbyButtons(); };
  $('#sel-mic').onchange = async e => { S.micId = e.target.value; await startMedia(); };
  $('#sel-cam').onchange = async e => { S.camId = e.target.value; await startMedia(); };
  $('#btn-back').onclick = () => { stopLocalTracks(); history.replaceState(null, '', '/'); show('home'); };
  $('#btn-enter').onclick = enterStudio;
}
function stopLocalTracks() {
  if (S.localStream) S.localStream.getTracks().forEach(t => t.stop());
  S.localStream = null;
}

// ---------------------------------------------------------------- STUDIO: join
function enterStudio() {
  ensureCtx();
  cancelAnimationFrame(lobbyMeterRaf);
  try { lobbySource && lobbySource.disconnect(); } catch (_) {}
  show('studio');
  S.leaving = false;
  S.isHost = !!S.hostToken;
  document.body.classList.toggle('is-host', S.isHost);
  S.iceServers = DEFAULT_ICE;
  $('#studio-title').textContent = S.title || 'Studio podcast';
  $('#code-label').textContent = S.code;
  addLocalPart();
  renderControls();
  connectSignaling();
  startLoops();
}
function connectSignaling() {
  S.myId = randId(6);
  S.joinedAt = Date.now();
  S.firstSync = true;
  const ch = supabase.channel(CHANNEL_PREFIX + S.code, {
    config: { broadcast: { self: false }, presence: { key: S.myId } },
  });
  S.channel = ch;
  ch.on('broadcast', { event: 'signal' }, ({ payload }) => {
    if (!payload || payload.to !== S.myId) return;
    let p = parts.get(payload.from);
    // Their offer can arrive before their presence does — keep a placeholder.
    if (!p) p = addRemotePart({ id: payload.from, name: '…', mic: true, cam: true, joinedAt: Date.now(), provisional: true });
    p.chain = p.chain.then(() => handleSignal(p, payload.data)).catch(e => console.warn('signal error', e));
  });
  ch.on('broadcast', { event: 'kick' }, ({ payload }) => {
    if (payload && payload.to === S.myId) { toast('Lu dikeluarin dari studio sama host.', 4000); leaveStudio(true); }
  });
  ch.on('presence', { event: 'sync' }, () => onPresenceSync(ch.presenceState()));
  ch.subscribe(status => {
    if (S.channel !== ch || S.leaving) return;
    if (status === 'SUBSCRIBED') {
      const first = !S.joined;
      S.joined = true;
      parts.get('me').peerId = S.myId;
      trackMe();
      if (first) renderControls();
      else toast('Nyambung lagi');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      // supabase-js keeps retrying on its own; calls already connected stay up (they're peer-to-peer).
      toast('Koneksi ke server realtime putus, nyoba nyambung lagi…', 3500);
    }
  });
}
function onPresenceSync(state) {
  const seen = new Map();
  for (const [key, metas] of Object.entries(state)) {
    const m = metas && metas[metas.length - 1];
    if (!m || key === S.myId || key.startsWith('probe-')) continue;
    seen.set(key, m);
  }
  const quiet = S.firstSync; S.firstSync = false;

  // room state comes from the host's presence entry
  if (!S.isHost) {
    const host = [...seen.values()].find(m => m.isHost);
    if (host && host.room) applyRoom(host.room, quiet);
    else if (S.hadHost) { toast('Host keluar dari studio'); applyRoom({ layout: S.layoutMode, recording: false }, true); }
    S.hadHost = !!host;
  }
  // left
  for (const key of [...parts.keys()]) {
    if (key === 'me' || seen.has(key)) continue;
    const p = parts.get(key);
    if (p.provisional && Date.now() - p.provisionalAt < 10000) continue;
    if (!p.provisional) toast(`${p.name} keluar`);
    removePart(key);
  }
  // joined / updated
  for (const [key, m] of seen) {
    let p = parts.get(key);
    if (!p) {
      p = addRemotePart({ id: key, ...m });
      if (!quiet) toast(`${m.name} gabung`);
      // the newer participant sends the offer (deterministic, no glare)
      if (S.joinedAt > m.joinedAt || (S.joinedAt === m.joinedAt && S.myId > key)) createPC(p, true);
    } else {
      Object.assign(p, { name: m.name, mic: m.mic, cam: m.cam, isHost: m.isHost, joinedAt: m.joinedAt, provisional: false });
      updateTile(p);
    }
  }
  adjustBitrates();
  renderPeople();
  renderControls();
}
function applyRoom(room, quiet) {
  const wasRecording = S.roomRecording;
  S.layoutMode = room.layout || 'auto';
  S.roomRecording = !!room.recording;
  if (typeof room.title === 'string' && room.title !== S.title) { S.title = room.title; }
  $('#studio-title').textContent = S.title || 'Studio podcast';
  if (!quiet && S.roomRecording !== wasRecording) toast(S.roomRecording ? '🔴 Host mulai merekam' : 'Rekaman dihentikan');
  renderControls();
}

// ---------------------------------------------------------------- participants & tiles
function basePart(key) {
  return {
    key, name: '', isHost: false, mic: true, cam: true, joinedAt: Date.now(), stream: null,
    level: 0, lastVoice: 0, speaking: false, speakStart: 0, chain: Promise.resolve(), pending: [],
  };
}
function addLocalPart() {
  const p = basePart('me');
  Object.assign(p, { isMe: true, name: S.name, mic: S.mic && S.hasMic, cam: S.cam && S.hasCam, isHost: !!S.hostToken, stream: S.localStream });
  parts.set('me', p);
  makeTile(p);
  p.tile.video.srcObject = S.localStream;
  attachAnalyser(p);
  updateTile(p);
  renderPeople();
}
function addRemotePart(peer) {
  if (parts.has(peer.id)) return parts.get(peer.id);
  const p = basePart(peer.id);
  Object.assign(p, { name: peer.name, isHost: !!peer.isHost, mic: peer.mic !== false, cam: peer.cam !== false, joinedAt: peer.joinedAt || Date.now(),
    provisional: !!peer.provisional, provisionalAt: Date.now() });
  p.audioEl = document.createElement('audio');
  p.audioEl.autoplay = true; p.audioEl.setAttribute('playsinline', '');
  p.audioEl.style.display = 'none';
  document.body.appendChild(p.audioEl);
  parts.set(peer.id, p);
  makeTile(p);
  updateTile(p);
  renderPeople();
  return p;
}
function removePart(key) {
  const p = parts.get(key);
  if (!p) return;
  try { p.pc && p.pc.close(); } catch (_) {}
  detachAnalyser(p);
  if (p.audioEl) { p.audioEl.srcObject = null; p.audioEl.remove(); }
  if (p.tile) {
    const el = p.tile.el; el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }
  parts.delete(key);
  if (S.activeId === key) S.activeId = null;
  if (rec.rects) delete rec.rects[key];
  renderPeople();
}
function makeTile(p) {
  const el = document.createElement('div');
  el.className = 'tile' + (p.isMe ? ' me' : '');
  el.style.opacity = '0';
  el.innerHTML = `<video autoplay playsinline muted></video>
    <div class="avatar"><span></span></div>
    <div class="label">${ICON.muteSmall}<span class="nm"></span><span class="host hidden">HOST</span></div>
    <div class="conn hidden"></div>`;
  const stage = $('#stage');
  const w = stage.clientWidth, h = stage.clientHeight;
  Object.assign(el.style, { left: w / 2 - 80 + 'px', top: h / 2 - 45 + 'px', width: '160px', height: '90px' });
  stage.appendChild(el);
  p.tile = { el, video: el.querySelector('video'), avatar: el.querySelector('.avatar span'), nm: el.querySelector('.nm'), host: el.querySelector('.host'), conn: el.querySelector('.conn'), rect: null };
  requestAnimationFrame(() => (el.style.opacity = '1'));
}
function updateTile(p) {
  if (!p.tile) return;
  const t = p.tile;
  const hasVideo = !!(p.stream && p.stream.getVideoTracks().some(tr => tr.readyState === 'live'));
  t.el.classList.toggle('cam-off', !p.cam || !hasVideo);
  t.el.classList.toggle('mic-off', !p.mic);
  t.nm.textContent = p.isMe ? `${p.name} (lu)` : p.name;
  t.host.classList.toggle('hidden', !p.isHost);
  t.avatar.textContent = initials(p.name);
  t.avatar.style.background = colorFor(p.name);
}
function orderedKeys() {
  return [...parts.values()]
    .sort((a, b) => (b.isHost - a.isHost) || (a.joinedAt - b.joinedAt))
    .map(p => p.key);
}

// ---------------------------------------------------------------- WebRTC
function createPC(p, initiator) {
  const pc = new RTCPeerConnection({ iceServers: S.iceServers });
  p.pc = pc; p.initiator = initiator;
  pc.onicecandidate = e => { if (e.candidate) signal(p.key, { candidate: e.candidate.toJSON() }); };
  pc.ontrack = e => {
    const stream = e.streams && e.streams[0] ? e.streams[0] : (p.stream || new MediaStream());
    if (!e.streams || !e.streams[0]) stream.addTrack(e.track);
    if (p.stream !== stream) {
      p.stream = stream;
      p.tile.video.srcObject = stream;
      p.audioEl.srcObject = stream;
    }
    p.audioEl.play().catch(() => showAudioUnlock());
    p.tile.video.play().catch(() => {});
    if (e.track.kind === 'audio') attachAnalyser(p);
    e.track.onunmute = () => updateTile(p);
    updateTile(p);
  };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    const label = { connecting: 'Menyambung…', failed: 'Gagal nyambung', disconnected: 'Sinyal putus…' }[st];
    p.tile.conn.textContent = label || '';
    p.tile.conn.classList.toggle('hidden', !label);
    if (st === 'connected') adjustBitrates();
    if (st === 'failed' && p.initiator) restartIce(p);
  };
  if (initiator) {
    addLocalTracks(pc, true);
    makeOffer(p);
  }
  return pc;
}
function addLocalTracks(pc, addRecvOnlyIfMissing) {
  const s = S.localStream;
  for (const kind of ['audio', 'video']) {
    const track = s && s.getTracks().find(t => t.kind === kind);
    if (track) pc.addTrack(track, s);
    else if (addRecvOnlyIfMissing) pc.addTransceiver(kind, { direction: 'recvonly' });
  }
}
async function makeOffer(p, iceRestart = false) {
  const offer = await p.pc.createOffer({ iceRestart });
  await p.pc.setLocalDescription(offer);
  signal(p.key, { sdp: p.pc.localDescription.toJSON() });
}
async function restartIce(p) {
  await sleep(1000);
  if (!p.pc || p.pc.connectionState !== 'failed') return;
  try { await makeOffer(p, true); } catch (e) { console.warn('ice restart failed', e); }
}
async function handleSignal(p, data) {
  if (data.sdp) {
    if (data.sdp.type === 'offer') {
      const fresh = !p.pc;
      if (fresh) createPC(p, false);
      await p.pc.setRemoteDescription(data.sdp);
      if (fresh) addLocalTracks(p.pc, false); // reuse transceivers created by the offer
      const answer = await p.pc.createAnswer();
      await p.pc.setLocalDescription(answer);
      signal(p.key, { sdp: p.pc.localDescription.toJSON() });
    } else if (data.sdp.type === 'answer') {
      if (p.pc && p.pc.signalingState === 'have-local-offer') await p.pc.setRemoteDescription(data.sdp);
    }
    for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
  } else if (data.candidates || data.candidate) {
    for (const c of data.candidates || [data.candidate]) {
      if (p.pc && p.pc.remoteDescription) await p.pc.addIceCandidate(c).catch(() => {});
      else p.pending.push(c);
    }
  }
}
// Mesh = everyone uploads to everyone, so lower video bitrate as the room grows.
function adjustBitrates() {
  const n = parts.size - 1;
  const videoMax = n <= 2 ? 1_500_000 : n <= 4 ? 800_000 : 500_000;
  for (const p of parts.values()) {
    if (!p.pc) continue;
    for (const sender of p.pc.getSenders()) {
      if (!sender.track) continue;
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) continue;
      params.encodings[0].maxBitrate = sender.track.kind === 'video' ? videoMax : 96_000;
      sender.setParameters(params).catch(() => {});
    }
  }
}
let unlockShown = false;
function showAudioUnlock() {
  if (unlockShown) return; unlockShown = true;
  toast('Tap di mana aja buat nyalain suara', 5000);
  const unlock = () => {
    ensureCtx();
    for (const p of parts.values()) p.audioEl && p.audioEl.play().catch(() => {});
    document.removeEventListener('pointerdown', unlock); unlockShown = false;
  };
  document.addEventListener('pointerdown', unlock);
}

// ---------------------------------------------------------------- speaker detection & auto layout
const SPEAK_THRESHOLD = 0.018;   // RMS level counted as voice
const SPEAK_HANG_MS = 350;       // keep "speaking" briefly after voice drops (between words)
const MIN_SPEAK_MS = 250;        // need this much voice before someone can take focus
const MIN_FOCUS_MS = 1200;       // minimum time before focus moves to another speaker
const SILENCE_TO_GRID_MS = 4000; // nobody talking → show everyone
const OVERLAP_TO_GRID_MS = 1200; // 2+ people talking at once → show everyone
const WIDE_SHOT_EVERY_MS = 40000;// in a long monologue, cut to everyone briefly…
const WIDE_SHOT_LEN_MS = 4000;   // …for this long
const MIN_VIEW_MS = 2000;        // minimum time a view stays before switching

function tick() {
  const t = now();
  const keys = orderedKeys();
  for (const key of keys) {
    const p = parts.get(key);
    const raw = readLevel(p);
    p.level = p.level * 0.5 + raw * 0.5;
    if (p.level > SPEAK_THRESHOLD) p.lastVoice = t;
    const speaking = t - p.lastVoice < SPEAK_HANG_MS && p.lastVoice > 0;
    if (speaking && !p.speaking) p.speakStart = t;
    p.speaking = speaking;
    if (p.tile) p.tile.el.classList.toggle('speaking', speaking);
  }
  const speakingKeys = keys.filter(k => parts.get(k).speaking);

  // --- who has the focus?
  let cand = null;
  for (const k of speakingKeys) {
    const p = parts.get(k);
    if (t - p.speakStart >= MIN_SPEAK_MS && (!cand || p.level > cand.level)) cand = p;
  }
  const cur = parts.get(S.activeId);
  if (!cur) {
    S.activeId = cand ? cand.key : (keys.find(k => k !== 'me') || keys[0] || null);
    S.activeSince = t;
  } else if (cand && cand.key !== cur.key && t - S.activeSince > MIN_FOCUS_MS) {
    const curQuiet = !cur.speaking && t - cur.lastVoice > 500;
    const takeover = t - cand.speakStart > 1500 && cand.level > cur.level * 1.3;
    if (curQuiet || takeover) { S.activeId = cand.key; S.activeSince = t; }
  }

  // --- auto view: speaker focus vs everyone
  if (speakingKeys.length) S.lastAnyVoice = t;
  if (speakingKeys.length >= 2) { if (!S.overlapStart) S.overlapStart = t; } else S.overlapStart = 0;
  let want = S.autoView;
  if (keys.length <= 1) want = 'grid';
  else if (S.overlapStart && t - S.overlapStart > OVERLAP_TO_GRID_MS) want = 'grid';
  else if (t - S.lastAnyVoice > SILENCE_TO_GRID_MS) want = 'grid';
  else if (speakingKeys.length === 1 && cand && cand.key === S.activeId) want = 'speaker';
  if (S.autoView === 'speaker' && want === 'speaker' && t - S.viewSince > WIDE_SHOT_EVERY_MS) S.wideShotUntil = t + WIDE_SHOT_LEN_MS;
  if (S.wideShotUntil > t) want = 'grid';
  if (want !== S.autoView && t - S.viewSince > MIN_VIEW_MS) { S.autoView = want; S.viewSince = t; }

  renderStage();
  if (rec.active) $('#rec-time').textContent = fmtTime(Date.now() - rec.startedAt);
  else if (S.roomRecording) $('#rec-time').textContent = '';
}
function currentView() {
  if (S.layoutMode === 'grid') return 'grid';
  if (S.layoutMode === 'speaker') return parts.size > 1 ? 'speaker' : 'grid';
  return S.autoView;
}

// ---------------------------------------------------------------- layout math (shared by screen + recording)
function gridRects(out, keys, x0, y0, w, h, gap, aspect) {
  const n = keys.length;
  let best = { tw: 0, cols: 1, rows: 1 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const tw = Math.min((w - gap * (cols - 1)) / cols, ((h - gap * (rows - 1)) / rows) * aspect);
    if (tw > best.tw) best = { tw, cols, rows };
  }
  const { tw, cols, rows } = best, th = tw / aspect;
  const totalH = rows * th + (rows - 1) * gap;
  let i = 0;
  for (let r = 0; r < rows; r++) {
    const cnt = r < rows - 1 ? cols : n - cols * (rows - 1);
    const rowW = cnt * tw + (cnt - 1) * gap;
    let x = x0 + (w - rowW) / 2;
    const y = y0 + (h - totalH) / 2 + r * (th + gap);
    for (let c = 0; c < cnt; c++, i++) { out[keys[i]] = { x, y, w: tw, h: th, a: 1 }; x += tw + gap; }
  }
  return out;
}
function computeRects(view, keys, activeId, W, H, o) {
  const out = {};
  if (!keys.length) return out;
  const x0 = o.pad, y0 = o.pad, w = W - 2 * o.pad, h = H - 2 * o.pad;
  if (view === 'grid' || keys.length === 1 || !keys.includes(activeId)) return gridRects(out, keys, x0, y0, w, h, o.gap, o.aspect);
  const others = keys.filter(k => k !== activeId);
  if (!o.thumbs) {
    // Recording: speaker fills the frame; others fade out where their grid tile would be.
    const tmp = gridRects({}, keys, x0, y0, w, h, o.gap, o.aspect);
    for (const k of others) out[k] = { ...tmp[k], a: 0 };
    out[activeId] = { x: 0, y: 0, w: W, h: H, a: 1, full: true };
    return out;
  }
  const portrait = w / h < 1, k = others.length, ta = portrait ? 3 / 4 : 16 / 9;
  let th = Math.min(h * (portrait ? 0.2 : 0.22), portrait ? 150 : 170), tw = th * ta;
  if (k * tw + (k - 1) * o.gap > w) { tw = (w - (k - 1) * o.gap) / k; th = tw / ta; }
  const mainH = h - th - o.gap;
  const mainW = portrait ? w : Math.min(w, mainH * 16 / 9);
  out[activeId] = { x: x0 + (w - mainW) / 2, y: y0, w: mainW, h: mainH, a: 1 };
  const rowW = k * tw + (k - 1) * o.gap;
  let x = x0 + (w - rowW) / 2;
  for (const key of others) { out[key] = { x, y: y0 + mainH + o.gap, w: tw, h: th, a: 1, small: true }; x += tw + o.gap; }
  return out;
}
const VIEW_LABEL = { grid: 'Semua', speaker: 'Sorot' };
function renderStage() {
  const stage = $('#stage');
  const W = stage.clientWidth, H = stage.clientHeight;
  if (!W || !H) return;
  const view = currentView();
  const rects = computeRects(view, orderedKeys(), S.activeId, W, H, { pad: 0, gap: W < 600 ? 6 : 10, thumbs: true, aspect: W / H < 1 ? 3 / 4 : 16 / 9 });
  for (const [key, r] of Object.entries(rects)) {
    const p = parts.get(key); if (!p || !p.tile) continue;
    const sig = `${r.x | 0},${r.y | 0},${r.w | 0},${r.h | 0}`;
    if (p.tile.rect !== sig) {
      p.tile.rect = sig;
      Object.assign(p.tile.el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
      p.tile.el.classList.toggle('small', !!r.small || r.w < 200);
    }
  }
  $('#view-label').textContent = (S.layoutMode === 'auto' ? 'Auto · ' : '') + VIEW_LABEL[view];
}

// ---------------------------------------------------------------- recording (host)
const rec = { active: false };
function pickMime(list) {
  if (!window.MediaRecorder) return '';
  return list.find(m => MediaRecorder.isTypeSupported(m)) || '';
}
function extFor(mime, fallback) {
  if (mime.startsWith('video/mp4')) return 'mp4';
  if (mime.startsWith('audio/mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('webm')) return 'webm';
  return fallback;
}
function connectToRecorder(p) {
  if (!rec.active || !p.source || p.recConnected) return;
  try { p.source.connect(rec.dest); p.recConnected = true; } catch (_) {}
}
// A worker-driven clock keeps drawing frames even if the tab loses focus (timers in
// background tabs get throttled to 1/sec, which would freeze the video).
function makeClock(fps, fn) {
  try {
    const src = `let t=setInterval(()=>postMessage(0),${Math.round(1000 / fps)});onmessage=()=>clearInterval(t);`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = fn;
    return () => { w.postMessage('stop'); w.terminate(); };
  } catch (_) {
    const id = setInterval(fn, 1000 / fps);
    return () => clearInterval(id);
  }
}
async function startRecording() {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    return toast('Browser ini nggak support rekam. Host pake Chrome / Edge / Firefox di laptop ya.', 4500);
  }
  const ctx = ensureCtx();
  rec.dest = ctx.createMediaStreamDestination();
  rec.canvas = document.createElement('canvas');
  rec.canvas.width = 1280; rec.canvas.height = 720;
  rec.g = rec.canvas.getContext('2d');
  rec.rects = {}; rec.lastFrameAt = 0;
  rec.active = true;
  for (const p of parts.values()) connectToRecorder(p);
  drawFrame();

  const vTrack = rec.canvas.captureStream(30).getVideoTracks()[0];
  const mixed = new MediaStream([vTrack, ...rec.dest.stream.getAudioTracks()]);
  rec.vMime = pickMime(['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']);
  rec.aMime = pickMime(['audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']);
  try {
    rec.vr = new MediaRecorder(mixed, { ...(rec.vMime && { mimeType: rec.vMime }), videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 192_000 });
    rec.ar = new MediaRecorder(rec.dest.stream, { ...(rec.aMime && { mimeType: rec.aMime }), audioBitsPerSecond: 192_000 });
  } catch (e) {
    rec.active = false; console.error(e);
    return toast('Gagal mulai rekam: ' + e.message, 4500);
  }
  rec.vChunks = []; rec.aChunks = [];
  rec.vr.ondataavailable = e => e.data.size && rec.vChunks.push(e.data);
  rec.ar.ondataavailable = e => e.data.size && rec.aChunks.push(e.data);
  rec.vr.start(1000); rec.ar.start(1000);
  // Drop ticks that pile up while the main thread is busy, so a slow machine
  // lowers the frame rate instead of building an ever-growing backlog.
  let lastDraw = 0;
  rec.stopClock = makeClock(30, () => {
    const t = now();
    if (t - lastDraw < 28) return;
    lastDraw = t; drawFrame();
  });
  rec.startedAt = Date.now();
  trackMe();
  renderControls();
  toast('🔴 Mulai merekam. Biarin tab ini tetap kebuka ya.');
}
function stopRecording() {
  if (!rec.active) return Promise.resolve();
  rec.active = false;
  rec.stopClock && rec.stopClock();
  const duration = Date.now() - rec.startedAt;
  const done = r => new Promise(res => { if (r.state === 'inactive') return res(); r.onstop = res; r.stop(); });
  trackMe();
  renderControls();
  return Promise.all([done(rec.vr), done(rec.ar)]).then(() => {
    for (const p of parts.values()) { if (p.recConnected) { try { p.source.disconnect(rec.dest); } catch (_) {} p.recConnected = false; } }
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const base = (S.title || 'podcast').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'podcast';
    const vBlob = new Blob(rec.vChunks, { type: rec.vr.mimeType || rec.vMime || 'video/webm' });
    const aBlob = new Blob(rec.aChunks, { type: rec.ar.mimeType || rec.aMime || 'audio/webm' });
    const files = [
      { label: 'Video (tampilan otomatis)', blob: vBlob, name: `${base}-${stamp}.${extFor(vBlob.type, 'webm')}` },
      { label: 'Audio aja', blob: aBlob, name: `${base}-${stamp}-audio.${extFor(aBlob.type, 'webm')}` },
    ];
    const box = $('#downloads'); box.innerHTML = '';
    files.forEach((f, i) => {
      const a = document.createElement('a');
      a.className = 'btn' + (i === 0 ? ' primary' : '');
      a.href = URL.createObjectURL(f.blob); a.download = f.name;
      a.textContent = `⬇ ${f.label} · ${fmtSize(f.blob.size)}`;
      box.appendChild(a);
    });
    $('#done-sub').textContent = `Durasi ${fmtTime(duration)}. Download dua-duanya sebelum nutup tab.`;
    openModal('modal-done');
  });
}
function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function drawCover(g, video, x, y, w, h) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const s = Math.max(w / vw, h / vh), sw = w / s, sh = h / s;
  g.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, w, h);
}
function drawFrame() {
  if (!rec.g) return;
  const g = rec.g, W = 1280, H = 720;
  g.fillStyle = '#0c0d10'; g.fillRect(0, 0, W, H);
  const view = currentView();
  const keys = orderedKeys();
  const target = computeRects(view, keys, S.activeId, W, H, { pad: 28, gap: 16, thumbs: false, aspect: 16 / 9 });
  // time-based easing (~90% of the way in 0.35s regardless of frame rate)
  const tNow = now(), dt = Math.min(500, tNow - (rec.lastFrameAt || tNow));
  rec.lastFrameAt = tNow;
  const k = dt ? 1 - Math.exp(-dt / 150) : 1;
  for (const key of keys) {
    const t = target[key]; if (!t) continue;
    const r = rec.rects[key] || (rec.rects[key] = { ...t, a: 0 });
    r.x += (t.x - r.x) * k; r.y += (t.y - r.y) * k; r.w += (t.w - r.w) * k; r.h += (t.h - r.h) * k; r.a += (t.a - r.a) * k;
  }
  // draw the focused speaker last so it sits on top during transitions
  const order = keys.filter(k2 => k2 !== S.activeId).concat(keys.includes(S.activeId) ? [S.activeId] : []);
  for (const key of order) {
    const p = parts.get(key), r = rec.rects[key];
    if (!p || !r || r.a < 0.01) continue;
    const full = r.w > W - 2 && r.h > H - 2;
    const radius = full ? 0 : 16;
    g.save();
    g.globalAlpha = Math.min(1, r.a);
    roundRect(g, r.x, r.y, r.w, r.h, radius); g.clip();
    g.fillStyle = '#15171c'; g.fillRect(r.x, r.y, r.w, r.h);
    const v = p.tile && p.tile.video;
    const camOn = p.cam && v && v.readyState >= 2 && v.videoWidth > 0 && p.stream && p.stream.getVideoTracks().some(tr => tr.readyState === 'live');
    if (camOn) drawCover(g, v, r.x, r.y, r.w, r.h);
    else {
      const rad = Math.min(r.w, r.h) * 0.2 * (p.speaking ? 1.06 : 1);
      g.fillStyle = colorFor(p.name);
      g.beginPath(); g.arc(r.x + r.w / 2, r.y + r.h / 2, rad, 0, Math.PI * 2); g.fill();
      if (p.speaking) { g.strokeStyle = '#3ddc97'; g.lineWidth = 5; g.stroke(); }
      g.fillStyle = '#fff'; g.font = `800 ${Math.round(rad * 0.75)}px system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(initials(p.name), r.x + r.w / 2, r.y + r.h / 2 + 2);
    }
    g.restore();
    g.save();
    g.globalAlpha = Math.min(1, r.a);
    if (p.speaking && !full && keys.length > 1) {
      g.strokeStyle = '#3ddc97'; g.lineWidth = 4;
      roundRect(g, r.x + 2, r.y + 2, r.w - 4, r.h - 4, radius); g.stroke();
    }
    // name label
    const fs = Math.round(Math.max(14, Math.min(26, r.h * (full ? 0.036 : 0.06))));
    g.font = `600 ${fs}px system-ui, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
    const label = p.name;
    const tw = g.measureText(label).width;
    const lx = r.x + (full ? 36 : 12), ly = r.y + r.h - (full ? 40 : 12) - fs * 1.6;
    g.fillStyle = 'rgba(0,0,0,.55)';
    roundRect(g, lx, ly, tw + fs * 1.2 + (p.mic ? 0 : fs * 1.1), fs * 1.6, fs * 0.4); g.fill();
    g.fillStyle = '#fff'; g.fillText(label, lx + fs * 0.6, ly + fs * 0.82);
    if (!p.mic) { g.fillStyle = '#ff4d5e'; g.beginPath(); g.arc(lx + tw + fs * 1.25, ly + fs * 0.8, fs * 0.3, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }
  // episode title, small, top-left (only on the everyone view)
  if (S.title && view === 'grid') {
    g.font = '600 16px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,.55)';
    g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(S.title, 28, 8);
  }
}

// ---------------------------------------------------------------- controls
function renderControls() {
  const micOn = S.mic && S.hasMic, camOn = S.cam && S.hasCam;
  const cm = $('#ctl-mic'), cc = $('#ctl-cam');
  cm.querySelector('.ic').innerHTML = micOn ? ICON.mic : ICON.micOff;
  cm.classList.toggle('off', !micOn); cm.disabled = !S.hasMic;
  cc.querySelector('.ic').innerHTML = camOn ? ICON.cam : ICON.camOff;
  cc.classList.toggle('off', !camOn); cc.disabled = !S.hasCam;
  $('#ctl-flip .ic').innerHTML = ICON.flip;
  $('#ctl-people .ic').innerHTML = ICON.people;
  $('#ctl-leave .ic').innerHTML = ICON.leave;
  const cr = $('#ctl-rec');
  cr.querySelector('.ic').innerHTML = rec.active ? ICON.stop : ICON.rec;
  cr.querySelector('.lbl').textContent = rec.active ? 'Stop' : 'Rekam';
  cr.classList.toggle('recording', rec.active);
  $$('#ctl-layout button').forEach(b => b.classList.toggle('active', b.dataset.layout === S.layoutMode));
  $('#rec-badge').classList.toggle('hidden', !(rec.active || S.roomRecording));
  $('#people-count').textContent = parts.size;
}
async function toggleMic() {
  if (!S.hasMic) return;
  S.mic = !S.mic;
  S.localStream.getAudioTracks().forEach(t => t.enabled = S.mic);
  const me = parts.get('me'); me.mic = S.mic; updateTile(me);
  renderControls(); renderPeople();
  trackMe();
}
async function toggleCam() {
  if (!S.hasCam) return;
  S.cam = !S.cam;
  S.localStream.getVideoTracks().forEach(t => t.enabled = S.cam);
  const me = parts.get('me'); me.cam = S.cam; updateTile(me);
  renderControls();
  trackMe();
}
async function setupFlip() {
  if (!S.hasCam || !navigator.mediaDevices?.enumerateDevices) return;
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
  $('#ctl-flip').classList.toggle('hidden', cams.length < 2);
}
async function flipCamera() {
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
  if (cams.length < 2) return;
  const old = S.localStream.getVideoTracks()[0];
  const curId = old?.getSettings().deviceId;
  const next = cams[(cams.findIndex(c => c.deviceId === curId) + 1) % cams.length];
  old && old.stop(); // phones often can't open two cameras at once
  let track;
  try {
    track = (await navigator.mediaDevices.getUserMedia({ video: { ...VIDEO_CONSTRAINTS, deviceId: { exact: next.deviceId } } })).getVideoTracks()[0];
  } catch (e) { return toast('Gagal ganti kamera'); }
  track.enabled = S.cam;
  if (old) S.localStream.removeTrack(old);
  S.localStream.addTrack(track);
  S.camId = next.deviceId;
  const facing = track.getSettings().facingMode;
  parts.get('me').tile.el.classList.toggle('me', facing !== 'environment'); // don't mirror the back camera
  parts.get('me').tile.video.srcObject = S.localStream;
  for (const p of parts.values()) {
    if (!p.pc) continue;
    const tr = p.pc.getTransceivers().find(t => t.receiver.track && t.receiver.track.kind === 'video');
    if (tr) tr.sender.replaceTrack(track).catch(() => {});
  }
}
function setLayout(mode) {
  if (!S.isHost) return;
  S.layoutMode = mode; renderControls();
  trackMe();
}
function renderPeople() {
  const ul = $('#people-list'); if (!ul) return;
  ul.innerHTML = '';
  for (const key of orderedKeys()) {
    const p = parts.get(key);
    const li = document.createElement('li');
    li.innerHTML = `<span class="av"></span><span class="nm"></span><span class="tag"></span>`;
    li.querySelector('.av').textContent = initials(p.name);
    li.querySelector('.av').style.background = colorFor(p.name);
    li.querySelector('.nm').textContent = p.name + (p.isMe ? ' (lu)' : '');
    li.querySelector('.tag').textContent = [p.isHost ? 'host' : '', p.mic ? '' : 'mute'].filter(Boolean).join(' · ');
    if (S.isHost && !p.isMe) {
      const b = document.createElement('button'); b.textContent = 'Keluarkan';
      b.onclick = () => { if (confirm(`Keluarin ${p.name}?`)) sendKick(p.key); };
      li.appendChild(b);
    }
    ul.appendChild(li);
  }
  $('#people-count').textContent = parts.size;
}
function openInvite() {
  const link = `${location.origin}/${S.code}`;
  $('#invite-code').textContent = S.code;
  $('#invite-link').value = link;
  $('#btn-share').classList.toggle('hidden', !navigator.share);
  openModal('modal-invite');
}
async function copyLink() {
  const v = $('#invite-link').value;
  try { await navigator.clipboard.writeText(v); }
  catch (_) { $('#invite-link').select(); document.execCommand('copy'); }
  toast('Link disalin');
}
let loopId = 0;
function startLoops() {
  clearInterval(loopId);
  loopId = setInterval(tick, 100);
  setupFlip();
}
async function leaveStudio(silent) {
  if (rec.active) {
    if (!silent && !confirm('Rekaman masih jalan. Stop dan simpan rekaman, terus keluar?')) return;
    await stopRecording();
  }
  S.leaving = true; S.joined = false;
  if (S.channel) { const ch = S.channel; S.channel = null; supabase.removeChannel(ch).catch?.(() => {}); }
  clearInterval(loopId);
  for (const key of [...parts.keys()]) removePart(key);
  $('#stage').innerHTML = '';
  stopLocalTracks();
  document.body.classList.remove('is-host');
  $('#people-panel').classList.add('hidden');
  S.isHost = false; S.myId = null; S.activeId = null; S.layoutMode = 'auto'; S.roomRecording = false; S.hadHost = false;
  history.replaceState(null, '', '/');
  show('home');
}

function initStudio() {
  $('#ctl-mic').onclick = toggleMic;
  $('#ctl-cam').onclick = toggleCam;
  $('#ctl-flip').onclick = flipCamera;
  $('#ctl-rec').onclick = () => (rec.active ? stopRecording() : startRecording());
  $('#ctl-leave').onclick = () => leaveStudio(false);
  $('#ctl-people').onclick = () => { renderPeople(); $('#people-panel').classList.toggle('hidden'); };
  $$('#ctl-layout button').forEach(b => (b.onclick = () => setLayout(b.dataset.layout)));
  $('#btn-invite').onclick = openInvite;
  $('#btn-copy').onclick = copyLink;
  $('#btn-share').onclick = () => navigator.share({ title: 'Gabung podcast', text: `Kode: ${S.code}`, url: $('#invite-link').value }).catch(() => {});
  $$('[data-close]').forEach(b => (b.onclick = () => {
    const id = b.dataset.close;
    if (id.startsWith('modal')) closeModal(id); else $('#' + id).classList.add('hidden');
  }));
  $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); }));
  window.addEventListener('resize', renderStage);
  document.addEventListener('keydown', e => {
    if (!$('#screen-studio').classList.contains('active') || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'm') toggleMic();
    else if (k === 'v') toggleCam();
    else if (k === 'r' && S.isHost) rec.active ? stopRecording() : startRecording();
    else if (S.isHost && k === '1') setLayout('auto');
    else if (S.isHost && k === '2') setLayout('speaker');
    else if (S.isHost && k === '3') setLayout('grid');
  });
  window.addEventListener('beforeunload', e => { if (rec.active) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('pagehide', () => { if (S.channel) supabase.removeChannel(S.channel); });
}

let booted = false;
/**
 * Boot the studio UI. Call once, after the markup from lib/markup.js is in the DOM.
 * @param {{ supabase: object, iceServers?: object[] }} opts
 * @returns {() => void} cleanup
 */
export function startStudio(opts) {
  supabase = opts.supabase;
  if (opts.iceServers && opts.iceServers.length) DEFAULT_ICE = opts.iceServers;
  if (!booted) { booted = true; initStudio(); }
  initHome();
  initLobby();
  window.__ps = { S, parts, rec, currentView }; // debug hook
  return () => { if ($('#screen-studio')?.classList.contains('active')) leaveStudio(true); };
}
