// Inside app.post('/start-stream', authenticate, async (req, res) => {
const {
  title, description,
  youtubeRtmpPrimary, youtubeRtmpBackup, youtubeKey,
  facebookRtmp, facebookKey,
  tiktokRtmp, tiktokKey,
  loopMode, autoReconnect, overlays,
  resolution, bitrate, encoder   // new fields
} = req.body;

// Parse resolution
const [width, height] = resolution ? resolution.split('x') : ['1280', '720'];
const scaleFilter = `scale=${width}:${height}`;
const videoBitrate = bitrate ? `${bitrate}k` : '1500k';
const videoEncoder = encoder || 'libx264';

// Then in each spawn, replace the video-related arguments:
// For example, YouTube primary:
const proc1 = spawn('ffmpeg', [
  '-re', '-i', videoFile,
  '-c:v', videoEncoder, '-preset', 'ultrafast', '-b:v', videoBitrate,
  '-vf', scaleFilter,
  '-c:a', 'aac', '-b:a', '128k',
  '-threads', '2',
  '-f', 'flv', primaryUrl
]);
