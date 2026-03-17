require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 4000;

// PostgreSQL connection – using your new database URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://livestream_db_4aqo_user:luoyaV0L5PGvxdjfa2EdIpCpri1Yr3tX@dpg-d6sk2g15pdvs73dsktig-a.oregon-postgres.render.com/livestream_db_4aqo',
  ssl: { rejectUnauthorized: false }
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to PostgreSQL:', err.stack);
  } else {
    console.log('Connected to PostgreSQL database');
    release();
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB
});

// In‑memory active stream
let activeStream = null;

// ========== Database setup ==========
const createTables = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS videos (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        size BIGINT,
        title TEXT,
        tags TEXT,
        description TEXT,
        upload_date TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS stream_history (
        id SERIAL PRIMARY KEY,
        title TEXT,
        date TIMESTAMP DEFAULT NOW(),
        duration INTEGER,
        platform TEXT,
        status TEXT
      );
    `);
    console.log('Database tables ensured');
  } catch (err) {
    console.error('Error creating tables:', err);
  } finally {
    client.release();
  }
};
createTables();

// ========== API Endpoints ==========

// Upload video
app.post('/upload-video', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { filename, originalname, size } = req.file;
  const client = await pool.connect();
  try {
    const result = await client.query(
      'INSERT INTO videos (filename, original_name, size, title, tags, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [filename, originalname, size, originalname, '', '']
    );
    res.json({
      message: 'Upload successful',
      id: result.rows[0].id,
      filename
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Get all videos
app.get('/videos', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM videos ORDER BY upload_date DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Update video metadata
app.put('/videos/:id', async (req, res) => {
  const { id } = req.params;
  const { title, tags, description } = req.body;
  const client = await pool.connect();
  try {
    await client.query(
      'UPDATE videos SET title = $1, tags = $2, description = $3 WHERE id = $4',
      [title, tags, description, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Delete video
app.delete('/videos/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    const fileRes = await client.query('SELECT filename FROM videos WHERE id = $1', [id]);
    if (fileRes.rows.length) {
      const filePath = path.join(uploadDir, fileRes.rows[0].filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await client.query('DELETE FROM videos WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Start stream
app.post('/start-stream', async (req, res) => {
  const {
    title, description,
    youtubeRtmpPrimary, youtubeRtmpBackup, youtubeKey,
    facebookRtmp, facebookKey,
    loopMode, autoReconnect, overlays
  } = req.body;

  const files = fs.readdirSync(uploadDir);
  if (files.length === 0) return res.status(400).json({ error: 'No video uploaded' });
  const videoFile = path.join(uploadDir, files[files.length - 1]);

  const processes = [];

  if (youtubeKey && youtubeRtmpPrimary) {
    const primaryUrl = `${youtubeRtmpPrimary.replace(/\/$/, '')}/${youtubeKey}`;
    const proc1 = spawn('ffmpeg', [
      '-re', '-i', videoFile,
      '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '2500k',
      '-c:a', 'aac', '-f', 'flv', primaryUrl
    ]);
    proc1.stderr.on('data', d => console.log(`YT Primary: ${d}`));
    processes.push(proc1);

    if (youtubeRtmpBackup) {
      const backupUrl = `${youtubeRtmpBackup.replace(/\/$/, '')}/${youtubeKey}`;
      const proc2 = spawn('ffmpeg', ['-re', '-i', videoFile,
        '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '2500k',
        '-c:a', 'aac', '-f', 'flv', backupUrl
      ]);
      proc2.stderr.on('data', d => console.log(`YT Backup: ${d}`));
      processes.push(proc2);
    }
  }

  if (facebookKey && facebookRtmp) {
    const fbUrl = `${facebookRtmp.replace(/\/$/, '')}/${facebookKey}`;
    const procFb = spawn('ffmpeg', ['-re', '-i', videoFile,
      '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '2500k',
      '-c:a', 'aac', '-f', 'flv', fbUrl
    ]);
    procFb.stderr.on('data', d => console.log(`FB: ${d}`));
    processes.push(procFb);
  }

  if (processes.length === 0) {
    return res.status(400).json({ error: 'No valid stream destinations' });
  }

  activeStream = {
    processes,
    title,
    description,
    loopMode,
    autoReconnect,
    overlays,
    startTime: Date.now()
  };

  const client = await pool.connect();
  try {
    await client.query(
      'INSERT INTO stream_history (title, platform, status) VALUES ($1, $2, $3)',
      [title || 'Untitled', 'YouTube/Facebook', 'live']
    );
  } catch (err) {
    console.error('Error saving stream start to DB:', err);
  } finally {
    client.release();
  }

  res.json({ message: 'Stream started', count: processes.length });
});

// Stop stream
app.post('/stop-stream', async (req, res) => {
  if (activeStream) {
    activeStream.processes.forEach(p => p.kill('SIGINT'));
    const duration = Math.floor((Date.now() - activeStream.startTime) / 1000);
    const client = await pool.connect();
    try {
      await client.query(
        'UPDATE stream_history SET status = $1, duration = $2 WHERE status = $3',
        ['completed', duration, 'live']
      );
    } catch (err) {
      console.error('Error updating stream history:', err);
    } finally {
      client.release();
    }
    activeStream = null;
  }
  res.json({ message: 'Stream stopped' });
});

// Stream status
app.get('/stream-status', (req, res) => {
  if (activeStream) {
    res.json({ active: true, title: activeStream.title, startTime: activeStream.startTime });
  } else {
    res.json({ active: false });
  }
});

// Get stream history
app.get('/stream-history', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM stream_history ORDER BY date DESC LIMIT 50');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Mock preview
app.get('/preview', (req, res) => {
  const files = fs.readdirSync(uploadDir);
  if (files.length) {
    res.sendFile(path.join(uploadDir, files[files.length - 1]));
  } else {
    res.status(404).send('No preview');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on port ${PORT}`);
});
