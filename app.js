// ==================== State ====================
let uploadedVideos = [];
let playlists = [];
let streamActive = false;
let streamTimer = null;
let streamSeconds = 0;
let apiBaseUrl = localStorage.getItem('apiUrl') || 'http://129.146.45.248:4000';
let apiLocked = true;
const API_PASSWORD = 'Dunis@100';

// DOM Elements
const views = document.querySelectorAll('.content-view');
const navItems = document.querySelectorAll('.nav-item');
const pageTitle = document.getElementById('page-title');
const globalStatusDot = document.querySelector('.stream-status .status-dot');
const globalStatusText = document.querySelector('.stream-status span:last-child');
const videoCountSpan = document.getElementById('videoCount');
const totalStreamTimeSpan = document.getElementById('totalStreamTime');
const totalViewsSpan = document.getElementById('totalViews');
const streamHealthSpan = document.getElementById('streamHealth');
const internetSpeedSpan = document.getElementById('internetSpeed');

// Upload
const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.querySelector('.progress-fill');
const progressStatus = document.getElementById('progressStatus');
const videoPreview = document.getElementById('videoPreview');
const previewPlayer = document.getElementById('previewPlayer');
const metaInfo = document.getElementById('metaInfo');
const videoTitle = document.getElementById('videoTitle');
const videoTags = document.getElementById('videoTags');
const videoDesc = document.getElementById('videoDesc');
const saveMetadataBtn = document.getElementById('saveMetadata');

// Live
const streamTitle = document.getElementById('streamTitle');
const streamDesc = document.getElementById('streamDesc');
const ytRtmpPrimary = document.getElementById('ytRtmpPrimary');
const ytRtmpBackup = document.getElementById('ytRtmpBackup');
const ytKey = document.getElementById('ytKey');
const ytEnable = document.getElementById('ytEnable');
const fbRtmp = document.getElementById('fbRtmp');
const fbKey = document.getElementById('fbKey');
const fbEnable = document.getElementById('fbEnable');
const scheduleTime = document.getElementById('scheduleTime');
const loopMode = document.getElementById('loopMode');
const autoReconnect = document.getElementById('autoReconnect');
const enableLowerThird = document.getElementById('enableLowerThird');
const enableWatermark = document.getElementById('enableWatermark');
const enableCountdown = document.getElementById('enableCountdown');
const bgMusic = document.getElementById('bgMusic');
const startBtn = document.getElementById('startStreamBtn');
const stopBtn = document.getElementById('stopStreamBtn');
const pauseBtn = document.getElementById('pauseStreamBtn');
const streamStatusText = document.getElementById('streamStatusText');
const connectionStatus = document.getElementById('connectionStatus');
const bitrateSpan = document.getElementById('bitrate');
const droppedFramesSpan = document.getElementById('droppedFrames');
const cpuUsageSpan = document.getElementById('cpuUsage');
const viewersSpan = document.getElementById('viewers');
const durationSpan = document.getElementById('duration');
const livePreview = document.getElementById('livePreview');
const latencySpan = document.getElementById('latency');
const fpsSpan = document.getElementById('fps');
const resolutionSpan = document.getElementById('resolution');
const aspectBtns = document.querySelectorAll('.aspect-btn');
const videoWrapper = document.getElementById('videoWrapper');

// Library
const libraryGrid = document.getElementById('videoLibraryGrid');
const historyBody = document.getElementById('historyBody');

// Playlists
const newPlaylistBtn = document.getElementById('newPlaylistBtn');
const playlistGrid = document.getElementById('playlistGrid');

// Settings
const defaultResolution = document.getElementById('defaultResolution');
const defaultBitrate = document.getElementById('defaultBitrate');
const defaultEncoder = document.getElementById('defaultEncoder');
const apiUrlInput = document.getElementById('apiUrl');
const apiPassword = document.getElementById('apiPassword');
const unlockApiBtn = document.getElementById('unlockApi');
const saveSettingsBtn = document.getElementById('saveSettings');
const toggleThemeBtn = document.getElementById('toggleTheme');

// Charts
let viewersChart, bitrateChart;

// ==================== Helpers ====================
async function fetchVideos() {
  try {
    const res = await fetch(`${apiBaseUrl}/videos`);
    if (res.ok) {
      uploadedVideos = await res.json();
      renderLibrary();
      updateStats();
    }
  } catch (err) {
    console.error('Failed to fetch videos', err);
  }
}

async function fetchHistory() {
  try {
    const res = await fetch(`${apiBaseUrl}/stream-history`);
    if (res.ok) {
      const history = await res.json();
      renderHistory(history);
    }
  } catch (err) {
    console.error('Failed to fetch history', err);
  }
}

function updateStats() {
  videoCountSpan.textContent = uploadedVideos.length;
  totalViewsSpan.textContent = Math.floor(Math.random() * 1000);
  streamHealthSpan.textContent = (95 + Math.random() * 4).toFixed(1) + '%';
}

// Internet speed test
async function measureSpeed() {
  const startTime = Date.now();
  try {
    await fetch('https://httpbin.org/bytes/100000');
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const speedMbps = (0.1 * 8) / duration;
    internetSpeedSpan.textContent = speedMbps.toFixed(1) + ' Mbps';
  } catch {
    internetSpeedSpan.textContent = 'N/A';
  }
}
setInterval(measureSpeed, 10000);
measureSpeed();

// ==================== Navigation ====================
navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const viewId = item.dataset.view;
    navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    views.forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');
    pageTitle.textContent = item.querySelector('span').textContent;
    if (viewId === 'history') fetchHistory();
    if (viewId === 'dashboard') fetchVideos();
  });
});

document.getElementById('settingsBtn').addEventListener('click', () => {
  navItems.forEach(n => n.classList.remove('active'));
  document.querySelector('[data-view="settings"]').classList.add('active');
  views.forEach(v => v.classList.remove('active'));
  document.getElementById('view-settings').classList.add('active');
  pageTitle.textContent = 'Settings';
});

// ==================== Upload ====================
dropArea.addEventListener('click', () => fileInput.click());
dropArea.addEventListener('dragover', (e) => e.preventDefault());
dropArea.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = e.dataTransfer.files;
  if (files.length) handleFileUpload(files[0]);
});
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) handleFileUpload(e.target.files[0]);
});

async function handleFileUpload(file) {
  const valid = ['video/mp4', 'video/quicktime', 'video/webm'];
  if (!valid.includes(file.type)) { alert('Unsupported format'); return; }

  uploadProgress.style.display = 'block';
  progressFill.style.width = '0%';
  progressStatus.textContent = '0%';

  const formData = new FormData();
  formData.append('video', file);

  let progress = 0;
  const interval = setInterval(() => {
    progress += 5;
    if (progress > 90) clearInterval(interval);
    progressFill.style.width = progress + '%';
    progressStatus.textContent = progress + '%';
  }, 200);

  try {
    const response = await fetch(`${apiBaseUrl}/upload-video`, {
      method: 'POST',
      body: formData
    });
    clearInterval(interval);
    if (!response.ok) throw new Error('Upload failed');
    const result = await response.json();
    await fetchVideos(); // refresh list
    progressFill.style.width = '100%';
    progressStatus.textContent = 'Complete!';
    setTimeout(() => uploadProgress.style.display = 'none', 1000);
  } catch (err) {
    clearInterval(interval);
    alert(err.message);
    uploadProgress.style.display = 'none';
  }
}

saveMetadataBtn.addEventListener('click', async () => {
  const selectedId = uploadedVideos[0]?.id; // simplistic – you'd need to track selected video
  if (!selectedId) return alert('Select a video first');
  await fetch(`${apiBaseUrl}/videos/${selectedId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: videoTitle.value,
      tags: videoTags.value,
      description: videoDesc.value
    })
  });
  alert('Metadata saved');
});

function renderLibrary() {
  libraryGrid.innerHTML = '';
  if (!uploadedVideos.length) {
    libraryGrid.innerHTML = '<p style="grid-column:1/-1; text-align:center;">No videos</p>';
    return;
  }
  uploadedVideos.forEach(video => {
    const item = document.createElement('div');
    item.className = 'library-item';
    item.innerHTML = `
      <video src="${apiBaseUrl}/uploads/${video.filename}" muted></video>
      <div class="info">
        <p>${video.original_name.substring(0, 20)}...</p>
        <small>${(video.size / 1e6).toFixed(2)} MB</small>
      </div>
    `;
    item.addEventListener('click', () => {
      previewPlayer.src = `${apiBaseUrl}/uploads/${video.filename}`;
      videoTitle.value = video.title || video.original_name;
      videoTags.value = video.tags || '';
      videoDesc.value = video.description || '';
      document.querySelector('[data-view="upload"]').click();
    });
    libraryGrid.appendChild(item);
  });
}

// ==================== Live Stream ====================
startBtn.addEventListener('click', async () => {
  if ((!ytKey.value || !ytRtmpPrimary.value) && (!fbKey.value || !fbRtmp.value)) {
    alert('Fill at least one platform configuration');
    return;
  }

  const payload = {
    title: streamTitle.value || 'Untitled',
    description: streamDesc.value,
    youtubeRtmpPrimary: ytEnable.checked ? ytRtmpPrimary.value : null,
    youtubeRtmpBackup: ytEnable.checked ? ytRtmpBackup.value : null,
    youtubeKey: ytEnable.checked ? ytKey.value : null,
    facebookRtmp: fbEnable.checked ? fbRtmp.value : null,
    facebookKey: fbEnable.checked ? fbKey.value : null,
    schedule: scheduleTime.value,
    loopMode: loopMode.value,
    autoReconnect: autoReconnect.checked,
    overlays: {
      lowerThird: enableLowerThird.checked,
      watermark: enableWatermark.checked,
      countdown: enableCountdown.checked,
      bgMusic: bgMusic.value
    }
  };

  try {
    const res = await fetch(`${apiBaseUrl}/start-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Start failed');
    }
    streamActive = true;
    updateStreamUI(true);
    startTimer();
    if (uploadedVideos.length) livePreview.src = `${apiBaseUrl}/uploads/${uploadedVideos[uploadedVideos.length - 1].filename}`;
    pollStreamStatus();
    startAnalytics();
  } catch (err) {
    alert(err.message);
  }
});

stopBtn.addEventListener('click', async () => {
  try {
    await fetch(`${apiBaseUrl}/stop-stream`, { method: 'POST' });
    streamActive = false;
    updateStreamUI(false);
    stopTimer();
    livePreview.src = '';
    fetchHistory(); // refresh history
  } catch (err) {
    alert(err.message);
  }
});

function updateStreamUI(active) {
  if (active) {
    globalStatusDot.className = 'status-dot online';
    globalStatusText.textContent = 'Live';
    streamStatusText.textContent = 'Live';
    connectionStatus.textContent = 'Connected';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    pauseBtn.disabled = false;
  } else {
    globalStatusDot.className = 'status-dot offline';
    globalStatusText.textContent = 'Offline';
    streamStatusText.textContent = 'Offline';
    connectionStatus.textContent = 'Disconnected';
    bitrateSpan.textContent = '0 kbps';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    pauseBtn.disabled = true;
  }
}

function startTimer() {
  streamSeconds = 0;
  streamTimer = setInterval(() => {
    streamSeconds++;
    const h = Math.floor(streamSeconds / 3600);
    const m = Math.floor((streamSeconds % 3600) / 60);
    const s = streamSeconds % 60;
    durationSpan.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, 1000);
}

function stopTimer() { clearInterval(streamTimer); durationSpan.textContent = '00:00:00'; }

async function pollStreamStatus() {
  if (!streamActive) return;
  try {
    const res = await fetch(`${apiBaseUrl}/stream-status`);
    const data = await res.json();
    if (!data.active) {
      streamActive = false;
      updateStreamUI(false);
      stopTimer();
      livePreview.src = '';
    } else {
      bitrateSpan.textContent = Math.floor(2000 + Math.random() * 500) + ' kbps';
      droppedFramesSpan.textContent = Math.floor(Math.random() * 10);
      cpuUsageSpan.textContent = Math.floor(20 + Math.random() * 10) + '%';
      viewersSpan.textContent = Math.floor(50 + Math.random() * 200);
      latencySpan.textContent = (1 + Math.random()).toFixed(1) + 's';
      fpsSpan.textContent = 30;
      resolutionSpan.textContent = '1280x720';
      setTimeout(pollStreamStatus, 5000);
    }
  } catch { setTimeout(pollStreamStatus, 5000); }
}

// Aspect ratio toggles
aspectBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    aspectBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const aspect = btn.dataset.aspect;
    if (aspect === '16:9') videoWrapper.style.paddingTop = '56.25%';
    else if (aspect === '9:16') videoWrapper.style.paddingTop = '177.78%';
    else if (aspect === '1:1') videoWrapper.style.paddingTop = '100%';
    else if (aspect === '4:5') videoWrapper.style.paddingTop = '125%';
    else if (aspect === 'fill') videoWrapper.style.paddingTop = '0';
  });
});

// ==================== History ====================
function renderHistory(history) {
  historyBody.innerHTML = '';
  history.forEach(e => {
    const row = document.createElement('tr');
    const date = new Date(e.date).toLocaleString();
    const duration = e.duration ? `${Math.floor(e.duration / 60)}:${(e.duration % 60).toString().padStart(2, '0')}` : '00:00';
    row.innerHTML = `<td>${e.title}</td><td>${date}</td><td>${duration}</td><td>${e.platform}</td><td>${e.status}</td>`;
    historyBody.appendChild(row);
  });
}

// ==================== Playlists ====================
newPlaylistBtn.addEventListener('click', () => {
  const name = prompt('Playlist name:');
  if (name) {
    playlists.push({ name, videos: [] });
    renderPlaylists();
  }
});

function renderPlaylists() {
  playlistGrid.innerHTML = '';
  playlists.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'playlist-card';
    div.innerHTML = `<strong>${p.name}</strong><br>${p.videos.length} videos`;
    playlistGrid.appendChild(div);
  });
}

// ==================== Analytics ====================
function startAnalytics() {
  if (!viewersChart) {
    const ctx1 = document.getElementById('viewersChart').getContext('2d');
    viewersChart = new Chart(ctx1, {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Viewers', data: [], borderColor: '#ff0000' }] },
      options: { responsive: true }
    });
    const ctx2 = document.getElementById('bitrateChart').getContext('2d');
    bitrateChart = new Chart(ctx2, {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Bitrate (kbps)', data: [], borderColor: '#ff0000' }] },
      options: { responsive: true }
    });
  }
  setInterval(() => {
    if (!streamActive) return;
    const time = new Date().toLocaleTimeString();
    viewersChart.data.labels.push(time);
    viewersChart.data.datasets[0].data.push(Math.floor(50 + Math.random() * 200));
    if (viewersChart.data.labels.length > 10) {
      viewersChart.data.labels.shift();
      viewersChart.data.datasets[0].data.shift();
    }
    viewersChart.update();

    bitrateChart.data.labels.push(time);
    bitrateChart.data.datasets[0].data.push(Math.floor(2000 + Math.random() * 500));
    if (bitrateChart.data.labels.length > 10) {
      bitrateChart.data.labels.shift();
      bitrateChart.data.datasets[0].data.shift();
    }
    bitrateChart.update();
  }, 5000);
}

// ==================== Settings ====================
unlockApiBtn.addEventListener('click', () => {
  if (apiPassword.value === API_PASSWORD) {
    apiUrlInput.readOnly = false;
    apiUrlInput.style.background = '#fff';
    apiPassword.value = '';
  } else {
    alert('Incorrect password');
  }
});

saveSettingsBtn.addEventListener('click', () => {
  const newApi = apiUrlInput.value.trim();
  if (newApi && !apiUrlInput.readOnly) {
    apiBaseUrl = newApi.replace(/\/$/, '');
    localStorage.setItem('apiUrl', apiBaseUrl);
  }
  localStorage.setItem('resolution', defaultResolution.value);
  localStorage.setItem('bitrate', defaultBitrate.value);
  localStorage.setItem('encoder', defaultEncoder.value);
  alert('Settings saved');
});

apiUrlInput.value = localStorage.getItem('apiUrl') || 'http://129.146.45.248:4000';
apiBaseUrl = apiUrlInput.value.replace(/\/$/, '');
if (localStorage.getItem('resolution')) defaultResolution.value = localStorage.getItem('resolution');
if (localStorage.getItem('bitrate')) defaultBitrate.value = localStorage.getItem('bitrate');
if (localStorage.getItem('encoder')) defaultEncoder.value = localStorage.getItem('encoder');

toggleThemeBtn.addEventListener('click', () => document.body.classList.toggle('light-theme'));

// ==================== Initial ====================
fetchVideos();
fetchHistory();
