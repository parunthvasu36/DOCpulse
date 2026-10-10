const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');
const fs = require('fs');
const crypto = require('crypto');

// ---------- File storage (chat attachments + voice notes) ----------
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB
// Only these types are shown inline in the browser; everything else is forced to download.
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf',
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a']);

function saveDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma < 0) return null;
  const header = dataUrl.slice(5, comma);
  if (!header.endsWith(';base64')) return null;
  const mime = header.split(';')[0].toLowerCase() || 'application/octet-stream';
  const buf = Buffer.from(dataUrl.slice(comma + 1), 'base64');
  if (buf.length === 0) return null;
  if (buf.length > MAX_FILE_BYTES) return { error: 'File is too large (maximum 8 MB)' };
  const id = crypto.randomBytes(8).toString('hex');
  fs.writeFileSync(path.join(UPLOAD_DIR, id), buf);
  return { id, mime, size: buf.length };
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' })); // generous limit to allow short voice notes as base64
app.use(session({
  secret: 'docpulse-change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 } // 12 hour session
}));

// ---------- Auth helpers ----------
function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

// ---------- Auth routes ----------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const admin = db.findAdminByUsername(username);
  if (admin && bcrypt.compareSync(password, admin.password_hash)) {
    req.session.user = { role: 'admin', username: admin.username, name: 'Administrator' };
    return res.json({ role: 'admin', name: 'Administrator' });
  }

  const incharge = db.findInchargeByUsername(username);
  if (incharge && bcrypt.compareSync(password, incharge.password_hash)) {
    req.session.user = { role: 'incharge', username: incharge.username, name: incharge.name };
    return res.json({ role: 'incharge', name: incharge.name });
  }

  res.status(401).json({ error: 'Invalid username or password' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  res.json(req.session.user);
});

// ---------- Admin: manage in-charge accounts ----------
app.get('/api/incharges', requireAdmin, (req, res) => {
  res.json(db.getIncharges());
});

app.post('/api/incharges', requireAdmin, (req, res) => {
  const { username, password, name, designation } = req.body;
  if (!username || !password || !name) return res.status(400).json({ error: 'username, password, name required' });
  const hash = bcrypt.hashSync(password, 10);
  const created = db.addIncharge({ username, password_hash: hash, name, designation });
  if (!created) return res.status(400).json({ error: 'Username already exists' });
  res.json(created);
});

app.patch('/api/incharges/:id/password', requireAdmin, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  const hash = bcrypt.hashSync(password, 10);
  const ok = db.updateInchargePassword(req.params.id, hash);
  if (!ok) return res.status(404).json({ error: 'In-charge not found' });
  res.json({ ok: true });
});

app.delete('/api/incharges/:id', requireAdmin, (req, res) => {
  db.deleteIncharge(req.params.id);
  res.json({ ok: true });
});

// ---------- Messages (chat, including voice notes) ----------
// GET is public (no login) so the TV display can read it without authenticating.
app.get('/api/messages', (req, res) => {
  res.json(db.getMessages());
});

app.post('/api/messages', requireLogin, (req, res) => {
  const { type, text, fileData, fileName } = req.body;
  const author = req.session.user.name;
  const ts = Date.now();

  if (type === 'voice' || type === 'file') {
    const saved = saveDataUrl(fileData);
    if (!saved) return res.status(400).json({ error: 'Invalid file' });
    if (saved.error) return res.status(413).json({ error: saved.error });
    const name = String(fileName || (type === 'voice' ? 'voice-message' : 'file')).slice(0, 120);
    return res.json(db.addMessage({
      author, type, text: text ? String(text).slice(0, 1000) : null,
      fileId: saved.id, fileName: name, fileType: saved.mime, fileSize: saved.size, ts
    }));
  }

  if (!text || !String(text).trim()) return res.status(400).json({ error: 'Message is empty' });
  res.json(db.addMessage({ author, type: 'text', text: String(text), ts }));
});

// Files are public to read (the TV display has no login), same as messages.
app.get('/api/files/:id', (req, res) => {
  if (!/^[a-f0-9]{16}$/.test(req.params.id)) return res.status(404).end();
  const meta = db.getMessageByFileId(req.params.id);
  const file = path.join(UPLOAD_DIR, req.params.id);
  if (!meta || !fs.existsSync(file)) return res.status(404).end();
  const inline = INLINE_TYPES.has(meta.fileType);
  res.setHeader('Content-Type', inline ? meta.fileType : 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition',
    (inline ? 'inline' : 'attachment') + "; filename*=UTF-8''" + encodeURIComponent(meta.fileName || 'file'));
  res.sendFile(file);
});

// ---------- Calendar entries ----------
app.get('/api/calendar', (req, res) => {
  res.json(db.getCalendarEntries());
});

app.post('/api/calendar', requireLogin, (req, res) => {
  const { date, text } = req.body;
  if (!date || !text) return res.status(400).json({ error: 'date and text required' });
  const author = req.session.user.name;
  const ts = Date.now();
  const entry = db.addCalendarEntry({ date, author, text, ts });
  res.json(entry);
});

app.delete('/api/calendar/:id', requireLogin, (req, res) => {
  db.deleteCalendarEntry(req.params.id);
  res.json({ ok: true });
});

// ---------- Doctor status list ----------
app.get('/api/doctors', (req, res) => {
  res.json(db.getDoctors());
});

app.post('/api/doctors', requireLogin, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = 'd' + Date.now() + Math.random().toString(36).slice(2, 6);
  const doc = db.addDoctor({ id, name, status: 'present' });
  res.json(doc);
});

app.patch('/api/doctors/:id', requireLogin, (req, res) => {
  const { status } = req.body;
  if (!['present', 'leave'].includes(status)) return res.status(400).json({ error: 'invalid status' });
  db.updateDoctorStatus(req.params.id, status);
  res.json({ ok: true });
});

app.delete('/api/doctors/:id', requireLogin, (req, res) => {
  db.deleteDoctor(req.params.id);
  res.json({ ok: true });
});

// ---------- Scrolling notice (ticker on the Phone Dept screen) ----------
const TICKER_ANIMATIONS = ['left', 'right', 'slideup', 'fade', 'blink'];
const TICKER_SPEEDS = ['slow', 'normal', 'fast'];

app.get('/api/ticker', (req, res) => {
  res.json(db.getTicker());
});

app.post('/api/ticker/items', requireLogin, (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 200);
  if (!text) return res.status(400).json({ error: 'Please type the text to scroll' });
  if (db.getTicker().items.length >= 20) {
    return res.status(400).json({ error: 'There are already 20 scrolling notices. Delete one first.' });
  }
  res.json(db.addTickerItem({ text, author: req.session.user.name, ts: Date.now() }));
});

app.delete('/api/ticker/items/:id', requireLogin, (req, res) => {
  db.deleteTickerItem(req.params.id);
  res.json({ ok: true });
});

app.put('/api/ticker/settings', requireLogin, (req, res) => {
  const { animation, speed } = req.body;
  if (!TICKER_ANIMATIONS.includes(animation) || !TICKER_SPEEDS.includes(speed)) {
    return res.status(400).json({ error: 'Invalid settings' });
  }
  db.setTickerSettings({ animation, speed });
  res.json({ ok: true });
});

// ---------- Serve frontend ----------
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`DocPulse server running on http://localhost:${PORT}`);
});
