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

// ========== State ==========
let uploadedVideos = [];
let playlists = [];
let streamActive = false;
let streamTimer = null;
let streamSeconds = 0;
const apiBaseUrl = 'https://livestreamtech.onrender.com'; // Replace with your actual Render URL
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
const totalViewsSpan = document.getElementById('totalViews');
const streamHealthSpan = document.getElementById('streamHealth');
const internetSpeedSpan = document.getElementById('internetSpeed');
const userNameSpan = document.getElementById('user-name');
const profileNameSpan = document.getElementById('profile-name');
const logoutBtn = document.getElementById('logout-btn');
const autoDeleteToast = document.getElementById('autoDeleteToast');

// Upload elements...
// (keep all existing DOM references, they remain the same)

// Settings
const defaultResolution = document.getElementById('defaultResolution');
const defaultBitrate = document.getElementById('defaultBitrate');
const defaultEncoder = document.getElementById('defaultEncoder');
const toggleThemeBtn = document.getElementById('toggleTheme');

// Docs buttons
const learnMoreBtns = document.querySelectorAll('.learn-more-btn');

// ... (rest of existing variable declarations remain)

// ========== Auth Functions ==========
document.getElementById('google-login').addEventListener('click', () => {
  signInWithPopup(auth, provider).catch(err => alert(err.message));
});
document.getElementById('email-login').addEventListener('click', () => {
  alert('Email login not implemented – please use Google.');
});
logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    splashContainer.style.display = 'none';
    appContainer.style.display = 'flex';
    // Display name (from Google) or fallback to email
    const displayName = user.displayName || user.email || 'User';
    userNameSpan.textContent = displayName;
    profileNameSpan.textContent = displayName;
    const token = await user.getIdToken();
    window.authToken = token;
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

// ... (authFetch and other helper functions remain the same)

// ========== Docs Learn More Toggle ==========
learnMoreBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const docId = btn.dataset.doc;
    const detailDiv = document.getElementById(`doc-${docId}`);
    if (detailDiv.style.display === 'none' || !detailDiv.style.display) {
      detailDiv.style.display = 'block';
      btn.textContent = 'Show less ↑';
    } else {
      detailDiv.style.display = 'none';
      btn.textContent = 'Learn more →';
    }
  });
});

// ========== Theme Toggle ==========
toggleThemeBtn.addEventListener('click', () => {
  document.body.classList.toggle('light-theme');
  document.body.classList.toggle('dark-theme');
  // Save preference
  const isLight = document.body.classList.contains('light-theme');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
});

// Load saved theme
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light') {
  document.body.classList.add('light-theme');
  document.body.classList.remove('dark-theme');
} else {
  document.body.classList.add('dark-theme');
  document.body.classList.remove('light-theme');
}

// ========== Start Stream with Selected Resolution ==========
// (Replace the startBtn click listener to include resolution from settings)
startBtn.addEventListener('click', async () => {
  if ((!ytKey.value || !ytRtmpPrimary.value) && (!fbKey.value || !fbRtmp.value) && (!tiktokKey.value || !tiktokRtmp.value)) {
    alert('Fill at least one platform configuration');
    return;
  }
  const resolution = defaultResolution.value; // e.g., "1280x720"
  const bitrate = defaultBitrate.value;
  const encoder = defaultEncoder.value;
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
    },
    // Add resolution and bitrate to backend payload
    resolution: resolution,
    bitrate: bitrate,
    encoder: encoder
  };
  try {
    const res = await authFetch(`${apiBaseUrl}/start-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Start failed');
    streamActive = true;
    updateStreamUI(true);
    startTimer();
    if (uploadedVideos.length) livePreview.src = `${apiBaseUrl}/uploads/${uploadedVideos[uploadedVideos.length-1].filename}?token=${window.authToken}`;
    pollStreamStatus();
    startAnalytics();
  } catch (err) { alert(err.message); }
});

// ... (rest of app.js remains identical, with all existing functions like renderLibrary, handleFileUpload, etc.)
