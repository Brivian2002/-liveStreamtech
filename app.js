// ==================== Firebase Initialization ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyBMVmWK63oIwTFGbFlk83CXElw8RCN7HKY",
  authDomain: "data-zone-ghana.firebaseapp.com",
  projectId: "data-zone-ghana",
  storageBucket: "data-zone-ghana.firebasestorage.app",
  messagingSenderId: "646703313086",
  appId: "1:646703313086:web:8235cc849e65325e0a2eef",
  measurementId: "G-K5DWC49DHQ"
};

const appFirebase = initializeApp(firebaseConfig);
const analytics = getAnalytics(appFirebase);
const auth = getAuth(appFirebase);
const provider = new GoogleAuthProvider();

// ==================== State ====================
let uploadedVideos = [];
let playlists = [];
let streamActive = false;
let streamTimer = null;
let streamSeconds = 0;
const apiBaseUrl = 'https://livestreamtech.onrender.com'; // your Render URL
let currentUser = null;

// DOM Elements
const splashContainer = document.getElementById('splash-container');
const appContainer = document.getElementById('app');
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
const userEmailSpan = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');

// Upload (same as before)
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

// Live – added TikTok elements
const streamTitle = document.getElementById('streamTitle');
const streamDesc = document.getElementById('streamDesc');
const ytRtmpPrimary = document.getElementById('ytRtmpPrimary');
const ytRtmpBackup = document.getElementById('ytRtmpBackup');
const ytKey = document.getElementById('ytKey');
const ytEnable = document.getElementById('ytEnable');
const fbRtmp = document.getElementById('fbRtmp');
const fbKey = document.getElementById('fbKey');
const fbEnable = document.getElementById('fbEnable');
const tiktokRtmp = document.getElementById('tiktokRtmp');
const tiktokKey = document.getElementById('tiktokKey');
const tiktokEnable = document.getElementById('tiktokEnable');
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

// Tabs
const liveTabs = document.querySelectorAll('.live-tab');
const tabContents = document.querySelectorAll('.tab-content');

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
const toggleThemeBtn = document.getElementById('toggleTheme');

// Toast
const autoDeleteToast = document.getElementById('autoDeleteToast');

// Charts
let viewersChart, bitrateChart;

// ==================== Auth Functions ====================
document.getElementById('google-login').addEventListener('click', () => {
  signInWithPopup(auth, provider).catch(err => alert(err.message));
});

document.getElementById('email-login').addEventListener('click', () => {
  alert('Email login not implemented – use Google for now.');
});

logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    splashContainer.style.display = 'none';
    appContainer.style.display = 'flex';
    userEmailSpan.textContent = user.email;
    // Get token for API calls
    const token = await user.getIdToken();
    // Store token globally for fetch interceptors
    window.authToken = token;
    // Initial data load
    fetchVideos();
    fetchHistory();
    showAutoDeleteToast();
  } else {
    currentUser = null;
    splashContainer.style.display = 'flex';
    appContainer.style.display = 'none';
    window.authToken = null;
  }
});

// Helper for authenticated fetch
async function authFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.append('Authorization', `Bearer ${window.authToken}`);
  return fetch(url, { ...options, headers });
}

// ==================== Data Functions (using authFetch) ====================
async function fetchVideos() {
  try {
    const res = await authFetch(`${apiBaseUrl}/videos`);
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
    const res = await authFetch(`${apiBaseUrl}/stream-history`);
    if (res.ok) {
      const history = await res.json();
      renderHistory(history);
    }
  } catch (err) {
    console.error('Failed to fetch history', err);
  }
}

// Update other functions to use authFetch (upload, delete, start/stop stream, etc.)
// Example: handleFileUpload
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
    const response = await authFetch(`${apiBaseUrl}/upload-video`, {
      method: 'POST',
      body: formData
    });
    clearInterval(interval);
    if (!response.ok) throw new Error('Upload failed');
    const result = await response.json();
    await fetchVideos();
    progressFill.style.width = '100%';
    progressStatus.textContent = 'Complete!';
    setTimeout(() => uploadProgress.style.display = 'none', 1000);
    showAutoDeleteToast();
  } catch (err) {
    clearInterval(interval);
    alert(err.message);
    uploadProgress.style.display = 'none';
  }
}

// Delete video
async function deleteVideo(videoId) {
  if (!confirm('Delete this video?')) return;
  try {
    const res = await authFetch(`${apiBaseUrl}/videos/${videoId}`, { method: 'DELETE' });
    if (res.ok) {
      uploadedVideos = uploadedVideos.filter(v => v.id !== videoId);
      renderLibrary();
      updateStats();
    } else {
      alert('Delete failed');
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// Start stream (now includes TikTok)
startBtn.addEventListener('click', async () => {
  if ((!ytKey.value || !ytRtmpPrimary.value) && (!fbKey.value || !fbRtmp.value) && (!tiktokKey.value || !tiktokRtmp.value)) {
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
    tiktokRtmp: tiktokEnable.checked ? tiktokRtmp.value : null,
    tiktokKey: tiktokEnable.checked ? tiktokKey.value : null,
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
    const res = await authFetch(`${apiBaseUrl}/start-stream`, {
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

// Stop stream (no auth needed, but keep as is)
stopBtn.addEventListener('click', async () => {
  try {
    await fetch(`${apiBaseUrl}/stop-stream`, { method: 'POST' });
    streamActive = false;
    updateStreamUI(false);
    stopTimer();
    livePreview.src = '';
    fetchHistory();
  } catch (err) {
    alert(err.message);
  }
});

// ... (rest of app.js – update all fetch calls to authFetch where needed, e.g., saveMetadata, delete, etc.)

// Auto‑delete toast
function showAutoDeleteToast() {
  if (!sessionStorage.getItem('toastShown')) {
    autoDeleteToast.style.display = 'block';
    setTimeout(() => autoDeleteToast.style.display = 'none', 5000);
    sessionStorage.setItem('toastShown', 'true');
  }
}

// Cleanup old videos (run every 24h) – optional, but backend also does cleanup
setInterval(fetchVideos, 86400000);

// Navigation and other helpers remain largely the same, but ensure authFetch is used for any API calls.

// Example: saveMetadata
saveMetadataBtn.addEventListener('click', async () => {
  const selectedId = uploadedVideos[0]?.id; // simplistic
  if (!selectedId) return alert('Select a video first');
  await authFetch(`${apiBaseUrl}/videos/${selectedId}`, {
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

// ... (rest of the functions remain similar, just replace fetch with authFetch when talking to backend)

// Render library with delete button (uses deleteVideo)
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
      <video src="${apiBaseUrl}/uploads/${video.filename}?token=${window.authToken}" muted></video>
      <div class="info">
        <p>${video.original_name.substring(0, 20)}...</p>
        <small>${(video.size / 1e6).toFixed(2)} MB</small>
      </div>
      <button class="delete-video-btn" data-id="${video.id}"><i class="fas fa-trash"></i></button>
    `;
    // ... event listeners
    libraryGrid.appendChild(item);
  });
}

// ... rest of app.js unchanged except for using authFetch and token in video URLs
