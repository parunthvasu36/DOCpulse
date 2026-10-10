// Simple pure-JavaScript, file-based database.
// No native compilation required — works identically on any host (Render,
// your own server, anywhere Node.js runs). Data is stored in a single JSON
// file (docpulse-data.json) next to this file.

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_FILE = path.join(__dirname, 'docpulse-data.json');

function defaultData() {
  return {
    admins: [],
    incharges: [],
    messages: [],
    calendar: [],
    doctors: [],
    ticker: { animation: 'left', speed: 'normal', items: [] }
  };
}

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    const fresh = defaultData();
    save(fresh);
    return fresh;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Could not read data file, starting fresh:', e.message);
    const fresh = defaultData();
    save(fresh);
    return fresh;
  }
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

let data = load();
// Older data files (from before the scrolling notice existed) get the new section added
if (!data.ticker) { data.ticker = defaultData().ticker; save(data); }

function nextId(list) {
  const max = list.reduce((m, item) => Math.max(m, item.id || 0), 0);
  return max + 1;
}

// ---- Seed default admin on first run ----
if (data.admins.length === 0) {
  data.admins.push({
    id: 1,
    username: 'admin',
    password_hash: bcrypt.hashSync('admin123', 10)
  });
  console.log('>>> Created default admin account — username: admin / password: admin123');
  console.log('>>> IMPORTANT: change this password after first login.');
  save(data);
}

// ---- Seed default doctors on first run ----
if (data.doctors.length === 0) {
  data.doctors.push(
    { id: 'd1', name: 'Dr. Arun', status: 'present' },
    { id: 'd2', name: 'Dr. Sunil', status: 'leave' },
    { id: 'd3', name: 'Dr. Manoj', status: 'present' },
    { id: 'd4', name: 'Dr. Deepak', status: 'leave' }
  );
  save(data);
}

module.exports = {
  // ---- Admins ----
  findAdminByUsername(username) {
    return data.admins.find(a => a.username === username);
  },

  // ---- Incharges ----
  getIncharges() {
    return data.incharges.map(({ password_hash, ...rest }) => rest);
  },
  findInchargeByUsername(username) {
    return data.incharges.find(i => i.username === username);
  },
  addIncharge({ username, password_hash, name, designation }) {
    if (data.incharges.some(i => i.username === username)) return null;
    const incharge = { id: nextId(data.incharges), username, password_hash, name, designation: designation || '' };
    data.incharges.push(incharge);
    save(data);
    const { password_hash: _, ...safe } = incharge;
    return safe;
  },
  deleteIncharge(id) {
    const before = data.incharges.length;
    data.incharges = data.incharges.filter(i => i.id !== Number(id));
    save(data);
    return data.incharges.length < before;
  },
  updateInchargePassword(id, password_hash) {
    const incharge = data.incharges.find(i => i.id === Number(id));
    if (!incharge) return false;
    incharge.password_hash = password_hash;
    save(data);
    return true;
  },

  // ---- Messages ----
  getMessages() {
    return data.messages.slice(-300);
  },
  addMessage(m) {
    const msg = { id: nextId(data.messages), ...m };
    data.messages.push(msg);
    save(data);
    return msg;
  },
  getMessageByFileId(fileId) {
    return data.messages.find(m => m.fileId === fileId);
  },

  // ---- Calendar ----
  getCalendarEntries() {
    return data.calendar.slice().sort((a, b) => a.date.localeCompare(b.date));
  },
  addCalendarEntry({ date, author, text, ts }) {
    const entry = { id: nextId(data.calendar), date, author, text, ts };
    data.calendar.push(entry);
    save(data);
    return entry;
  },
  deleteCalendarEntry(id) {
    data.calendar = data.calendar.filter(e => e.id !== Number(id));
    save(data);
  },

  // ---- Scrolling notice (ticker) ----
  getTicker() {
    return data.ticker;
  },
  addTickerItem({ text, author, ts }) {
    const item = { id: nextId(data.ticker.items), text, author, ts };
    data.ticker.items.push(item);
    save(data);
    return item;
  },
  deleteTickerItem(id) {
    data.ticker.items = data.ticker.items.filter(i => i.id !== Number(id));
    save(data);
  },
  setTickerSettings({ animation, speed }) {
    data.ticker.animation = animation;
    data.ticker.speed = speed;
    save(data);
  },

  // ---- Doctors ----
  getDoctors() {
    return data.doctors;
  },
  addDoctor({ id, name, status }) {
    const doc = { id, name, status: status || 'present' };
    data.doctors.push(doc);
    save(data);
    return doc;
  },
  updateDoctorStatus(id, status) {
    const doc = data.doctors.find(d => d.id === id);
    if (!doc) return false;
    doc.status = status;
    save(data);
    return true;
  },
  deleteDoctor(id) {
    data.doctors = data.doctors.filter(d => d.id !== id);
    save(data);
  }
};
