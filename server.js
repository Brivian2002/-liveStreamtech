require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const cors = require('cors');
const { Pool } = require('pg');
const admin = require('firebase-admin');

// Firebase Admin initialization
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : null;
if (serviceAccount) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} else {
  console.warn('FIREBASE_SERVICE_ACCOUNT not set – auth will fail');
}

const app = express();
const PORT = process.env.PORT || 4000;

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://livestream_db_4aqo_user:luoyaV0L5PGvxdjfa2EdIpCpri1Yr3tX@dpg-d6sk2g15pdvs73dsktig-a.oregon-postgres.render.com/livestream_db_4aqo',
  ssl: { rejectUnauthorized: false }
});

pool.connect((err) => {
  if (err) console.error('DB error:', err.stack);
  else console.log('Connected to PostgreSQL');
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

let activeStream = null;

// ========== Database tables ==========
const createTables = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        uid TEXT PRIMARY KEY,
        email TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS videos (
        id SERIAL PRIMARY KEY,
        user_uid TEXT REFERENCES users(uid) ON DELETE CASCADE,
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
        user_uid TEXT REFERENCES users(uid) ON DELETE CASCADE,
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

// ========== Firebase Auth Middleware ==========
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded; // contains uid, email
    // Insert or update user in DB
    const client = await pool.connect();
    try {
      await client.query(
        'INSERT INTO users (uid, email) VALUES ($1, $2) ON CONFLICT (uid) DO UPDATE SET email = EXCLUDED.email',
        [decoded.uid, decoded.email]
      );
    } finally {
      client.release();
    }
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
}

// ========== API Endpoints ==========

// Upload video
app.post('/upload-video', authenticate, upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { filename, originalname, size } = req.file;
  const client = await pool.connect();
  try {
    const result = await client.query(
      'INSERT INTO videos (user_uid, filename, original_name, size, title, tags, description) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [req.user.uid, filename, originalname, size, originalname, '', '']
    );
    res.json({ message: 'Upload successful', id: result.rows[0].id, filename });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Get user's videos
app.get('/videos', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM videos WHERE user_uid = $1 ORDER BY upload_date DESC', [req.user.uid]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Update video metadata
app.put('/videos/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { title, tags, description } = req.body;
  const client = await pool.connect();
  try {
    const check = await client.query('SELECT user_uid FROM videos WHERE id = $1', [id]);
    if (check.rows.length === 0 || check.rows[0].user_uid !== req.user.uid) {
      return res.status(403).json({ error: 'Not your video' });
    }
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
app.delete('/videos/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    const check = await client.query('SELECT user_uid, filename FROM videos WHERE id = $1', [id]);
    if (check.rows.length === 0 || check.rows[0].user_uid !== req.user.uid) {
      return res.status(403).json({ error: 'Not your video' });
    }
    const filePath = path.join(uploadDir, check.rows[0].filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await client.query('DELETE FROM videos WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Start stream (with TikTok)
app.post('/start-stream', authenticate, async (req, res) => {
  const {
    title, description,
    youtubeRtmpPrimary, youtubeRtmpBackup, youtubeKey,
    facebookRtmp, facebookKey,
    tiktokRtmp, tiktokKey,
    loopMode, autoReconnect, overlays
  } = req.body;

  const clientDb = await pool.connect();
  let videoFile = null;
  try {
    const vidRes = await clientDb.query('SELECT filename FROM videos WHERE user_uid = $1 ORDER BY upload_date DESC LIMIT 1', [req.user.uid]);
    if (vidRes.rows.length) {
      videoFile = path.join(uploadDir, vidRes.rows[0].filename);
    }
  } finally {
    clientDb.release();
  }
  if (!videoFile) return res.status(400).json({ error: 'No video uploaded' });

  const processes = [];

  // YouTube primary
  if (youtubeKey && youtubeRtmpPrimary) {
    const primaryUrl = `${youtubeRtmpPrimary.replace(/\/$/, '')}/${youtubeKey}`;
    const proc1 = spawn('ffmpeg', [
      '-re', '-i', videoFile,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '1500k',
      '-vf', 'scale=1280:720',
      '-c:a', 'aac', '-b:a', '128k',
      '-threads', '2',
      '-f', 'flv', primaryUrl
    ]);
    proc1.stderr.on('data', d => console.log(`YT Primary: ${d}`));
    processes.push(proc1);
  }

  // YouTube backup
  if (youtubeKey && youtubeRtmpBackup) {
    const backupUrl = `${youtubeRtmpBackup.replace(/\/$/, '')}/${youtubeKey}`;
    const proc2 = spawn('ffmpeg', [
      '-re', '-i', videoFile,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '1500k',
      '-vf', 'scale=1280:720',
      '-c:a', 'aac', '-b:a', '128k',
      '-threads', '2',
      '-f', 'flv', backupUrl
    ]);
    proc2.stderr.on('data', d => console.log(`YT Backup: ${d}`));
    processes.push(proc2);
  }

  // Facebook
  if (facebookKey && facebookRtmp) {
    const fbUrl = `${facebookRtmp.replace(/\/$/, '')}/${facebookKey}`;
    const procFb = spawn('ffmpeg', [
      '-re', '-i', videoFile,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '1500k',
      '-vf', 'scale=1280:720',
      '-c:a', 'aac', '-b:a', '128k',
      '-threads', '2',
      '-f', 'flv', fbUrl
    ]);
    procFb.stderr.on('data', d => console.log(`FB: ${d}`));
    processes.push(procFb);
  }

  // TikTok
  if (tiktokKey && tiktokRtmp) {
    const ttUrl = `${tiktokRtmp.replace(/\/$/, '')}/${tiktokKey}`;
    const procTt = spawn('ffmpeg', [
      '-re', '-i', videoFile,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '1500k',
      '-vf', 'scale=1280:720',
      '-c:a', 'aac', '-b:a', '128k',
      '-threads', '2',
      '-f', 'flv', ttUrl
    ]);
    procTt.stderr.on('data', d => console.log(`TikTok: ${d}`));
    processes.push(procTt);
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
    startTime: Date.now(),
    userUid: req.user.uid
  };

  // Save to history
  const client = await pool.connect();
  try {
    await client.query(
      'INSERT INTO stream_history (user_uid, title, platform, status) VALUES ($1, $2, $3, $4)',
      [req.user.uid, title || 'Untitled', 'YouTube/Facebook/TikTok', 'live']
    );
  } catch (err) {
    console.error('Error saving stream start:', err);
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
        'UPDATE stream_history SET status = $1, duration = $2 WHERE status = $3 AND user_uid = $4',
        ['completed', duration, 'live', activeStream.userUid]
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

// Get user's stream history
app.get('/stream-history', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM stream_history WHERE user_uid = $1 ORDER BY date DESC LIMIT 50',
      [req.user.uid]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Preview (authenticated – stream user's latest video)
app.get('/preview', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const vidRes = await client.query('SELECT filename FROM videos WHERE user_uid = $1 ORDER BY upload_date DESC LIMIT 1', [req.user.uid]);
    if (vidRes.rows.length) {
      res.sendFile(path.join(uploadDir, vidRes.rows[0].filename));
    } else {
      res.status(404).send('No preview');
    }
  } finally {
    client.release();
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on port ${PORT}`);
});
