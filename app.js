// ==================== State & Globals ====================
let uploadedVideos = [];
let streamActive = false;
let streamTimer = null;
let streamSeconds = 0;
let apiBaseUrl = 'http://localhost:4000';

// DOM Elements
const views = document.querySelectorAll('.content-view');
const navItems = document.querySelectorAll('.nav-item');
const pageTitle = document.getElementById('page-title');
const globalStatusDot = document.querySelector('.stream-status .status-dot');
const globalStatusText = document.querySelector('.stream-status span:last-child');
const videoCountSpan = document.getElementById('videoCount');
const totalStreamTimeSpan = document.getElementById('totalStreamTime');

// Upload elements
const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.querySelector('.progress-fill');
const progressStatus = document.getElementById('progressStatus');
const videoPreview = document.getElementById('videoPreview');
const previewPlayer = document.getElementById('previewPlayer');
const metaInfo = document.getElementById('metaInfo');

// Live elements – updated with new fields
const streamTitle = document.getElementById('streamTitle');
const streamDesc = document.getElementById('streamDesc');
const privacy = document.getElementById('privacy');
// YouTube
const ytRtmpPrimary = document.getElementById('ytRtmpPrimary');
const ytRtmpBackup = document.getElementById('ytRtmpBackup');
const ytKey = document.getElementById('ytKey');
// Facebook
const fbRtmp = document.getElementById('fbRtmp');
const fbKey = document.getElementById('fbKey');

const startBtn = document.getElementById('startStreamBtn');
const stopBtn = document.getElementById('stopStreamBtn');
const pauseBtn = document.getElementById('pauseStreamBtn');
const streamStatusText = document.getElementById('streamStatusText');
const connectionStatus = document.getElementById('connectionStatus');
const bitrateSpan = document.getElementById('bitrate');
const durationSpan = document.getElementById('duration');
const livePreview = document.getElementById('livePreview');
const latencySpan = document.getElementById('latency');
const fpsSpan = document.getElementById('fps');
const resolutionSpan = document.getElementById('resolution');

// History & Library
const libraryGrid = document.getElementById('videoLibraryGrid');
const historyBody = document.getElementById('historyBody');

// Settings
const defaultResolution = document.getElementById('defaultResolution');
const defaultBitrate = document.getElementById('defaultBitrate');
const defaultEncoder = document.getElementById('defaultEncoder');
const apiUrlInput = document.getElementById('apiUrl');
const saveSettingsBtn = document.getElementById('saveSettings');
const toggleThemeBtn = document.getElementById('toggleTheme');

// ==================== Helper Functions ====================
function updateStats() {
    videoCountSpan.textContent = uploadedVideos.length;
}

// ==================== Navigation ====================
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const viewId = item.dataset.view;
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        views.forEach(view => view.classList.remove('active'));
        document.getElementById(`view-${viewId}`).classList.add('active');
        pageTitle.textContent = item.querySelector('span').textContent;
    });
});

document.getElementById('settingsBtn').addEventListener('click', () => {
    navItems.forEach(nav => nav.classList.remove('active'));
    document.querySelector('[data-view="settings"]').classList.add('active');
    views.forEach(view => view.classList.remove('active'));
    document.getElementById('view-settings').classList.add('active');
    pageTitle.textContent = 'Settings';
});

// ==================== Upload Functionality ====================
dropArea.addEventListener('click', () => fileInput.click());
dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropArea.style.borderColor = '#00e5ff';
});
dropArea.addEventListener('dragleave', () => {
    dropArea.style.borderColor = 'rgba(0,229,255,0.5)';
});
dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.style.borderColor = 'rgba(0,229,255,0.5)';
    const files = e.dataTransfer.files;
    if (files.length) handleFileUpload(files[0]);
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFileUpload(e.target.files[0]);
});

async function handleFileUpload(file) {
    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
    if (!validTypes.includes(file.type)) {
        alert('Unsupported file type. Please upload MP4, MOV, or WEBM.');
        return;
    }

    uploadProgress.style.display = 'block';
    progressFill.style.width = '0%';
    progressStatus.textContent = 'Uploading... 0%';

    const formData = new FormData();
    formData.append('video', file);

    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += 5;
        if (progress > 90) clearInterval(progressInterval);
        progressFill.style.width = progress + '%';
        progressStatus.textContent = `Uploading... ${progress}%`;
    }, 200);

    try {
        const response = await fetch(`${apiBaseUrl}/upload-video`, {
            method: 'POST',
            headers: { 'ngrok-skip-browser-warning': 'true' },
            body: formData
        });

        clearInterval(progressInterval);
        progressFill.style.width = '100%';
        progressStatus.textContent = 'Upload complete!';

        if (!response.ok) throw new Error('Upload failed');

        const result = await response.json();
        const videoUrl = URL.createObjectURL(file);
        uploadedVideos.push({
            id: result.id || Date.now(),
            name: file.name,
            url: videoUrl,
            size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
            date: new Date().toLocaleString()
        });
        renderLibrary();
        updateStats();

        previewPlayer.src = videoUrl;
        videoPreview.style.display = 'block';
        metaInfo.innerHTML = `<p><strong>${file.name}</strong> (${(file.size / 1024 / 1024).toFixed(2)} MB)</p>`;

        uploadProgress.style.display = 'none';
    } catch (error) {
        clearInterval(progressInterval);
        alert('Upload failed: ' + error.message);
        uploadProgress.style.display = 'none';
    }
}

function renderLibrary() {
    libraryGrid.innerHTML = '';
    if (uploadedVideos.length === 0) {
        libraryGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #888;">No videos uploaded yet.</p>';
        return;
    }
    uploadedVideos.forEach(video => {
        const item = document.createElement('div');
        item.className = 'library-item';
        item.innerHTML = `
            <video src="${video.url}" muted></video>
            <div class="info">
                <p>${video.name.substring(0, 20)}${video.name.length > 20 ? '...' : ''}</p>
                <small>${video.size}</small>
            </div>
        `;
        item.addEventListener('click', () => {
            previewPlayer.src = video.url;
        });
        libraryGrid.appendChild(item);
    });
}

// ==================== Live Stream Control ====================
startBtn.addEventListener('click', async () => {
    // At least one destination must be configured
    if ((!ytKey.value || !ytRtmpPrimary.value) && (!fbKey.value || !fbRtmp.value)) {
        alert('Please fill in at least one complete platform configuration (RTMP URL + Stream Key).');
        return;
    }

    const payload = {
        title: streamTitle.value || 'Untitled Stream',
        description: streamDesc.value,
        privacy: privacy.value,
        // YouTube
        youtubeRtmpPrimary: ytRtmpPrimary.value,
        youtubeRtmpBackup: ytRtmpBackup.value,
        youtubeKey: ytKey.value,
        // Facebook
        facebookRtmp: fbRtmp.value,
        facebookKey: fbKey.value
    };

    try {
        const response = await fetch(`${apiBaseUrl}/start-stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Failed to start stream');
        const data = await response.json();
        streamActive = true;
        updateStreamUI(true);
        startTimer();
        pollStreamStatus();
    } catch (err) {
        alert('Start stream error: ' + err.message);
    }
});

stopBtn.addEventListener('click', async () => {
    try {
        await fetch(`${apiBaseUrl}/stop-stream`, {
            method: 'POST',
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        streamActive = false;
        updateStreamUI(false);
        stopTimer();
        livePreview.src = '';
    } catch (err) {
        alert('Stop stream error: ' + err.message);
    }
});

pauseBtn.addEventListener('click', () => {
    alert('Pause not yet supported');
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
        const hrs = Math.floor(streamSeconds / 3600);
        const mins = Math.floor((streamSeconds % 3600) / 60);
        const secs = streamSeconds % 60;
        durationSpan.textContent = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(streamTimer);
    durationSpan.textContent = '00:00:00';
}

async function pollStreamStatus() {
    if (!streamActive) return;
    try {
        const response = await fetch(`${apiBaseUrl}/stream-status`, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        const data = await response.json();
        if (!data.active) {
            streamActive = false;
            updateStreamUI(false);
            stopTimer();
            livePreview.src = '';
        } else {
            bitrateSpan.textContent = Math.floor(2000 + Math.random() * 500) + ' kbps';
            latencySpan.textContent = (Math.random() * 2 + 1).toFixed(1) + 's';
            setTimeout(pollStreamStatus, 5000);
        }
    } catch {
        setTimeout(pollStreamStatus, 5000);
    }
}

// ==================== History ====================
function addHistoryEntry(title, date, duration, platform, status) {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${title}</td><td>${date}</td><td>${duration}</td><td>${platform}</td><td>${status}</td>`;
    historyBody.appendChild(row);
}

function loadHistory() {
    const history = JSON.parse(localStorage.getItem('streamHistory') || '[]');
    history.forEach(entry => addHistoryEntry(entry.title, entry.date, entry.duration, entry.platform, entry.status));
}

function saveHistoryEntry(entry) {
    const history = JSON.parse(localStorage.getItem('streamHistory') || '[]');
    history.push(entry);
    localStorage.setItem('streamHistory', JSON.stringify(history));
    addHistoryEntry(entry.title, entry.date, entry.duration, entry.platform, entry.status);
}

// ==================== Settings ====================
saveSettingsBtn.addEventListener('click', () => {
    const newApi = apiUrlInput.value.trim();
    if (newApi) {
        apiBaseUrl = newApi.replace(/\/$/, '');
        localStorage.setItem('apiUrl', apiBaseUrl);
    }
    localStorage.setItem('resolution', defaultResolution.value);
    localStorage.setItem('bitrate', defaultBitrate.value);
    localStorage.setItem('encoder', defaultEncoder.value);
    alert('Settings saved');
});

const savedApiUrl = localStorage.getItem('apiUrl');
if (savedApiUrl) {
    apiUrlInput.value = savedApiUrl;
    apiBaseUrl = savedApiUrl.replace(/\/$/, '');
} else {
    apiUrlInput.value = 'http://localhost:4000';
    apiBaseUrl = 'http://localhost:4000';
}

if (localStorage.getItem('resolution')) defaultResolution.value = localStorage.getItem('resolution');
if (localStorage.getItem('bitrate')) defaultBitrate.value = localStorage.getItem('bitrate');
if (localStorage.getItem('encoder')) defaultEncoder.value = localStorage.getItem('encoder');

toggleThemeBtn.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
});

// ==================== Initialization ====================
updateStats();
loadHistory();
renderLibrary();
