// ============================================================
// db.js — MySQL Connection Pool
// ============================================================
//
// WHY A SEPARATE FILE?
//   Same reason as itineraryEngine.js — separation of concerns.
//   server.js shouldn't know HOW we connect to the database,
//   only THAT it can ask db.js for a pool and run queries.
//
//   If we ever switch from MySQL to PostgreSQL, or change
//   hosting providers, we only edit this ONE file.
//
// HOW THIS FILE WORKS:
//   1. Load DB credentials from .env (via dotenv)
//   2. Create a connection pool using those credentials
//   3. Export the pool so server.js can run queries on it
//
// ============================================================


// dotenv.config() loads .env into process.env.
// server.js already calls this, but we call it here too in
// case db.js is ever imported by a different entry file
// (e.g. a test script). It's safe to call multiple times —
// dotenv just does nothing if the values are already loaded.
require('dotenv').config();

// mysql2/promise gives us a version of the MySQL driver where
// every function returns a Promise — meaning we can use
// async/await instead of old-style callbacks.
//
// Compare:
//   OLD (callback style):
//     pool.query('SELECT * FROM trips', function(err, rows) { ... });
//
//   NEW (promise style, what we use):
//     const [rows] = await pool.query('SELECT * FROM trips');
//
// The promise style reads top-to-bottom like normal code —
// much easier to follow, especially for beginners.
const mysql = require('mysql2/promise');


// ── CREATE THE CONNECTION POOL ───────────────────────────────
//
// createPool() doesn't connect immediately — it sets up a
// manager that will open connections ON DEMAND, up to the
// connectionLimit, and reuse them afterward.
//
// CONFIGURATION OPTIONS EXPLAINED:
//
//   host     — Where MySQL is running. "localhost" means
//              "this same computer". In production this might
//              be a remote server address.
//
//   user     — MySQL username (commonly "root" for local dev)
//
//   password — MySQL password for that user
//
//   database — Which database to use (we created "travelmate"
//              in schema.sql)
//
//   waitForConnections —
//              If true: when all pool connections are busy,
//              new requests WAIT in a queue until one frees up.
//              If false: new requests fail immediately instead.
//              true is almost always what you want.
//
//   connectionLimit —
//              Maximum number of simultaneous connections in
//              the pool. 10 is a sensible default for a small
//              app — way more than enough for development and
//              small-scale production.
//
//   queueLimit —
//              Maximum number of requests allowed to wait in
//              the queue (if waitForConnections is true).
//              0 means "unlimited" — fine for our scale.
//
//   dateStrings —
//              By default, mysql2 converts DATE columns into
//              JavaScript Date objects. Date objects carry
//              timezone information, which can shift a date
//              by one day depending on your server's timezone
//              (a VERY common beginner bug — "my trip starts
//              a day earlier than I selected!").
//
//              Setting dateStrings: true tells mysql2 to return
//              dates as plain strings like "2026-08-01" instead —
//              exactly what our HTML <input type="date"> sends
//              and expects. Simpler and avoids timezone bugs.

const pool = mysql.createPool({
  host:               process.env.DB_HOST,
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD,
  database:           process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  dateStrings:        true,
});


// ── EXPORT THE POOL ───────────────────────────────────────────
//
// server.js will do:
//   const pool = require('./db');
//   const [rows] = await pool.query('SELECT * FROM trips');
//
// The pool object has methods like .query() and .execute()
// that automatically borrow a connection, run the query,
// and return it to the pool when done — all behind the scenes.
module.exports = pool;