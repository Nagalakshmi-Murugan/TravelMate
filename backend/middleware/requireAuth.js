// ============================================================
// middleware/requireAuth.js — Route Protection (Phase 3)
// ============================================================
//
// WHAT IS THIS?
//   A small piece of "gatekeeper" middleware. Any route that
//   adds this function as an extra argument will refuse to run
//   its normal handler unless the request has a valid session
//   (i.e. someone is logged in).
//
// HOW MIDDLEWARE CHAINING WORKS:
//   app.get('/api/trips', requireAuth, async function (req, res) {...})
//                          ^^^^^^^^^^^
//   Express runs requireAuth FIRST. If it calls next(), Express
//   moves on to the real route handler. If it does NOT call
//   next() (because we sent a response instead), the real
//   handler never runs at all — the request stops here.
//
// WHY A SEPARATE FILE INSTEAD OF REPEATING THIS CHECK IN EVERY
// ROUTE?
//   Same "separate the concern" reasoning as db.js, groqService.js,
//   and routes/auth.js — one function, reused everywhere, so a
//   future change (e.g. "also log failed attempts") only needs
//   to happen in one place.
// ============================================================

function requireAuth(req, res, next) {
  // req.session is populated automatically by express-session,
  // reading the signed cookie sent with this request. If the
  // user never logged in (or their session expired), userId
  // simply won't be there.
  if (req.session && req.session.userId) {
    // Logged in — let the real route handler run.
    return next();
  }

  // Not logged in — stop here and tell the frontend why.
  // 401 Unauthorized is the standard HTTP status for "you need
  // to be authenticated to do this".
  res.status(401).json({ error: 'You must be logged in to do that.' });
}

module.exports = requireAuth;