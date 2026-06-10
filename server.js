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


// --- ROUTE 2: Generate Itinerary (Dummy for now) ---
// POST /api/generate
//
// The frontend sends trip details here, and we return an itinerary.
// Right now it returns dummy data — in Phase 3 we'll connect Gemini AI.
//
// Why POST and not GET?
//   GET is for "give me data" — the data lives in the URL.
//   POST is for "here's data, do something" — the data lives in the body.
//   Sending a destination, dates, budget in a URL would be messy and
//   insecure. POST puts it in the request body, which is cleaner.
app.post('/api/generate', function (req, res) {

  // req.body contains the data the frontend sent us.
  // We "destructure" it: pull out specific keys into variables.
  // This is shorthand for:
  //   const destination = req.body.destination;
  //   const startDate = req.body.startDate;  etc.
  const { destination, startDate, endDate, budget, style } = req.body;

  // --- Input Validation ---
  // Never trust data from the frontend. Always validate on the server.
  // If required fields are missing, send back a 400 error.
  //
  // HTTP Status Codes are three-digit numbers:
  //   200 = OK (success)
  //   400 = Bad Request (client sent wrong/missing data)
  //   404 = Not Found (route doesn't exist)
  //   500 = Internal Server Error (something crashed on our end)

  if (!destination || !startDate || !endDate || !budget || !style) {
    // res.status(400) sets the HTTP status code.
    // .json({ error: '...' }) sends the error message as JSON.
    return res.status(400).json({
      error: 'Missing required fields: destination, startDate, endDate, budget, style'
    });
  }

  // Calculate number of days (same logic as Phase 1 frontend)
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end - start;
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (days < 1) {
    return res.status(400).json({
      error: 'End date must be after start date'
    });
  }

  // --- Build Dummy Itinerary ---
  // Same structure as Phase 1, but now it runs on the SERVER
  // instead of the browser. In Phase 3, this gets replaced with
  // a real call to the Gemini AI API.

  const sampleActivities = {
    adventure: [
      { time: '08:00 AM', activity: 'Morning hike to a scenic viewpoint', location: 'City Outskirts' },
      { time: '12:00 PM', activity: 'Picnic lunch by the waterfall', location: 'Nature Reserve' },
      { time: '03:00 PM', activity: 'Rock climbing session with a local guide', location: 'Climbing Park' },
      { time: '07:00 PM', activity: 'Campfire dinner at the campsite', location: 'Base Camp' },
    ],
    cultural: [
      { time: '09:00 AM', activity: 'Visit the Old Town historic district', location: 'Old Town' },
      { time: '11:30 AM', activity: 'Guided tour of the National Museum', location: 'City Center' },
      { time: '01:30 PM', activity: 'Traditional lunch at a local tavern', location: 'Market Square' },
      { time: '04:00 PM', activity: 'Evening walking tour of ancient landmarks', location: 'Heritage Zone' },
    ],
    relaxation: [
      { time: '09:00 AM', activity: 'Sunrise yoga on the rooftop', location: 'Hotel Terrace' },
      { time: '11:00 AM', activity: 'Full-body spa treatment', location: 'Wellness Spa' },
      { time: '01:00 PM', activity: 'Light lunch at the garden café', location: 'Botanical Garden' },
      { time: '04:00 PM', activity: 'Sunset stroll along the beach promenade', location: 'Seafront' },
    ],
    foodie: [
      { time: '08:00 AM', activity: 'Breakfast at the famous local bakery', location: 'Old Market' },
      { time: '11:00 AM', activity: 'Street food tour with a local foodie guide', location: 'Food District' },
      { time: '02:00 PM', activity: 'Cooking class — learn regional recipes', location: 'Culinary School' },
      { time: '07:00 PM', activity: 'Fine dining tasting menu at a top-rated restaurant', location: 'Restaurant Row' },
    ],
    budget: [
      { time: '08:30 AM', activity: 'Free walking tour of the city center', location: 'Town Hall' },
      { time: '12:00 PM', activity: 'Lunch at a local market stall', location: 'Central Market' },
      { time: '02:00 PM', activity: 'Visit the free public art gallery', location: 'Arts District' },
      { time: '06:00 PM', activity: 'Sunset picnic at the public park', location: 'City Park' },
    ],
    luxury: [
      { time: '08:00 AM', activity: 'Private breakfast on the penthouse terrace', location: 'Luxury Hotel' },
      { time: '10:30 AM', activity: 'Helicopter city tour over the skyline', location: 'Helipad' },
      { time: '01:00 PM', activity: 'Michelin-star lunch reservation', location: 'Fine Dining District' },
      { time: '08:00 PM', activity: 'Private sunset yacht cruise with champagne', location: 'Marina' },
    ],
  };

  const activities = sampleActivities[style] || sampleActivities['cultural'];

  // Build the itinerary array — one object per day
  const itinerary = [];

  for (let i = 1; i <= days; i++) {
    itinerary.push({
      day: i,
      title: `Day ${i} in ${destination}`,
      activities: activities
    });
  }

  // Send the response back to the frontend as JSON.
  // We include all the original trip details plus the generated itinerary.
  // The frontend will use this data to render the UI.
  res.json({
    success: true,
    trip: {
      destination,
      startDate,
      endDate,
      budget,
      style,
      days,
    },
    itinerary: itinerary
  });
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