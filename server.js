const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configure multer for video uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads';
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB
});

// In-memory store for active streams
let activeStream = null; // { processes, ... }

// ========== API Endpoints ==========

// Upload video
app.post('/upload-video', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({
        message: 'Upload successful',
        id: req.file.filename,
        path: req.file.path
    });
});

// List videos
app.get('/videos', (req, res) => {
    fs.readdir('uploads', (err, files) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(files);
    });
});

// Start stream – accepts custom RTMP URLs
app.post('/start-stream', (req, res) => {
    const {
        title, description, privacy,
        youtubeRtmpPrimary, youtubeRtmpBackup, youtubeKey,
        facebookRtmp, facebookKey
    } = req.body;

    // Find a video to stream (use the most recent uploaded)
    const videosDir = 'uploads';
    let videoFile = null;
    if (fs.existsSync(videosDir)) {
        const files = fs.readdirSync(videosDir);
        if (files.length > 0) videoFile = path.join(videosDir, files[files.length - 1]); // latest
    }
    if (!videoFile) {
        return res.status(400).json({ error: 'No video found. Upload a video first.' });
    }

    const processes = [];

    // YouTube stream(s)
    if (youtubeKey && youtubeRtmpPrimary) {
        // Primary
        const primaryUrl = `${youtubeRtmpPrimary.replace(/\/$/, '')}/${youtubeKey}`;
        const procPrimary = spawn('ffmpeg', [
            '-re', '-i', videoFile,
            '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '2500k',
            '-c:a', 'aac',
            '-f', 'flv',
            primaryUrl
        ]);
        procPrimary.stderr.on('data', (data) => console.log(`FFmpeg YouTube Primary: ${data}`));
        procPrimary.on('close', (code) => console.log(`FFmpeg YouTube Primary exited with code ${code}`));
        processes.push(procPrimary);

        // Backup if provided
        if (youtubeRtmpBackup) {
            const backupUrl = `${youtubeRtmpBackup.replace(/\/$/, '')}/${youtubeKey}`;
            const procBackup = spawn('ffmpeg', [
                '-re', '-i', videoFile,
                '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '2500k',
                '-c:a', 'aac',
                '-f', 'flv',
                backupUrl
            ]);
            procBackup.stderr.on('data', (data) => console.log(`FFmpeg YouTube Backup: ${data}`));
            procBackup.on('close', (code) => console.log(`FFmpeg YouTube Backup exited with code ${code}`));
            processes.push(procBackup);
        }
    }

    // Facebook stream
    if (facebookKey && facebookRtmp) {
        const fbUrl = `${facebookRtmp.replace(/\/$/, '')}/${facebookKey}`;
        const procFb = spawn('ffmpeg', [
            '-re', '-i', videoFile,
            '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '2500k',
            '-c:a', 'aac',
            '-f', 'flv',
            fbUrl
        ]);
        procFb.stderr.on('data', (data) => console.log(`FFmpeg Facebook: ${data}`));
        procFb.on('close', (code) => console.log(`FFmpeg Facebook exited with code ${code}`));
        processes.push(procFb);
    }

    if (processes.length === 0) {
        return res.status(400).json({ error: 'No valid stream destinations configured' });
    }

    activeStream = { processes, title, description, privacy };
    res.json({ message: 'Stream started', destinations: processes.length });
});

// Stop stream
app.post('/stop-stream', (req, res) => {
    if (activeStream && activeStream.processes) {
        activeStream.processes.forEach(proc => proc.kill('SIGINT'));
        activeStream = null;
    }
    res.json({ message: 'Stream stopped' });
});

// Stream status
app.get('/stream-status', (req, res) => {
    if (activeStream) {
        res.json({ active: true, title: activeStream.title });
    } else {
        res.json({ active: false });
    }
});

// Mock preview (optional)
app.get('/preview', (req, res) => {
    const sample = path.join(__dirname, 'uploads', 'sample.mp4');
    if (fs.existsSync(sample)) {
        res.sendFile(sample);
    } else {
        res.status(404).send('No preview available');
    }
});

app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
});
