// ==================== State & Globals ====================
let uploadedVideos = [];          // { id, name, url, size, date }
let streamActive = false;
let streamTimer = null;
let streamSeconds = 0;
let apiBaseUrl = 'http://localhost:4000'; // default, will be overwritten by localStorage

// DOM Elements
const views = document.querySelectorAll('.content-view');
const navItems = document.querySelectorAll('.nav-item');
const pageTitle = document.getElementById('page-title');
const globalStatusDot = document.querySelector('.stream-status .status-dot');
const globalStatusText = document.querySelector('.stream-status span:last-child');

// Upload elements
const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.querySelector('.progress-fill');
const progressStatus = document.getElementById('progressStatus');
const videoPreview = document.getElementById('videoPreview');
const previewPlayer = document.getElementById('previewPlayer');
const metaInfo = document.getElementById('metaInfo');

// Live elements
const streamTitle = document.getElementById('streamTitle');
const streamDesc = document.getElementById('streamDesc');
const privacy = document.getElementById('privacy');
const ytKey = document.getElementById('ytKey');
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

// ==================== Navigation ====================
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const viewId = item.dataset.view;
        // Update active nav
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        // Show corresponding view
        views.forEach(view => view.classList.remove('active'));
        document.getElementById(`view-${viewId}`).classList.add('active');
        pageTitle.textContent = item.querySelector('span').textContent;
    });
});

// Settings button in navbar
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
    dropArea.style.borderColor = '#4a9eff';
});
dropArea.addEventListener('dragleave', () => {
    dropArea.style.borderColor = 'rgba(74,158,255,0.3)';
});
dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.style.borderColor = 'rgba(74,158,255,0.3)';
    const files = e.dataTransfer.files;
    if (files.length) handleFileUpload(files[0]);
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFileUpload(e.target.files[0]);
});

async function handleFileUpload(file) {
    // Validate file type
    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
    if (!validTypes.includes(file.type)) {
        alert('Unsupported file type. Please upload MP4, MOV, or WEBM.');
        return;
    }

    // Show progress bar
    uploadProgress.style.display = 'block';
    const formData = new FormData();
    formData.append('video', file);

    try {
        // CRITICAL FIX: Add ngrok-skip-browser-warning header to bypass interstitial page
        const response = await fetch(`${apiBaseUrl}/upload-video`, {
            method: 'POST',
            headers: {
                'ngrok-skip-browser-warning': 'true'   // This is the key!
            },
            body: formData
        });

        if (!response.ok) throw new Error('Upload failed');

        const result = await response.json();
        // Add to local library
        const videoUrl = URL.createObjectURL(file); // temporary for preview
        uploadedVideos.push({
            id: result.id || Date.now(),
            name: file.name,
            url: videoUrl,
            size: (file.size / (1024*1024)).toFixed(2) + ' MB',
            date: new Date().toLocaleString()
        });
        renderLibrary();
        // Show preview
        previewPlayer.src = videoUrl;
        videoPreview.style.display = 'block';
        metaInfo.innerHTML = `<p><strong>${file.name}</strong> (${(file.size/1024/1024).toFixed(2)} MB)</p>`;
        // Hide progress
        uploadProgress.style.display = 'none';
    } catch (error) {
        alert('Upload failed: ' + error.message);
        uploadProgress.style.display = 'none';
    }
}

function renderLibrary() {
    libraryGrid.innerHTML = '';
    uploadedVideos.forEach(video => {
        const item = document.createElement('div');
        item.className = 'library-item';
        item.innerHTML = `
            <video src="${video.url}" muted></video>
            <div class="info">
                <p>${video.name.substring(0,20)}${video.name.length>20?'...':''}</p>
                <small>${video.size}</small>
            </div>
        `;
        // Null check to prevent errors
        if (!item) return;
        item.addEventListener('click', () => {
            // Select this video for streaming (store selected ID)
            // For simplicity, we just preview
            previewPlayer.src = video.url;
        });
        libraryGrid.appendChild(item);
    });
}

// ==================== Live Stream Control ====================
startBtn.addEventListener('click', async () => {
    // Collect data
    const payload = {
        title: streamTitle.value,
        description: streamDesc.value,
        privacy: privacy.value,
        youtubeKey: ytKey.value,
        facebookKey: fbKey.value,
        // In a real app you'd also send the selected video ID
    };

    try {
        const response = await fetch(`${apiBaseUrl}/start-stream`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'   // Also add here for safety
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Failed to start stream');
        const data = await response.json();
        streamActive = true;
        updateStreamUI(true);
        startTimer();
        // Simulate preview (in real app you'd get a stream URL)
        livePreview.src = 'http://localhost:4000/preview'; // mock
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
    // Implement pause if needed
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
        // Simulate bitrate changes
        setInterval(() => {
            if (streamActive) {
                bitrateSpan.textContent = Math.floor(2000 + Math.random()*500) + ' kbps';
                latencySpan.textContent = (Math.random()*2 + 1).toFixed(1) + 's';
            }
        }, 3000);
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
        durationSpan.textContent = `${hrs.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(streamTimer);
    durationSpan.textContent = '00:00:00';
}

// ==================== History (mock) ====================
function addHistoryEntry(title, date, duration, platform, status) {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${title}</td><td>${date}</td><td>${duration}</td><td>${platform}</td><td>${status}</td>`;
    historyBody.appendChild(row);
}

// Pre-populate with some mock history
addHistoryEntry('Morning Show', '2025-03-15 10:30', '01:15:22', 'YouTube, FB', 'Completed');
addHistoryEntry('Game Stream', '2025-03-14 20:00', '02:30:45', 'YouTube', 'Completed');

// ==================== Settings ====================
saveSettingsBtn.addEventListener('click', () => {
    const newApi = apiUrlInput.value.trim();
    if (newApi) {
        // Remove trailing slash if present to avoid double slashes in requests
        apiBaseUrl = newApi.replace(/\/$/, '');
        localStorage.setItem('apiUrl', apiBaseUrl);
    }
    // Save other settings
    localStorage.setItem('resolution', defaultResolution.value);
    localStorage.setItem('bitrate', defaultBitrate.value);
    localStorage.setItem('encoder', defaultEncoder.value);
    alert('Settings saved');
});

// Load settings from localStorage
const savedApiUrl = localStorage.getItem('apiUrl');
if (savedApiUrl) {
    apiUrlInput.value = savedApiUrl;
    apiBaseUrl = savedApiUrl.replace(/\/$/, ''); // ensure no trailing slash
} else {
    apiUrlInput.value = 'http://localhost:4000';
    apiBaseUrl = 'http://localhost:4000';
}

if (localStorage.getItem('resolution')) defaultResolution.value = localStorage.getItem('resolution');
if (localStorage.getItem('bitrate')) defaultBitrate.value = localStorage.getItem('bitrate');
if (localStorage.getItem('encoder')) defaultEncoder.value = localStorage.getItem('encoder');

toggleThemeBtn.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    // Simple theme toggle - you can define light theme in CSS
});

// ==================== Initialization ====================
// Add a mock video for demonstration
uploadedVideos.push({
    id: 1,
    name: 'sample.mp4',
    url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    size: '150 MB',
    date: new Date().toLocaleString()
});
renderLibrary();
