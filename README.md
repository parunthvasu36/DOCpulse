# DocPulse — Real Backend (Node.js + SQLite)

This is the actual working application — real logins, a real database, and
live data shared between every device. This replaces the earlier
front-end-only demo.

## What's inside

- `server.js` — the Express web server and all API routes
- `db.js` — database setup (SQLite, auto-creates `docpulse.db` on first run)
- `public/index.html` — the in-charge panel (login required): chat, calendar, doctor status
- `public/admin.html` — the separate administrator page: create, reset, and remove in-charge accounts
- `public/tv.html` — the Phone Dept TV display (no login, read-only, auto-refreshes every 4 seconds)
- `public/ticker.js` — the news-style scrolling notice bar, shared by the TV display and the in-charge preview

## Running it locally (to test before deploying)

```bash
npm install
npm start
```

Then open:
- http://localhost:3000 — the in-charge login (chat, calendar, doctor status)
- http://localhost:3000/admin.html — the administrator page (create/reset/remove in-charge accounts)
- http://localhost:3000/tv.html — the Phone Dept display

## Default admin login (CHANGE THIS IMMEDIATELY)

- **Username:** `admin`
- **Password:** `admin123`

Log into `/admin.html` with this to create your real in-charge accounts.
There is currently no "change my own admin password" screen — if you need
that, ask me and I'll add it, or update it directly in the database.

## How data is stored

Everything is saved in a single file: `docpulse.db` (created automatically
next to `server.js` the first time you run it). This file **is your data** —
back it up regularly (just copy the file somewhere safe).

## Deploying this for real (your ESXi server + domain)

Follow the `docpulse-hosting-guide.md` document from earlier — Phases 1-3
(create the VM, install Node.js) are unchanged. For Phase 4, instead of a
placeholder, you now have a real project:

```bash
# Upload this whole folder to your server, e.g.:
scp -r docpulse-backend your-username@your-server-ip:~/

# On the server:
cd ~/docpulse-backend
npm install
npm start   # test it works, then Ctrl+C and set up the systemd service
```

Then continue with the systemd service, Nginx, domain, and HTTPS steps
exactly as described in the hosting guide.

## Known limitations of this version (good enough for pilot testing)

- Voice notes are stored directly in the database as base64 text. This is
  simple and works fine for short voice notes, but isn't efficient for lots
  of long recordings — fine for a pilot/demo with real staff, something to
  revisit if voice notes get heavy daily use.
- Chat/calendar/doctor list "live updates" work by each screen checking the
  server every 4 seconds (not instant push). This is simple and reliable,
  and the 4-second delay is unlikely to matter in practice, but it's worth
  knowing it's not true instant push messaging.
- There's no "forgot password" flow yet — only the admin can create/reset
  accounts by deleting and recreating them for now.

None of these are hard blockers for testing with your receptionist and
in-charges — they're just honest notes on what a "version 1" looks like.

## Chat attachments (new)

- In-charges can attach a file in the chat (paperclip button, or drag a file onto the chat).
  Images show as thumbnails; PDF/Word/Excel/text files show as a download link. Maximum 8 MB per file.
- Files (and voice notes) are saved in the `uploads/` folder next to `server.js`. Back this folder up
  together with `docpulse-data.json`. Both are ignored by git, so they never go to GitHub.
- Only images, PDFs and audio open directly in the browser. Any other file type is forced to download,
  so an uploaded web page can never run inside DocPulse.
- On Render's free plan the disk is wiped on every redeploy, so uploaded files and chat history reset then.
  On your own ESXi server they are permanent.

## Scrolling notice and calendar delete (new)

- **Scroll tab** (in-charge panel, below Doctor Status): in-charges add the text to scroll on the Phone Dept
  screen (up to 20 notices, 200 characters each) and delete them again. They also pick the animation
  (Scroll left, Scroll right, Slide up, Fade, Blink) and the speed (Slow, Normal, Fast), with a live preview.
  The setting is shared: whatever is chosen shows on the Phone Dept screen within a few seconds.
- With no notices, the scrolling bar is hidden on the Phone Dept screen, so the boxes get the space back.
- **Calendar:** inside a day's popup, each entry now has a delete (bin) button. Any logged-in in-charge can delete any entry.
- Notices are saved in `docpulse-data.json` with everything else. Old data files upgrade automatically.
