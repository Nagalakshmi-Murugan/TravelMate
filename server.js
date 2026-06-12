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
    message: 'TravelMate AI server is running!',
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


// --- ROUTE 3: Save Trip (Placeholder) ---
// POST /api/trips
//
// In Phase 4 this will save to MySQL.
// For now it just echoes back the data with a placeholder message.
app.post('/api/trips', function (req, res) {
  const tripData = req.body;

  // Log to the terminal so you can see what was received
  // console.log() prints to the terminal where you ran "node server.js"
  console.log('📥 Save trip request received:', tripData.destination);

  res.json({
    success: true,
    message: 'Save functionality coming in Phase 4 (MySQL)',
    received: tripData
  });
});


// --- ROUTE 4: Get Saved Trips (Placeholder) ---
// GET /api/trips
//
// In Phase 4 this will fetch from MySQL.
app.get('/api/trips', function (req, res) {
  res.json({
    success: true,
    message: 'Fetch functionality coming in Phase 4 (MySQL)',
    trips: []    // Empty array for now
  });
});


// --- ROUTE 5: Delete Trip (Placeholder) ---
// DELETE /api/trips/:id
//
// The :id part is a "URL parameter" — a variable in the URL.
// If someone calls DELETE /api/trips/42, then req.params.id = "42"
app.delete('/api/trips/:id', function (req, res) {
  const tripId = req.params.id;
  console.log('🗑️  Delete trip request for ID:', tripId);

  res.json({
    success: true,
    message: `Delete functionality coming in Phase 4. Trip ID: ${tripId}`
  });
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
app.listen(PORT, function () {
  console.log('');
  console.log('🚀 TravelMate AI server is running!');
  console.log(`📍 Local:   http://localhost:${PORT}`);
  console.log(`🔍 Health:  http://localhost:${PORT}/api/health`);
  console.log('');
  console.log('Press Ctrl+C to stop the server.');
  console.log('');
});