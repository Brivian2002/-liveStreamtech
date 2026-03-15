const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads';
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

let activeStream = null; // { processes, title, ... }

// Upload endpoint
app.post('/upload-video', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    res.json({ message: 'Uploaded', id: req.file.filename, path: req.file.path });
});

// List videos
app.get('/videos', (req, res) => {
    fs.readdir('uploads', (err, files) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(files);
    });
});

// Start stream – handles multiple platforms and options
app.post('/start-stream', (req, res) => {
    const {
        title, description,
        youtubeRtmpPrimary, youtubeRtmpBackup, youtubeKey,
        facebookRtmp, facebookKey,
        loopMode, autoReconnect, overlays
    } = req.body;

    // Find latest video
    const videosDir = 'uploads';
    let videoFile = null;
    if (fs.existsSync(videosDir)) {
        const files = fs.readdirSync(videosDir);
        if (files.length) videoFile = path.join(videosDir, files[files.length - 1]);
    }
    if (!videoFile) return res.status(400).json({ error: 'No video found' });

    const processes = [];

    // YouTube
    if (youtubeKey && youtubeRtmpPrimary) {
        const primaryUrl = `${youtubeRtmpPrimary.replace(/\/$/, '')}/${youtubeKey}`;
        const proc = spawn('ffmpeg', ['-re', '-i', videoFile,
            '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '2500k',
            '-c:a', 'aac', '-f', 'flv', primaryUrl]);
        proc.stderr.on('data', d => console.log(`YT: ${d}`));
        processes.push(proc);
        if (youtubeRtmpBackup) {
            const backupUrl = `${youtubeRtmpBackup.replace(/\/$/, '')}/${youtubeKey}`;
            const proc2 = spawn('ffmpeg', ['-re', '-i', videoFile,
                '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '2500k',
                '-c:a', 'aac', '-f', 'flv', backupUrl]);
            proc2.stderr.on('data', d => console.log(`YT Backup: ${d}`));
            processes.push(proc2);
        }
    }

    // Facebook
    if (facebookKey && facebookRtmp) {
        const fbUrl = `${facebookRtmp.replace(/\/$/, '')}/${facebookKey}`;
        const proc = spawn('ffmpeg', ['-re', '-i', videoFile,
            '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '2500k',
            '-c:a', 'aac', '-f', 'flv', fbUrl]);
        proc.stderr.on('data', d => console.log(`FB: ${d}`));
        processes.push(proc);
    }

    if (processes.length === 0) return res.status(400).json({ error: 'No valid destinations' });

    activeStream = { processes, title, description, loopMode, autoReconnect, overlays };
    res.json({ message: 'Stream started', count: processes.length });
});

// Stop stream
app.post('/stop-stream', (req, res) => {
    if (activeStream) {
        activeStream.processes.forEach(p => p.kill('SIGINT'));
        activeStream = null;
    }
    res.json({ message: 'Stopped' });
});

// Status
app.get('/stream-status', (req, res) => {
    res.json({ active: !!activeStream, title: activeStream?.title });
});

// Preview (mock)
app.get('/preview', (req, res) => {
    const sample = path.join(__dirname, 'uploads', 'sample.mp4');
    if (fs.existsSync(sample)) res.sendFile(sample);
    else res.status(404).send('No preview');
});

app.listen(PORT, () => console.log(`Backend on port ${PORT}`));
