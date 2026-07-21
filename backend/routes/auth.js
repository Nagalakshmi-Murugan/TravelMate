// ============================================================
// routes/auth.js — Authentication Routes (Phase 1: Registration)
// ============================================================
//
// WHAT IS A "ROUTER"?
//   express.Router() creates a mini, self-contained Express app.
//   You define routes on it exactly like you would on the main
//   `app` object (app.get, app.post, etc.), then "mount" the
//   whole router onto your main app in server.js with one line:
//     app.use('/api', authRoutes);
//
//   Why bother? Because as auth grows (register → login → logout
//   → "who am I"), all of it lives together in ONE file instead
//   of cluttering server.js. This is the same "separate the
//   concern" idea as db.js and groqService.js — just applied to
//   routes instead of logic.
//
// ============================================================

const express = require('express');
const bcrypt  = require('bcrypt');
const pool    = require('../db');   // same MySQL pool server.js uses

// Needed for the /account routes below, which only a logged-in
// user should be able to reach (view their own info, change their
// own password). Same middleware server.js uses to protect /api/trips.
const requireAuth = require('../middleware/requireAuth');

// Create the mini-app (router).
const router = express.Router();

// A simple, commonly-used pattern to check "does this look like
// a real email address?" — not perfect, but catches the vast
// majority of typos (missing @, missing domain, etc.).
// We're intentionally keeping this simple rather than reaching
// for a heavy validation library, per the "keep it simple" goal.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// How many "rounds" bcrypt uses to hash — 10 is the standard,
// safe default. Higher = slower + more secure; 10 balances
// security and speed well for this scale.
const SALT_ROUNDS = 10;

// Minimum acceptable password length. Feel free to raise this
// later, but 6 is a reasonable beginner-friendly floor.
const MIN_PASSWORD_LENGTH = 6;


// --- ROUTE: Register a New User ---
// POST /api/register
//
// Expects JSON body: { name, email, password }
// (confirmPassword is checked on the FRONTEND only — the server
// only ever needs to store ONE password, so there's nothing
// meaningful for it to "confirm" against.)
router.post('/register', async function (req, res) {

  const { name, email, password } = req.body;

  // ── STEP 1: VALIDATE INPUT ────────────────────────────────
  //
  // IMPORTANT BEGINNER LESSON: we validate on the frontend AND
  // the backend. The frontend check is for a nice, instant user
  // experience. The backend check is the one that actually
  // MATTERS for security — anyone can bypass your frontend
  // entirely (e.g. using a tool like Postman) and hit this API
  // directly, so the server must never trust the browser alone.

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  if (!EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
    });
  }

  try {
    // ── STEP 2: CHECK IF EMAIL ALREADY EXISTS ────────────────
    //
    // We check this BEFORE inserting, so we can give a friendly
    // error message. (The database's UNIQUE constraint on email
    // would also block a duplicate — this is a second, clearer
    // layer of protection, not our only one.)
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email.trim().toLowerCase()]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        error: 'An account with this email already exists. Please log in instead.'
      });
    }

    // ── STEP 3: HASH THE PASSWORD ────────────────────────────
    //
    // bcrypt.hash() is async (it returns a Promise) because the
    // hashing work is CPU-intensive — awaiting it means our
    // server can keep handling other requests while this one
    // grinds away in the background, instead of freezing up.
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // ── STEP 4: INSERT THE NEW USER ──────────────────────────
    //
    // Notice we store `hashedPassword`, NEVER the raw `password`.
    // We also lowercase + trim the email before storing, so
    // "Priya@Gmail.com" and "priya@gmail.com" are treated as
    // the same account (prevents duplicate-looking accounts).
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name.trim(), email.trim().toLowerCase(), hashedPassword]
    );

    console.log(`✅ New user registered: ${email} (id: ${result.insertId})`);

    // ── STEP 5: RESPOND SUCCESS ───────────────────────────────
    //
    // We do NOT log the user in here (no session created) — that
    // logic doesn't exist until Phase 2 (Login). We simply confirm
    // the account was created; the frontend redirects to login.html.
    res.status(201).json({
      success: true,
      message: 'Account created successfully! Please log in.'
    });

  } catch (error) {
    console.error('\n❌ /api/register error:', error.message);

    res.status(500).json({
      error: 'Something went wrong while creating your account. Please try again.'
    });
  }
});


// --- ROUTE: Log In an Existing User ---
// POST /api/login
//
// Expects JSON body: { email, password }
//
// WHAT'S NEW HERE (Phase 2 concepts):
//
//   1. bcrypt.compare() — the "reverse" of bcrypt.hash() from
//      registration. You never un-hash a password; instead you
//      hash the freshly-typed one the same way and compare the
//      two results. See the giant comment in the register route
//      for the full "blender" explanation if you need a refresher.
//
//   2. req.session — this is where express-session (set up in
//      server.js) becomes useful for the first time. Writing to
//      req.session.userId doesn't just store a JS variable — it
//      tells express-session "remember this for next time," and
//      it automatically:
//        a) saves this data server-side (in memory, by default)
//        b) sends the browser a cookie containing a signed session ID
//      On every future request, that cookie comes back automatically,
//      and express-session loads the matching data back into
//      req.session for you. That's how the server "remembers" a
//      logged-in user across separate page loads/requests.
router.post('/login', async function (req, res) {

  const { email, password } = req.body;

  // ── STEP 1: VALIDATE INPUT ────────────────────────────────
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  try {
    // ── STEP 2: LOOK UP THE USER BY EMAIL ────────────────────
    const [users] = await pool.execute(
      'SELECT id, name, email, password FROM users WHERE email = ?',
      [email.trim().toLowerCase()]
    );

    // SECURITY NOTE: if no user is found, we deliberately give the
    // SAME error message as "wrong password" below ("Invalid email
    // or password"), rather than "no account with that email".
    // This stops an attacker from using your login form to figure
    // out which emails have accounts (a technique called
    // "user enumeration").
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = users[0];

    // ── STEP 3: COMPARE THE PASSWORD ─────────────────────────
    //
    // bcrypt.compare(plainTextInput, storedHash) re-hashes the
    // typed password using the salt embedded in storedHash, then
    // checks if the results match. Returns true/false.
    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // ── STEP 4: CREATE THE SESSION ───────────────────────────
    //
    // This is the moment the user actually becomes "logged in".
    // We only ever store the user's id and name in the session —
    // NEVER the password (not even the hash). The session is
    // trusted server-side storage; the browser only ever holds a
    // signed, meaningless-to-read cookie pointing at it.
    req.session.userId   = user.id;
    req.session.userName = user.name;

    console.log(`✅ User logged in: ${user.email} (id: ${user.id})`);

    // ── STEP 5: RESPOND SUCCESS ───────────────────────────────
    res.status(200).json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email }
    });

  } catch (error) {
    console.error('\n❌ /api/login error:', error.message);

    res.status(500).json({
      error: 'Something went wrong while logging in. Please try again.'
    });
  }
});


// --- ROUTE: Check Current Login Status ---
// GET /api/session
//
// WHY THIS ROUTE EXISTS:
//   When a user opens index.html, how does the page know whether
//   they're logged in (to show "Welcome, Priya" instead of a
//   "Log in" link)? It asks the server, because only the server
//   can read the trusted session data — the browser's cookie is
//   just a signed pointer, not the actual data.
//
// This route reads req.session (populated automatically by
// express-session from the incoming cookie) and reports back
// whether it contains a logged-in user.
router.get('/session', function (req, res) {
  if (req.session && req.session.userId) {
    return res.status(200).json({
      loggedIn: true,
      user: { id: req.session.userId, name: req.session.userName }
    });
  }

  res.status(200).json({ loggedIn: false });
});


// --- ROUTE: Log Out ---
// POST /api/logout
//
// req.session.destroy() wipes the session data server-side and
// tells the browser (via the response) that its cookie is no
// longer valid. After this, req.session.userId will be gone on
// any future request from this browser — effectively "forgetting"
// the login until they log in again.
router.post('/logout', function (req, res) {
  req.session.destroy(function (error) {
    if (error) {
      console.error('\n❌ /api/logout error:', error.message);
      return res.status(500).json({ error: 'Could not log out. Please try again.' });
    }

    // clearCookie removes the (now-invalid) session cookie from
    // the browser too, so it doesn't linger unnecessarily.
    // 'connect.sid' is express-session's default cookie name.
    res.clearCookie('connect.sid');
    res.status(200).json({ success: true, message: 'Logged out successfully.' });
  });
});


// --- ROUTE: Get My Account Info ---
// GET /api/account
//
// Protected by requireAuth — only a logged-in user can call this,
// and it only ever returns THEIR OWN info (never someone else's),
// because we look up by req.session.userId, not a URL parameter.
router.get('/account', requireAuth, async function (req, res) {
  try {
    const [users] = await pool.execute(
      'SELECT id, name, email, created_at FROM users WHERE id = ?',
      [req.session.userId]
    );

    if (users.length === 0) {
      // Extremely unlikely (would mean the account was deleted
      // while still logged in) but handled defensively anyway.
      return res.status(404).json({ error: 'Account not found.' });
    }

    res.status(200).json({ success: true, user: users[0] });

  } catch (error) {
    console.error('\n❌ /api/account (GET) error:', error.message);
    res.status(500).json({ error: 'Could not load account info. Please try again.' });
  }
});


// --- ROUTE: Change Password ---
// POST /api/account/password
//
// Expects JSON body: { currentPassword, newPassword }
// (confirmNewPassword, like at registration, is checked on the
// FRONTEND only — the server just needs the one new password.)
//
// WHY REQUIRE THE CURRENT PASSWORD?
//   Without this check, anyone who walks up to an already-logged-in
//   browser (e.g. a shared/public computer) could silently change
//   the real owner's password and lock them out. Requiring the
//   current password proves it's really the account owner typing,
//   not just "whoever has this browser open right now."
router.post('/account/password', requireAuth, async function (req, res) {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword) {
    return res.status(400).json({ error: 'Current password is required.' });
  }

  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
    });
  }

  try {
    // ── STEP 1: LOOK UP THE CURRENT HASHED PASSWORD ──────────
    const [users] = await pool.execute(
      'SELECT password FROM users WHERE id = ?',
      [req.session.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    // ── STEP 2: VERIFY THE CURRENT PASSWORD IS CORRECT ───────
    // Same bcrypt.compare() pattern as /login — proves the person
    // typing right now actually knows the existing password.
    const currentIsCorrect = await bcrypt.compare(currentPassword, users[0].password);

    if (!currentIsCorrect) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    // ── STEP 3: HASH AND SAVE THE NEW PASSWORD ───────────────
    const newHashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await pool.execute(
      'UPDATE users SET password = ? WHERE id = ?',
      [newHashedPassword, req.session.userId]
    );

    console.log(`✅ Password changed for user id: ${req.session.userId}`);

    res.status(200).json({ success: true, message: 'Password updated successfully.' });

  } catch (error) {
    console.error('\n❌ /api/account/password error:', error.message);
    res.status(500).json({ error: 'Could not update password. Please try again.' });
  }
});


// Export the router so server.js can mount it.
module.exports = router;