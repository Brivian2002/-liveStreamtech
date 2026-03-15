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
let activeStream = null; // { process, youtubeUrl, facebookUrl }

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

// Start stream
app.post('/start-stream', (req, res) => {
    const { title, description, privacy, youtubeKey, facebookKey } = req.body;
    
    // Validate required keys
    if (!youtubeKey && !facebookKey) {
        return res.status(400).json({ error: 'At least one stream key is required' });
    }

    // In a real app you'd select a video file from the library.
    // For demo, we use a sample video path or the latest uploaded.
    const videosDir = 'uploads';
    let videoFile = null;
    if (fs.existsSync(videosDir)) {
        const files = fs.readdirSync(videosDir);
        if (files.length > 0) videoFile = path.join(videosDir, files[0]); // use first video
    }
    if (!videoFile) {
        return res.status(400).json({ error: 'No video found. Upload a video first.' });
    }

    // Build RTMP URLs
    const rtmpUrlYoutube = `rtmp://a.rtmp.youtube.com/live2/${youtubeKey}`;
    const rtmpUrlFacebook = `rtmp://live-api-s.facebook.com:80/rtmp/${facebookKey}`;

    // FFmpeg command to stream to multiple destinations
    // This example streams the video file to both platforms simultaneously
    const ffmpegArgs = [
        '-re',                     // read input at native frame rate
        '-i', videoFile,            // input file
        '-c:v', 'libx264',          // video codec
        '-preset', 'veryfast',
        '-b:v', '2500k',            // bitrate (could be from settings)
        '-c:a', 'aac',
        '-f', 'flv',                 // output format for RTMP
    ];

    // If YouTube key provided, add output
    const outputs = [];
    if (youtubeKey) outputs.push(rtmpUrlYoutube);
    if (facebookKey) outputs.push(rtmpUrlFacebook);

    // For each output, we need to duplicate the stream.
    // Use the tee muxer or run multiple ffmpeg processes.
    // Here we'll spawn separate processes for simplicity.
    if (outputs.length === 0) return res.status(400).json({ error: 'No valid stream keys' });

    // Start a child process for each destination
    const processes = [];
    outputs.forEach((url, index) => {
        const proc = spawn('ffmpeg', [
            '-re', '-i', videoFile,
            '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '2500k',
            '-c:a', 'aac',
            '-f', 'flv',
            url
        ]);
        proc.stderr.on('data', (data) => console.log(`FFmpeg[${index}]: ${data}`));
        proc.on('close', (code) => console.log(`FFmpeg[${index}] exited with code ${code}`));
        processes.push(proc);
    });

    activeStream = { processes, youtubeKey, facebookKey, title, description, privacy };

    res.json({ message: 'Stream started', destinations: outputs.length });
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

// Mock preview stream (for frontend monitor)
app.get('/preview', (req, res) => {
    // In a real system you'd serve a live HLS stream or similar.
    // For demo, we just return a sample video.
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