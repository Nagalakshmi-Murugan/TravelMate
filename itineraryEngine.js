// ============================================================
// itineraryEngine.js — Rule-Based Itinerary Generator
// ============================================================
//
// DESIGN PHILOSOPHY:
//   This file is a self-contained "service module". It has no
//   knowledge of Express, HTTP, or the browser. It takes in
//   trip parameters, applies logic, and returns data.
//   That makes it easy to test, explain, and maintain.
//
// HOW IT WORKS (the algorithm in plain English):
//   1. Receive: destination, budget, style, number of days
//   2. Classify the budget into a tier: low / medium / high
//   3. Look up the activity "pool" for that style
//   4. For each day, pick 4 activities (morning → evening)
//      using a shuffle so no two trips feel identical
//   5. Attach real cost estimates and tips based on budget tier
//   6. Return a structured array of day objects
//
// DATA STRUCTURE OVERVIEW:
//
//   ACTIVITY_POOLS         — the master dataset
//     └── by style         (adventure, cultural, foodie, relaxation)
//         └── by budget    (low, medium, high)
//             └── array of activity objects
//
//   Each activity object:
//   {
//     time:     "09:00 AM",
//     activity: "Visit the old city walls",
//     location: "{destination} Historic District",   ← placeholder
//     cost:     "$0 – Free",
//     tip:      "Go early to beat the crowds"
//   }
//
// NOTE ON {destination}:
//   We use the string "{destination}" as a placeholder inside
//   location names. Before returning to the frontend, we call
//   .replace('{destination}', actualDestination) on every
//   location string. This makes activities feel personalised
//   without needing a separate dataset per city.
// ============================================================


// ── SECTION 1: ACTIVITY POOLS ────────────────────────────────
//
// This is the heart of the engine — a nested object containing
// every possible activity, organised by travel style and then
// by budget tier.
//
// WHY NESTED BY BUDGET?
//   A "foodie" trip on $500 looks very different from one on
//   $5000. Low budget = street food & markets. High budget =
//   tasting menus & cooking schools. Same style, different tier.
//
// WHY SO MANY ACTIVITIES PER TIER?
//   We randomly pick from this pool each time, so having 8–10
//   options per slot means repeat visits to the same destination
//   will feel different. The shuffle function ensures variety.

const ACTIVITY_POOLS = {

  // ── ADVENTURE ──────────────────────────────────────────────
  adventure: {
    low: [
      { time: '07:00 AM', activity: 'Sunrise hike on the most popular local trail', location: '{destination} National Park', cost: '$0 – Free', tip: 'Bring at least 2 litres of water and wear sunscreen' },
      { time: '09:00 AM', activity: 'Explore hidden waterfalls on a self-guided walk', location: '{destination} Nature Reserve', cost: '$0 – Free', tip: 'Download an offline map before you leave' },
      { time: '11:00 AM', activity: 'Swim at a local beach or river spot known to residents', location: '{destination} Riverside', cost: '$0 – Free', tip: 'Ask locals for directions — it\'s usually not on maps' },
      { time: '02:00 PM', activity: 'Rent a bicycle and explore backroads and countryside', location: '{destination} Outskirts', cost: '$5 – $15 bike rental', tip: 'Morning rentals are often cheaper than afternoon' },
      { time: '04:00 PM', activity: 'Visit a public viewpoint and watch the sunset', location: '{destination} Hilltop', cost: '$0 – Free', tip: 'Arrive 30 mins before sunset to get a good spot' },
      { time: '06:30 PM', activity: 'Street food dinner at the local night market', location: '{destination} Night Market', cost: '$3 – $8', tip: 'Look for stalls with the longest local queue' },
      { time: '08:00 AM', activity: 'Join a free community group hike', location: '{destination} Trail Head', cost: '$0 – Free', tip: 'Search "free hike {destination}" on Meetup.com' },
      { time: '03:00 PM', activity: 'Rock scrambling and bouldering at local crags', location: '{destination} Boulder Fields', cost: '$0 – Free', tip: 'Wear closed-toe shoes with good grip' },
    ],
    medium: [
      { time: '07:30 AM', activity: 'Guided kayaking tour along the coastline or river', location: '{destination} Harbour', cost: '$35 – $55', tip: 'Book the morning slot — afternoon winds can be strong' },
      { time: '10:00 AM', activity: 'Half-day zip-lining and canopy tour', location: '{destination} Adventure Park', cost: '$45 – $70', tip: 'Book online in advance for a 15% discount' },
      { time: '01:00 PM', activity: 'Guided snorkelling trip to a nearby reef', location: '{destination} Marine Reserve', cost: '$40 – $60', tip: 'Bring your own mask for a better fit' },
      { time: '03:30 PM', activity: 'Mountain biking on intermediate trails with equipment rental', location: '{destination} Bike Park', cost: '$30 – $50', tip: 'Full-suspension bikes are worth the extra $10' },
      { time: '06:00 PM', activity: 'Casual dinner at a popular local sports bar', location: '{destination} City Centre', cost: '$15 – $25', tip: 'Great spot to meet other travellers' },
      { time: '08:30 AM', activity: 'Stand-up paddleboarding lesson on calm morning water', location: '{destination} Lake or Bay', cost: '$30 – $45', tip: 'Kneel on the board first — it\'s easier to balance' },
      { time: '02:00 PM', activity: 'Via ferrata (iron road) climbing route with harness hire', location: '{destination} Cliffs', cost: '$50 – $75', tip: 'No climbing experience needed — just fitness' },
    ],
    high: [
      { time: '06:30 AM', activity: 'Private sunrise hot air balloon flight over the landscape', location: '{destination} Launch Site', cost: '$180 – $300', tip: 'Champagne breakfast is usually included — confirm when booking' },
      { time: '09:00 AM', activity: 'Full-day private guided white-water rafting expedition', location: '{destination} River Canyon', cost: '$120 – $200', tip: 'Grade 3–4 rapids — thrilling but accessible for beginners' },
      { time: '01:00 PM', activity: 'Luxury picnic lunch prepared by a local chef, delivered to a viewpoint', location: '{destination} Summit Viewpoint', cost: '$60 – $100', tip: 'Pre-order 24 hours in advance' },
      { time: '03:30 PM', activity: 'Scuba diving session with private instructor and full equipment', location: '{destination} Dive Site', cost: '$100 – $160', tip: 'PADI Open Water certification can be done in 3 days here' },
      { time: '07:00 PM', activity: 'Fine dining dinner with panoramic views at the city\'s top restaurant', location: '{destination} Rooftop Restaurant', cost: '$80 – $140', tip: 'Reserve a window table at least 3 days ahead' },
      { time: '08:00 AM', activity: 'Private helicopter sightseeing tour over the region', location: '{destination} Helipad', cost: '$200 – $400', tip: 'Early morning has the clearest air for photos' },
    ],
  },

  // ── CULTURAL ───────────────────────────────────────────────
  cultural: {
    low: [
      { time: '09:00 AM', activity: 'Self-guided walking tour of the old town and historic quarter', location: '{destination} Old Town', cost: '$0 – Free', tip: 'Download the Rick Steves or GPSmyCity app for a free audio guide' },
      { time: '11:00 AM', activity: 'Visit the main national or city history museum', location: '{destination} National Museum', cost: '$0 – $5', tip: 'Many museums are free on the first Sunday of the month' },
      { time: '01:00 PM', activity: 'Lunch at the central covered market — eat where locals eat', location: '{destination} Central Market', cost: '$4 – $8', tip: 'Avoid stalls facing the main entrance — the best food is deeper inside' },
      { time: '03:00 PM', activity: 'Explore a free public art gallery or street art neighbourhood', location: '{destination} Arts District', cost: '$0 – Free', tip: 'Street art tours are often free on weekends' },
      { time: '05:00 PM', activity: 'Sunset at the city\'s most iconic free viewpoint or square', location: '{destination} Main Square', cost: '$0 – Free', tip: 'Bring a picnic and watch locals go about their evening' },
      { time: '07:00 PM', activity: 'Dinner at a no-frills traditional restaurant popular with locals', location: '{destination} Local Quarter', cost: '$6 – $12', tip: 'Look for handwritten menus — a sign of authentic home cooking' },
      { time: '10:00 AM', activity: 'Visit a local flea market or antique fair', location: '{destination} Weekend Market', cost: '$0 – Free', tip: 'Great place to find unique souvenirs at honest prices' },
      { time: '02:00 PM', activity: 'Attend a free guided tour of a historic cathedral or temple', location: '{destination} Main Cathedral', cost: '$0 – Free', tip: 'Dress modestly — shoulders and knees covered' },
    ],
    medium: [
      { time: '09:30 AM', activity: 'Guided small-group tour of the top heritage landmarks', location: '{destination} Heritage Zone', cost: '$25 – $40', tip: 'Groups of 8 or fewer give the guide more time per person' },
      { time: '12:00 PM', activity: 'Traditional lunch experience at a well-reviewed local restaurant', location: '{destination} Restaurant Row', cost: '$20 – $35', tip: 'Order the "menu del día" (set lunch) — best value for money' },
      { time: '02:30 PM', activity: 'Visit the finest art museum in the city with audio guide', location: '{destination} Fine Arts Museum', cost: '$15 – $25', tip: 'Buy tickets online to skip the queue' },
      { time: '05:00 PM', activity: 'Attend a traditional music or dance performance', location: '{destination} Cultural Centre', cost: '$20 – $45', tip: 'Early evening shows are usually less crowded than late night' },
      { time: '07:30 PM', activity: 'Dinner at a restaurant specialising in regional cuisine', location: '{destination} Old Quarter', cost: '$30 – $55', tip: 'Ask the waiter what dish the chef is most proud of' },
      { time: '10:00 AM', activity: 'Guided tour of the royal palace or government buildings', location: '{destination} Palace District', cost: '$18 – $30', tip: 'Photography may be restricted inside — check before you go' },
      { time: '03:30 PM', activity: 'Pottery or traditional craft workshop with a local artisan', location: '{destination} Craft District', cost: '$30 – $50', tip: 'You get to keep what you make — great souvenir' },
    ],
    high: [
      { time: '09:00 AM', activity: 'Private guided tour of the city\'s most exclusive cultural sites', location: '{destination} Historic Centre', cost: '$120 – $200', tip: 'Private guides can access areas closed to the public' },
      { time: '12:30 PM', activity: 'Lunch at a Michelin-recommended restaurant focusing on local ingredients', location: '{destination} Gourmet District', cost: '$70 – $130', tip: 'Tasting menus at lunch are often 40% cheaper than dinner' },
      { time: '03:00 PM', activity: 'Exclusive behind-the-scenes access tour of a major museum', location: '{destination} National Gallery', cost: '$80 – $150', tip: 'Usually includes areas not open to regular visitors' },
      { time: '06:00 PM', activity: 'Private flamenco, opera, or cultural show in an intimate venue', location: '{destination} Private Theatre', cost: '$100 – $180', tip: 'Front-row seating included — tip the performers' },
      { time: '08:30 PM', activity: 'Multi-course tasting dinner with wine pairing at the city\'s finest table', location: '{destination} Signature Restaurant', cost: '$150 – $280', tip: 'Sommelier-led wine pairing adds about $60 — worth every penny' },
      { time: '10:30 AM', activity: 'Private calligraphy or traditional art lesson with a master craftsperson', location: '{destination} Artist Studio', cost: '$90 – $140', tip: 'One-on-one sessions produce much better results than group classes' },
    ],
  },

  // ── FOODIE ─────────────────────────────────────────────────
  foodie: {
    low: [
      { time: '08:00 AM', activity: 'Breakfast at the most beloved local bakery — queue is worth it', location: '{destination} Old Market Bakery', cost: '$3 – $6', tip: 'Arrive before 8:30 AM or the best pastries sell out' },
      { time: '10:30 AM', activity: 'Street food walking tour — self-guided with Google Maps', location: '{destination} Street Food Lane', cost: '$5 – $12', tip: 'Follow the smoke — grills mean fresh, hot food' },
      { time: '01:00 PM', activity: 'Lunch at the most popular stall in the wet market', location: '{destination} Wet Market', cost: '$4 – $8', tip: 'Point at what others are eating — works better than menus' },
      { time: '03:30 PM', activity: 'Visit a local spice market and taste free samples', location: '{destination} Spice Bazaar', cost: '$0 – Free samples', tip: 'Bring a small bag — you\'ll want to buy some to take home' },
      { time: '06:00 PM', activity: 'Dinner at a family-run hole-in-the-wall restaurant', location: '{destination} Residential Quarter', cost: '$5 – $10', tip: 'No English menu? Use Google Translate camera mode' },
      { time: '08:30 PM', activity: 'Dessert and local snacks at the night market', location: '{destination} Night Market', cost: '$3 – $7', tip: 'Try one thing from at least five different stalls' },
      { time: '09:00 AM', activity: 'Visit the Sunday farmers\' market and taste seasonal produce', location: '{destination} Farmers\' Market', cost: '$0 – $5', tip: 'Chat to the farmers — they\'re usually happy to explain their produce' },
    ],
    medium: [
      { time: '08:30 AM', activity: 'Brunch at a highly-rated café known for regional breakfast dishes', location: '{destination} Café District', cost: '$12 – $22', tip: 'Make a reservation — popular brunch spots fill up fast' },
      { time: '11:00 AM', activity: 'Guided food tour of the best local markets and hidden eateries', location: '{destination} Food District', cost: '$35 – $55', tip: 'Eat a light breakfast — you\'ll be tasting a lot' },
      { time: '02:00 PM', activity: 'Half-day local cooking class — learn 3 signature regional dishes', location: '{destination} Culinary School', cost: '$45 – $70', tip: 'Ask for the recipe card to take home' },
      { time: '05:30 PM', activity: 'Wine or craft beer tasting at a local producer', location: '{destination} Winery or Brewery', cost: '$20 – $35', tip: 'Tastings usually include 5–6 pours with snacks' },
      { time: '07:30 PM', activity: 'Dinner at a chef-driven restaurant showcasing local produce', location: '{destination} Restaurant Quarter', cost: '$40 – $65', tip: 'Sit at the bar if you can — you\'ll see the kitchen in action' },
      { time: '09:30 AM', activity: 'Artisan coffee tasting and barista workshop', location: '{destination} Specialty Coffee Roastery', cost: '$18 – $28', tip: 'Single-origin pour-overs will change how you think about coffee' },
      { time: '04:00 PM', activity: 'Cheese and charcuterie tasting at a local deli', location: '{destination} Gourmet Deli', cost: '$20 – $30', tip: 'Ask for pairings — the staff love explaining combinations' },
    ],
    high: [
      { time: '08:00 AM', activity: 'Private sunrise visit to the wholesale fish or produce market with a chef', location: '{destination} Central Wholesale Market', cost: '$80 – $130', tip: 'The chef buys ingredients for your lunch — farm to table at its finest' },
      { time: '11:00 AM', activity: 'Private hands-on masterclass with a Michelin-starred chef', location: '{destination} Culinary Institute', cost: '$150 – $250', tip: 'Class size is usually 4–6 people — very personal experience' },
      { time: '02:00 PM', activity: 'Exclusive multi-course tasting lunch at a celebrated restaurant', location: '{destination} Fine Dining Quarter', cost: '$100 – $180', tip: 'Inform them of dietary restrictions when booking — they\'ll craft alternatives' },
      { time: '05:00 PM', activity: 'Private guided tour of a family-owned vineyard or distillery with pairing', location: '{destination} Wine Region', cost: '$90 – $140', tip: 'Ask about the harvest season — visiting then is magical' },
      { time: '08:00 PM', activity: 'Omakase or chef\'s tasting menu dinner — you eat whatever they create', location: '{destination} Signature Restaurant', cost: '$160 – $300', tip: 'Trust the chef completely — tell them your only limits upfront' },
      { time: '10:00 AM', activity: 'Truffle hunting or foraging excursion with a local expert', location: '{destination} Countryside', cost: '$120 – $200', tip: 'What you find gets cooked into your lunch — unforgettable' },
    ],
  },

  // ── RELAXATION ─────────────────────────────────────────────
  relaxation: {
    low: [
      { time: '08:00 AM', activity: 'Gentle sunrise yoga session on the beach or in a public park', location: '{destination} Beachfront or City Park', cost: '$0 – $5', tip: 'Many cities have free outdoor yoga classes on weekends' },
      { time: '10:00 AM', activity: 'Slow morning walk through the botanical gardens', location: '{destination} Botanical Gardens', cost: '$0 – $3', tip: 'Go on weekdays — peaceful and half the crowds' },
      { time: '12:30 PM', activity: 'Picnic lunch with fresh produce from the local market', location: '{destination} Riverside Park', cost: '$5 – $10', tip: 'Buy a small blanket at the market — keeps for your whole trip' },
      { time: '03:00 PM', activity: 'Hammock time and reading at a quiet, shaded spot', location: '{destination} Public Garden', cost: '$0 – Free', tip: 'The perfect antidote to over-touristed destinations' },
      { time: '05:00 PM', activity: 'Gentle sunset swim at a calm, uncrowded beach', location: '{destination} Quiet Beach', cost: '$0 – Free', tip: 'Ask locals which beach is least busy — always worth it' },
      { time: '07:30 PM', activity: 'Dinner at a quiet, candle-lit local restaurant', location: '{destination} Quiet Lane', cost: '$8 – $15', tip: 'Slow travel means lingering over your meal — no rush' },
      { time: '09:00 AM', activity: 'Visit a free meditation centre or peaceful temple', location: '{destination} Temple District', cost: '$0 – Free', tip: 'Remove shoes before entering and observe silence inside' },
    ],
    medium: [
      { time: '08:30 AM', activity: 'Morning yoga or pilates class at a well-rated local studio', location: '{destination} Wellness Studio', cost: '$15 – $28', tip: 'Drop-in rates are usually available — no need to commit to a package' },
      { time: '10:30 AM', activity: '90-minute traditional massage at a highly-rated local spa', location: '{destination} Day Spa', cost: '$40 – $70', tip: 'Traditional local massage (e.g. Thai, Balinese) is better than "hotel spa" style' },
      { time: '01:00 PM', activity: 'Long, leisurely lunch at a beautiful garden or rooftop restaurant', location: '{destination} Garden Restaurant', cost: '$25 – $40', tip: 'Order slowly — treat it as a 2-hour experience not a meal' },
      { time: '04:00 PM', activity: 'Floatation tank or sound bath session', location: '{destination} Wellness Centre', cost: '$35 – $60', tip: 'Your first float feels strange for 10 minutes — then it\'s transformative' },
      { time: '07:00 PM', activity: 'Quiet sunset dinner at a restaurant with a view', location: '{destination} Viewpoint Restaurant', cost: '$35 – $55', tip: 'Book the window table in advance — it makes a huge difference' },
      { time: '09:30 AM', activity: 'Private guided meditation walk through nature', location: '{destination} Nature Trail', cost: '$25 – $40', tip: 'Leave your phone in the hotel — commit to the experience' },
    ],
    high: [
      { time: '07:30 AM', activity: 'Private sunrise yoga and meditation session with a master teacher', location: '{destination} Clifftop or Rooftop', cost: '$80 – $140', tip: 'The private setting makes all the difference — no distractions' },
      { time: '10:00 AM', activity: 'Full-morning luxury spa experience: sauna, steam, hydrotherapy, and massage', location: '{destination} Five-Star Spa', cost: '$150 – $260', tip: 'Arrive early to use the thermal facilities before your treatment' },
      { time: '01:00 PM', activity: 'Private chef-prepared healthy lunch at your villa or suite', location: '{destination} Private Accommodation', cost: '$80 – $130', tip: 'Specify dietary preferences when you book — they\'re happy to accommodate' },
      { time: '04:00 PM', activity: 'Private boat charter to a secluded bay for swimming and snorkelling', location: '{destination} Marina', cost: '$200 – $350', tip: 'Split the cost with travel companions — it becomes very affordable' },
      { time: '07:30 PM', activity: 'Private in-suite or terrace dinner prepared by a personal chef', location: '{destination} Private Villa or Suite', cost: '$180 – $300', tip: 'Ask for the chef to explain each course — it\'s part of the experience' },
      { time: '09:00 AM', activity: 'Ayurvedic consultation and personalised treatment plan at a retreat', location: '{destination} Wellness Retreat', cost: '$120 – $200', tip: 'Book the full day package — individual treatments add up quickly' },
    ],
  },
};


// ── SECTION 2: BUDGET CLASSIFIER ─────────────────────────────
//
// WHAT IS THIS?
//   The frontend sends a raw number like "1500".
//   We need to convert that into a tier: 'low', 'medium', or 'high'.
//   This function does that conversion.
//
// WHY PER-DAY CALCULATION?
//   A $1500 budget for 2 days is very different from $1500 for 14 days.
//   We divide total budget by number of days to get the DAILY budget,
//   then classify that. This makes the tiers meaningful regardless of
//   trip length.
//
// THRESHOLDS (feel free to adjust these):
//   Under $100/day  → low    (backpacker)
//   $100–$299/day   → medium (mid-range traveller)
//   $300+/day       → high   (luxury traveller)

function classifyBudget(totalBudget, days) {
  // Parse to a number in case it came in as a string from the form
  const budget = parseFloat(totalBudget);
  const dailyBudget = budget / days;

  if (dailyBudget < 100) return 'low';
  if (dailyBudget < 300) return 'medium';
  return 'high';
}


// ── SECTION 3: ARRAY SHUFFLER ─────────────────────────────────
//
// WHAT IS THIS?
//   A function that randomly reorders an array.
//   We use it so every generated itinerary feels unique —
//   even for the same destination and style.
//
// THE ALGORITHM: Fisher-Yates Shuffle
//   This is the standard, statistically correct way to shuffle.
//   It's used everywhere from card games to Spotify's shuffle.
//
// HOW IT WORKS (step by step):
//   Say we have [A, B, C, D].
//   - i=3: pick a random index j between 0 and 3, swap arr[3] with arr[j]
//   - i=2: pick a random index j between 0 and 2, swap arr[2] with arr[j]
//   - i=1: pick a random index j between 0 and 1, swap arr[1] with arr[j]
//   Result: a fully random ordering with equal probability for all orders.
//
// WHY NOT arr.sort(() => Math.random() - 0.5)?
//   That's a common beginner approach but it's NOT statistically uniform.
//   Some orderings are more likely than others. Fisher-Yates is correct.
//
// NOTE: We work on a COPY ([...array]) so we don't modify the original
// ACTIVITY_POOLS data — that would corrupt future calls.

function shuffleArray(array) {
  const arr = [...array]; // Spread operator: makes a shallow copy

  for (let i = arr.length - 1; i > 0; i--) {
    // Math.random() returns a float between 0 (inclusive) and 1 (exclusive)
    // Multiplying by (i + 1) and flooring gives us an integer from 0 to i
    const j = Math.floor(Math.random() * (i + 1));

    // Destructuring swap: swap two values without a temp variable
    // Before ES6 you needed: var temp = arr[i]; arr[i] = arr[j]; arr[j] = temp;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}


// ── SECTION 4: ACTIVITY PICKER ────────────────────────────────
//
// WHAT IS THIS?
//   Given a style and budget tier, this function returns exactly
//   4 activities for one day — one per time slot.
//
// HOW VARIETY IS ACHIEVED:
//   1. We shuffle the entire pool for this style+budget
//   2. We slice the first 4 from the shuffled pool
//   3. We then SORT those 4 by time so the day flows logically
//      (morning → midday → afternoon → evening)
//
// WHY SORT AFTER SHUFFLE?
//   Shuffling gives us variety in WHICH activities we pick.
//   Sorting gives us a sensible time ORDER for the day.
//   These are two separate concerns — we do both.
//
// TIME SORT LOGIC:
//   We parse the time strings ("07:00 AM", "03:00 PM") by converting
//   them to 24-hour numeric values so they sort correctly.
//   "07:00 AM" → 7
//   "03:00 PM" → 15   (3 + 12 for PM)
//   Then we sort ascending so morning comes first.

function pickActivitiesForDay(style, budgetTier, destination) {
  const pool = ACTIVITY_POOLS[style]?.[budgetTier];

  // Defensive check: if somehow an invalid style/tier was passed, return empty
  if (!pool || pool.length === 0) {
    return [];
  }

  // Shuffle the pool and take the first 4
  // If pool has fewer than 4, take all of them (edge case safety)
  const shuffled = shuffleArray(pool);
  const selected = shuffled.slice(0, Math.min(4, shuffled.length));

  // Sort the selected activities by time of day
  selected.sort(function (a, b) {
    return parseTimeToHour(a.time) - parseTimeToHour(b.time);
  });

  // Replace the {destination} placeholder in every location string
  // .map() returns a new array — we never mutate the original pool data
  return selected.map(function (activity) {
    return {
      ...activity, // spread: copy all properties from the original object
      location: activity.location.replace('{destination}', destination),
    };
  });
}

// Helper: convert "03:30 PM" → 15.5 (hour as a decimal number)
// Used only internally by pickActivitiesForDay for sorting
function parseTimeToHour(timeStr) {
  // timeStr example: "03:30 PM"
  const [timePart, period] = timeStr.split(' '); // ["03:30", "PM"]
  const [hours, minutes]   = timePart.split(':').map(Number); // [3, 30]

  let hour24 = hours;
  if (period === 'PM' && hours !== 12) hour24 += 12; // 3 PM → 15
  if (period === 'AM' && hours === 12) hour24 = 0;   // 12 AM → 0 (midnight)

  return hour24 + minutes / 60; // 15 + 30/60 = 15.5
}


// ── SECTION 5: TRIP SUMMARY BUILDER ──────────────────────────
//
// This adds a human-readable summary line to the response.
// It's a small touch that makes the output feel polished.
// In an interview you'd call this "enriching the response".

function buildTripSummary(destination, days, style, budgetTier, totalBudget) {
  const styleLabels = {
    adventure:   'Adventure & Outdoors',
    cultural:    'Cultural & Historical',
    foodie:      'Food & Culinary',
    relaxation:  'Relaxation & Wellness',
  };

  const budgetLabels = {
    low:    'Budget-Friendly',
    medium: 'Mid-Range',
    high:   'Luxury',
  };

  return `${days}-day ${styleLabels[style] || style} trip to ${destination} `
       + `(${budgetLabels[budgetTier]} — $${totalBudget} total)`;
}


// ── SECTION 6: MAIN EXPORTED FUNCTION ────────────────────────
//
// This is the ONE function that server.js calls.
// Everything above is internal — only this is exported.
//
// PARAMETERS (all come from req.body in server.js):
//   tripDetails.destination — string, e.g. "Paris"
//   tripDetails.startDate   — string, e.g. "2026-08-01"
//   tripDetails.endDate     — string, e.g. "2026-08-06"
//   tripDetails.budget      — number or string, e.g. 1500
//   tripDetails.style       — string, e.g. "cultural"
//   tripDetails.days        — number, e.g. 5
//
// RETURNS:
//   An array of day objects, each shaped like:
//   {
//     day: 1,
//     title: "Day 1 — Paris",
//     activities: [ { time, activity, location, cost, tip }, ... ]
//   }

function generate(tripDetails) {
  const { destination, startDate, budget, style, days } = tripDetails;

  // Step 1: Work out which budget tier applies
  const budgetTier = classifyBudget(budget, days);

  // Step 2: Normalise the style to lowercase so "Cultural" and "cultural"
  // both work (defensive coding — don't trust input casing)
  const normalisedStyle = (style || 'cultural').toLowerCase();

  // Step 3: Build one day object per day of the trip
  const itinerary = [];

  for (let i = 1; i <= days; i++) {
    // Calculate the actual calendar date for this day
    // We add (i - 1) days to the start date
    const dayDate = new Date(startDate);
    dayDate.setDate(dayDate.getDate() + (i - 1));

    // Format as "Monday, 1 August 2026"
    const formattedDate = dayDate.toLocaleDateString('en-GB', {
      weekday: 'long',
      day:     'numeric',
      month:   'long',
      year:    'numeric',
    });

    // Pick 4 activities for this day
    const activities = pickActivitiesForDay(normalisedStyle, budgetTier, destination);

    itinerary.push({
      day:        i,
      date:       formattedDate,
      title:      `Day ${i} — ${destination}`,
      activities: activities,
    });
  }

  // Step 4: Build the final response object
  return {
    summary:    buildTripSummary(destination, days, normalisedStyle, budgetTier, budget),
    budgetTier: budgetTier,
    itinerary:  itinerary,
  };
}


// ── EXPORT ────────────────────────────────────────────────────
//
// We only export `generate` — the single public interface.
// All other functions (shuffleArray, classifyBudget, etc.) are
// private helpers. This is called "encapsulation" — hiding
// internal implementation details from the outside world.

module.exports = { generate };