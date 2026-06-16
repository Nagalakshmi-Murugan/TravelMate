// ============================================================
// server.js — The TravelMate AI Express Server
// ============================================================
//
// In Node.js, we use "require()" to import packages.
// Think of it like: "I need this tool, go get it from the toolbox."
// (In newer JS you'd use "import", but require() is the classic Node way.)
//
// ============================================================


// --- 1. LOAD PACKAGES ---

// dotenv reads your .env file and makes those values available
// via process.env.VARIABLE_NAME anywhere in this file.
// MUST be called first, before anything else uses process.env.
require('dotenv').config();

// express is the web framework — it handles incoming HTTP requests.
const express = require('express');

// cors solves a browser security rule called "Same-Origin Policy".
// By default, a webpage at localhost:5500 CANNOT call an API
// at localhost:3000. CORS middleware tells the browser: "it's okay".
const cors = require('cors');

// path is a built-in Node.js module (no install needed).
// It helps build file paths that work on both Windows and Mac/Linux.
// Windows uses backslashes (\), Mac/Linux use forward slashes (/).
// path.join() handles this automatically.
const path = require('path');

// Our own rule-based itinerary engine (Phase 3 — revised).
// The './' means "look in the same folder as this file".
// We destructure to pull out just the function we need.
// No API keys, no network calls — pure JavaScript logic.
const itineraryEngine = require('./itineraryEngine');

// Our MySQL connection pool (Phase 4).
// db.js handles all connection configuration — here we just
// import the ready-to-use pool and call .query() / .execute() on it.
const pool = require('./db');


// --- 2. CREATE THE EXPRESS APP ---

// express() creates a new application instance.
// We store it in "app". All our configuration goes on this object.
const app = express();

// process.env.PORT reads the PORT value from your .env file.
// The || 3000 part means: "if PORT is not set, use 3000 as a fallback".
const PORT = process.env.PORT || 3000;


// --- 3. MIDDLEWARE ---
//
// Middleware is code that runs on EVERY request before it reaches
// your routes. Think of it as a security guard that inspects each
// visitor before letting them into the building.
//
// app.use(...) registers a piece of middleware.

// cors() middleware: allows cross-origin requests from your frontend.
app.use(cors());

// express.json() middleware: when a POST request arrives with a JSON
// body, this automatically parses it into a JavaScript object.
// Without this, req.body would be undefined in POST routes.
app.use(express.json());

// express.static() serves your HTML, CSS, and JS files as-is.
// __dirname is a built-in variable = the folder this server.js is in.
// So this means: "serve all files in the same folder as server.js".
// When someone visits http://localhost:3000, they get index.html.
app.use(express.static(path.join(__dirname)));


// --- 4. ROUTES ---
//
// A route handles a specific URL path.
//
// Structure:
//   app.METHOD(PATH, HANDLER)
//
//   METHOD  = get, post, put, delete
//   PATH    = the URL like '/api/generate'
//   HANDLER = function(req, res) { ... }
//
//   req = the incoming request (what the browser sent to us)
//   res = the response (what we send back to the browser)


// --- ROUTE 1: Health Check ---
// GET /api/health
//
// This is a simple route to verify the server is running.
// Visit http://localhost:3000/api/health in your browser.
// If you see the JSON response, the server is working!
app.get('/api/health', function (req, res) {
  // res.json() sends a JSON response back to the caller.
  // JSON (JavaScript Object Notation) is how frontend & backend
  // communicate — it's just a structured text format.
  res.json({
    status: 'ok',
    message: 'TravelMate server is running!',
    timestamp: new Date().toISOString()
  });
});


// --- ROUTE 2: Generate Itinerary with Rule-Based Engine ---
// POST /api/generate
//
// PHASE 3 (REVISED): No external AI, no API keys, no network
// calls. itineraryEngine.generate() is a plain, synchronous
// JavaScript function — it runs instantly, so this route
// doesn't even need to be "async" or use "await".
//
// This is a great interview talking point: "the itinerary
// generation is a pure function — given the same inputs (and
// ignoring the random shuffle), it's fast, predictable, and
// has zero external dependencies or costs."
app.post('/api/generate', function (req, res) {

  const { destination, startDate, endDate, budget, style } = req.body;

  // --- Input Validation (unchanged from Phase 2) ---
  if (!destination || !startDate || !endDate || !budget || !style) {
    return res.status(400).json({
      error: 'Missing required fields: destination, startDate, endDate, budget, style'
    });
  }

  const start = new Date(startDate);
  const end   = new Date(endDate);
  const days  = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

  if (days < 1) {
    return res.status(400).json({ error: 'End date must be after start date' });
  }

  // --- Call the Rule-Based Engine ---
  // We still wrap this in try/catch as good practice — if any
  // unexpected error occurs (e.g. a bad date), we don't want
  // the server to crash. But unlike Gemini, this code has no
  // network calls, so errors here would only be bugs in our
  // own logic — good to catch during development.
  try {
    // generate() is synchronous — no "await" needed.
    // It returns { summary, budgetTier, itinerary }
    const result = itineraryEngine.generate({
      destination,
      startDate,
      endDate,
      budget,
      style,
      days,
    });

    // Success — send the generated itinerary back to the frontend.
    // We spread the trip details AND include the engine's extra
    // info (summary, budgetTier) so the frontend can display them.
    res.json({
      success: true,
      trip: { destination, startDate, endDate, budget, style, days },
      summary: result.summary,
      budgetTier: result.budgetTier,
      itinerary: result.itinerary,
    });

  } catch (error) {
    // Log the full error in the terminal for debugging
    console.error('\n❌ /api/generate error:', error.message);

    res.status(500).json({
      error: error.message || 'Failed to generate itinerary. Please try again.'
    });
  }
});


// --- ROUTE 3: Save Trip ---
// POST /api/trips
//
// PHASE 4: Inserts the trip into the MySQL "trips" table.
//
// "async" is needed here because pool.execute() returns a
// Promise — it has to travel to MySQL and back, which takes time.
app.post('/api/trips', async function (req, res) {

  // Destructure everything the frontend sends us.
  // This object shape matches window.currentTrip in index.html:
  // { destination, startDate, endDate, budget, style, days,
  //   summary, budgetTier, itinerary }
  const {
    destination, startDate, endDate, budget,
    style, days, summary, budgetTier, itinerary
  } = req.body;

  // --- Validation ---
  // Make sure we have the minimum required data before touching
  // the database. itinerary must exist because the column is
  // NOT NULL in our schema.
  if (!destination || !startDate || !endDate || !budget || !style || !itinerary) {
    return res.status(400).json({
      error: 'Missing required trip data. Generate a trip before saving.'
    });
  }

  try {
    // --- THE INSERT QUERY ---
    //
    // SQL breakdown:
    //   INSERT INTO trips (...)  → which table and columns
    //   VALUES (?, ?, ?, ...)    → placeholders, one per column
    //
    // The second argument to pool.execute() is an ARRAY of values.
    // mysql2 matches them to the ? placeholders IN ORDER —
    // the 1st ? gets the 1st array value, and so on.
    //
    // JSON.stringify(itinerary):
    //   Our `itinerary` variable is a JavaScript array/object.
    //   MySQL's JSON column expects a JSON-formatted STRING.
    //   JSON.stringify() converts our JS array into that string.
    //   Example: [ {day:1} ]  →  '[{"day":1}]'
    const sql = `
      INSERT INTO trips
        (destination, start_date, end_date, budget, style, days, summary, budget_tier, itinerary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      destination,
      startDate,
      endDate,
      budget,
      style,
      days,
      summary || null,      // null if not provided — column allows NULL
      budgetTier || null,
      JSON.stringify(itinerary),
    ];

    // pool.execute() returns an array: [result, fields]
    // We only need "result" here, which contains metadata about
    // the operation — including insertId, the auto-generated ID
    // MySQL assigned to this new row.
    const [result] = await pool.execute(sql, values);

    console.log(`✅ Trip saved: "${destination}" (id: ${result.insertId})`);

    res.json({
      success: true,
      message: 'Trip saved successfully!',
      tripId: result.insertId,
    });

  } catch (error) {
    // Common causes of errors here:
    //   - MySQL server not running
    //   - Wrong credentials in .env
    //   - Database/table doesn't exist (forgot to run schema.sql)
    console.error('\n❌ /api/trips (POST) error:', error.message);

    res.status(500).json({
      error: 'Failed to save trip. Check that MySQL is running and configured correctly.'
    });
  }
});


// --- ROUTE 4: Get Saved Trips ---
// GET /api/trips
//
// PHASE 4: Fetches all saved trips from MySQL, most recent first.
app.get('/api/trips', async function (req, res) {
  try {
    // pool.query() vs pool.execute():
    //   .execute() is for queries WITH placeholders (?) — it uses
    //   "prepared statements" which MySQL can optimise if run repeatedly.
    //   .query() is for simple queries with NO placeholders.
    // This query has no user input, so .query() is fine here.
    //
    // ORDER BY created_at DESC means "newest first" —
    // DESC = descending order.
    const [rows] = await pool.query(
      'SELECT * FROM trips ORDER BY created_at DESC'
    );

    // "rows" is an array of plain JavaScript objects, one per
    // database row, with keys matching column names exactly
    // (e.g. row.start_date, row.budget_tier).
    //
    // The frontend expects camelCase keys (startDate, budgetTier)
    // to match the rest of our app's data shape. We "map" each
    // row into a new object with the keys renamed.
    //
    // We also handle the itinerary column: MySQL's mysql2 driver
    // sometimes returns JSON columns as a string and sometimes as
    // an already-parsed object, depending on the MySQL version.
    // This check handles BOTH cases safely.
    const trips = rows.map(function (row) {
      return {
        id:         row.id,
        destination: row.destination,
        startDate:  row.start_date,
        endDate:    row.end_date,
        budget:     row.budget,
        style:      row.style,
        days:       row.days,
        summary:    row.summary,
        budgetTier: row.budget_tier,
        itinerary:  typeof row.itinerary === 'string'
                      ? JSON.parse(row.itinerary)
                      : row.itinerary,
        createdAt:  row.created_at,
      };
    });

    res.json({
      success: true,
      trips: trips,
    });

  } catch (error) {
    console.error('\n❌ /api/trips (GET) error:', error.message);

    res.status(500).json({
      error: 'Failed to fetch saved trips. Check that MySQL is running and configured correctly.'
    });
  }
});


// --- ROUTE 5: Delete Trip ---
// DELETE /api/trips/:id
//
// PHASE 4: Deletes a trip from MySQL by its id.
//
// The :id part is a "URL parameter" — a variable in the URL.
// If someone calls DELETE /api/trips/42, then req.params.id = "42"
// (note: it arrives as a STRING, even though the column is INT —
// MySQL/mysql2 handles this conversion for us automatically).
app.delete('/api/trips/:id', async function (req, res) {
  const tripId = req.params.id;

  try {
    // DELETE FROM <table> WHERE <condition>
    // The ? placeholder is replaced with tripId safely (no SQL injection risk).
    const [result] = await pool.execute(
      'DELETE FROM trips WHERE id = ?',
      [tripId]
    );

    // result.affectedRows tells us how many rows the DELETE matched.
    // If it's 0, no trip with that id existed — return 404 (Not Found).
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: `No trip found with id ${tripId}` });
    }

    console.log(`🗑️  Trip deleted (id: ${tripId})`);

    res.json({
      success: true,
      message: `Trip ${tripId} deleted successfully.`,
    });

  } catch (error) {
    console.error('\n❌ /api/trips (DELETE) error:', error.message);

    res.status(500).json({
      error: 'Failed to delete trip. Check that MySQL is running and configured correctly.'
    });
  }
});


// --- 5. CATCH-ALL: 404 Handler ---
//
// This runs if NONE of the routes above matched the request.
// It must be added AFTER all your routes (order matters in Express).
app.use(function (req, res) {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});


// --- 6. START THE SERVER ---
//
// app.listen() starts the server and makes it listen for incoming
// connections on the specified PORT.
//
// The callback function runs once the server successfully starts.
app.listen(PORT, async function () {
  console.log('');
  console.log('🚀 TravelMate server is running!');
  console.log(`📍 Local:   http://localhost:${PORT}`);
  console.log(`🔍 Health:  http://localhost:${PORT}/api/health`);

  // --- PHASE 4: Test the database connection on startup ---
  //
  // pool.getConnection() borrows a connection from the pool just
  // to verify MySQL is reachable with our current .env credentials.
  // connection.release() returns it to the pool immediately —
  // we're not using it for anything else.
  //
  // Doing this check at startup means you find out IMMEDIATELY
  // if something's wrong with your database setup, rather than
  // discovering it later when a user clicks "Save Trip".
  try {
    const connection = await pool.getConnection();
    console.log('🗄️  MySQL:    connected successfully ✅');
    connection.release();
  } catch (error) {
    console.log('🗄️  MySQL:    ❌ connection failed —', error.message);
    console.log('   Check your .env file (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)');
    console.log('   and make sure MySQL is running and schema.sql has been executed.');
  }

  console.log('');
  console.log('Press Ctrl+C to stop the server.');
  console.log('');
});