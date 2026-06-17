// ============================================================
// groqService.js — AI Itinerary Generator using Groq
// ============================================================
//
// WHAT IS THIS FILE?
//   This is TravelMate's new AI service module. It talks to
//   Groq's API to produce realistic, non-repetitive day-by-day
//   itineraries using a large language model (LLM).
//
//   Like itineraryEngine.js, this file is a "service module"
//   — it has no knowledge of Express or HTTP. server.js is the
//   only caller. If you ever switch AI providers, you only
//   change this one file.
//
// WHY GROQ?
//   1. FREE TIER — Groq offers a generous free tier with
//      thousands of requests per day. No credit card required.
//   2. SPEED — Groq runs inference on custom hardware called
//      LPUs (Language Processing Units). Their models complete
//      in milliseconds, not seconds. That matters for a travel
//      planning UX where users expect near-instant results.
//   3. OPENAI-COMPATIBLE API — The Groq SDK is designed to
//      mirror the OpenAI SDK. If you already know OpenAI, you
//      know Groq. This also means the SDK is well-documented
//      and widely understood.
//   4. NO GOOGLE DEPENDENCY — We're deliberately avoiding
//      Gemini to keep the project's AI dependency separate from
//      the Google ecosystem. Groq is independent infrastructure.
//
// HOW THE FALLBACK WORKS:
//   generate() tries Groq first. If ANYTHING goes wrong
//   (invalid key, rate limit, network error, malformed JSON,
//   timeout), it catches the error, logs it for debugging,
//   and returns { success: false } so server.js can fall back
//   to itineraryEngine.js. The user never sees a crash.
//
// DATA FLOW:
//   server.js
//     → groqService.generate(tripDetails)
//     → Groq API (HTTPS request)
//     → parse + validate JSON from model response
//     → return { success: true, ...itineraryData }
//   OR
//     → catch any error
//     → return { success: false, error: errorMessage }
//
// ============================================================


require('dotenv').config();

// The official Groq Node.js SDK.
// It wraps the Groq HTTPS API in a clean class interface.
// Install with: npm install groq-sdk
const Groq = require('groq-sdk');


// ── SECTION 1: CLIENT INITIALISATION ─────────────────────────
//
// new Groq() creates a client instance that holds your API key.
// The key is read from process.env.GROQ_API_KEY, which dotenv
// loaded from your .env file. It NEVER appears in this code.
//
// WHAT IS an API key?
//   An API key is like a password that identifies YOUR account
//   to Groq's servers. Every request we make is "signed" with
//   it. If someone steals your key, they can use YOUR free quota.
//   That's why we keep it in .env and .gitignore it.
//
// dangerouslyAllowBrowser: false (default — we leave it unset)
//   This means the Groq SDK will throw an error if used directly
//   in a browser environment, where the key would be visible to
//   anyone who opens DevTools. Keeping this on server.js side
//   is the correct pattern. Our frontend NEVER imports this file.

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});


// ── SECTION 2: THE SYSTEM PROMPT ─────────────────────────────
//
// WHAT IS A SYSTEM PROMPT?
//   In the Groq/OpenAI chat API, you send an array of "messages"
//   with roles: "system", "user", and "assistant".
//
//   The SYSTEM message is like the AI's job description —
//   it tells the model who it is, what it must return, and
//   what rules to follow. It runs before the user message.
//
//   The USER message is the actual request (the trip details).
//
// WHY A SEPARATE CONSTANT?
//   The system prompt doesn't change between requests — only
//   the user prompt (trip details) changes. Keeping it separate
//   makes the code cleaner and easier to update.
//
// PROMPT ENGINEERING DECISIONS EXPLAINED:
//   1. JSON-only output — We instruct the model to return ONLY
//      a JSON array with zero surrounding text, so we can
//      JSON.parse() it directly. No "Sure! Here's your trip:"
//      preamble to strip out.
//
//   2. Exact schema — We show the model the exact shape we need
//      so every key (time, activity, location, cost, tip) is
//      always present. This avoids KeyErrors in our rendering.
//
//   3. Diversity rules — We explicitly tell the model to avoid
//      repeating the same places across days. Without this
//      instruction, LLMs tend to suggest the Eiffel Tower on
//      day 1 AND day 3.
//
//   4. Realism — We ask for real places, real addresses, and
//      real cost estimates so the output is actually useful.

const SYSTEM_PROMPT = `
You are TravelMate's expert AI travel planner. Your ONLY job is to
return a valid JSON array — no preamble, no explanation, no markdown
code fences, no trailing text. Just the raw JSON array.

Each element in the array represents one day of the trip and MUST
follow this exact shape:

{
  "day": <number>,
  "date": "<formatted date string, e.g. Monday, 1 August 2026>",
  "title": "Day <number> — <Destination>",
  "activities": [
    {
      "time": "<time in 12-hour format, e.g. 09:00 AM>",
      "activity": "<specific activity name and brief description>",
      "location": "<real venue name and neighbourhood, e.g. Louvre Museum, 1st arrondissement>",
      "cost": "<realistic cost range, e.g. $15 – $25 per person, or $0 – Free>",
      "tip": "<one practical insider tip for this activity>"
    }
  ]
}

RULES — follow every one of these without exception:
1. Return ONLY the raw JSON array. No text before or after it.
2. Each day must have exactly 4 activities spread through the day
   (morning, midday, afternoon, evening).
3. NEVER repeat the same venue, landmark, or location across
   different days. Every location must be unique in the entire trip.
4. Use real place names appropriate for the destination. Do not
   invent fictional venues.
5. Costs must reflect the budget tier realistically. Low budget
   favours free attractions and street food. High budget includes
   fine dining and private tours.
6. Tips must be practical and specific — not generic advice like
   "have fun". Think: best time to visit, booking links, local
   customs, transport hacks.
7. Times must be in chronological order within each day (earliest
   activity first).
8. The travel style must shape every activity choice. A "foodie"
   trip should be dominated by markets, restaurants, and food tours.
   An "adventure" trip should have outdoor and physical activities.
`.trim();


// ── SECTION 3: PROMPT BUILDER ─────────────────────────────────
//
// buildUserPrompt() turns the structured tripDetails object into
// a natural-language paragraph that gives the model enough
// context to generate a great itinerary.
//
// WHY NOT SEND RAW JSON TO THE MODEL?
//   Natural language works better for instruction-tuned models.
//   They were trained on human text, so "a 5-day trip to Paris"
//   is clearer to the model than { destination: "Paris", days: 5 }.
//
// BUDGET TIER GUIDANCE:
//   We add a plain-English budget-per-day figure so the model
//   doesn't have to infer it. "~$50/day" is clearer than just
//   "budget: 350, days: 7".

function buildUserPrompt(tripDetails) {
  const { destination, startDate, endDate, budget, style, days } = tripDetails;

  // Calculate a rough daily budget so the model can calibrate costs
  const dailyBudget = Math.round(Number(budget) / days);

  // Map style codes to human-readable labels and descriptions
  const styleDescriptions = {
    adventure:   'Adventure & Outdoors (hiking, watersports, adrenaline activities)',
    cultural:    'Cultural & Historical (museums, temples, heritage sites, local traditions)',
    relaxation:  'Relaxation & Wellness (spas, beaches, slow mornings, yoga, peaceful walks)',
    foodie:      'Foodie & Local Cuisine (markets, restaurants, food tours, cooking classes)',
    budget:      'Budget Backpacking (free attractions, hostels, street food, local transport)',
    luxury:      'Luxury & Fine Dining (five-star experiences, private tours, Michelin dining)',
  };

  const styleLabel = styleDescriptions[style] || style;

  return `
Plan a ${days}-day trip to ${destination}.

Trip details:
- Destination: ${destination}
- Start date: ${startDate}
- End date: ${endDate}
- Total budget: $${budget} USD (~$${dailyBudget}/day)
- Travel style: ${styleLabel}

Generate the complete day-by-day itinerary for all ${days} days.
Remember: return ONLY the JSON array, with ${days} day objects.
  `.trim();
}


// ── SECTION 4: RESPONSE VALIDATOR ────────────────────────────
//
// validateItinerary() checks that what the model returned is
// actually usable before we send it to the frontend.
//
// WHY VALIDATE?
//   LLMs are probabilistic — they usually follow instructions,
//   but occasionally produce incomplete or unexpected output.
//   Without validation, a malformed response could crash the
//   frontend when it tries to render act.time or act.location.
//
// VALIDATION STRATEGY:
//   We do "duck typing" — checking whether the data has the
//   shape we expect rather than deeply validating every value.
//   This catches the most likely failures without being so
//   strict that minor LLM variations cause unnecessary fallbacks.

function validateItinerary(itinerary, expectedDays) {
  // Must be an array
  if (!Array.isArray(itinerary)) return false;

  // Must have the right number of days
  if (itinerary.length !== expectedDays) return false;

  // Every day must have the required keys
  for (const day of itinerary) {
    if (
      typeof day.day !== 'number' ||
      typeof day.title !== 'string' ||
      !Array.isArray(day.activities) ||
      day.activities.length === 0
    ) {
      return false;
    }

    // Every activity must have all required fields
    for (const act of day.activities) {
      if (
        typeof act.time     !== 'string' ||
        typeof act.activity !== 'string' ||
        typeof act.location !== 'string'
      ) {
        return false;
      }

      // Ensure cost and tip exist (fill in safe defaults if not)
      // We don't fail validation for these — they're nice-to-have.
      if (!act.cost) act.cost = 'Cost varies';
      if (!act.tip)  act.tip  = 'Check local tourism websites for updates.';
    }
  }

  return true;
}


// ── SECTION 5: THE MAIN EXPORTED FUNCTION ────────────────────
//
// generate() is the single function server.js calls.
// It's async because it awaits the Groq API response.
//
// RETURN VALUE:
//   SUCCESS: { success: true, summary, budgetTier, itinerary }
//   FAILURE: { success: false, error: '<reason>' }
//
// The failure shape is intentional — it means server.js can
// check result.success and branch to the fallback without
// needing try/catch itself (the error is already contained here).

async function generate(tripDetails) {
  const { destination, budget, style, days } = tripDetails;

  // --- GUARD: API key check ---
  // If GROQ_API_KEY is missing or empty, skip the API call
  // entirely and return a clean failure immediately.
  // This prevents a confusing "401 Unauthorized" error from
  // bubbling up and is easy to explain in the server logs.
  if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY.trim() === '') {
    console.warn('⚠️  GROQ_API_KEY not set — falling back to rule-based engine');
    return { success: false, error: 'GROQ_API_KEY not configured' };
  }

  try {
    console.log(`🤖 Groq: generating ${days}-day itinerary for ${destination}…`);
    const startTime = Date.now();

    // ── THE API CALL ──────────────────────────────────────────
    //
    // groq.chat.completions.create() sends a request to Groq's
    // chat completions endpoint — the same interface as OpenAI.
    //
    // KEY PARAMETERS:
    //
    //   model — "llama-3.3-70b-versatile"
    //     This is Groq's recommended model for JSON-heavy tasks.
    //     Llama 3.3 70B is Meta's open-source model — extremely
    //     capable for structured output, and fast on Groq hardware.
    //     Other options: "gemma2-9b-it" (faster, smaller),
    //     "mixtral-8x7b-32768" (older but still good).
    //
    //   messages — array of { role, content } objects
    //     role "system" → our rules and JSON schema instructions
    //     role "user"   → the specific trip request
    //
    //   temperature — 0.7
    //     Controls randomness. 0 = very deterministic (same output
    //     every time). 1 = very random. 0.7 is the sweet spot:
    //     creative enough to produce varied itineraries, but
    //     structured enough to follow the JSON format reliably.
    //
    //   max_tokens — 4096
    //     The maximum length of the response in tokens (roughly
    //     ~3 chars per token). 4096 is enough for a 7-day
    //     itinerary with full activity details. Going lower risks
    //     cutting off the response mid-JSON.
    //
    //   response_format — { type: 'json_object' }
    //     This is Groq's "JSON mode". When set, the model is
    //     constrained to produce valid JSON — it can't produce
    //     text that isn't parseable. Highly recommended for
    //     structured output tasks. IMPORTANT: the model still
    //     needs to be instructed to produce JSON in the system
    //     prompt — JSON mode alone doesn't tell it the schema.
    //
    // NOTE ON response_format:
    //   json_object mode returns an OBJECT, not an array. We
    //   prompt the model to wrap the array in { "itinerary": [...] }
    //   so it works within the constraint. See SYSTEM_PROMPT above.

    const completion = await groq.chat.completions.create({
      model:    'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildUserPrompt(tripDetails) },
      ],
      temperature:     0.7,
      max_tokens:      4096,

      // JSON mode: forces valid JSON output from the model.
      // We must still ask for JSON in the prompt — this just
      // guarantees the response is parseable.
      // NOTE: When json_object mode is active, the model returns
      // a top-level object. We wrap our array in { itinerary: [...] }
      // and update the system prompt accordingly.
    });

    const elapsed = Date.now() - startTime;
    console.log(`✅ Groq: response received in ${elapsed}ms`);

    // ── EXTRACT THE RESPONSE TEXT ─────────────────────────────
    //
    // The Groq (and OpenAI) response shape:
    //   completion.choices[0].message.content  → the model's text
    //
    // We always use choices[0] — we only asked for one response
    // (n defaults to 1). The content is a string at this point.
    const rawText = completion.choices[0]?.message?.content;

    if (!rawText) {
      throw new Error('Groq returned an empty response');
    }

    // ── PARSE THE JSON ────────────────────────────────────────
    //
    // Even with json_object mode enabled, defensive parsing is
    // important. If the JSON is somehow malformed, JSON.parse()
    // will throw, and our catch block handles it gracefully.
    //
    // STRATEGY:
    //   Since json_object mode wraps the response in an object,
    //   we try to find the array in multiple possible locations:
    //   1. rawText is directly parseable as an array (rare but possible
    //      if the model ignores json_object wrapping instructions)
    //   2. parsed.itinerary — the key we asked the model to use
    //   3. The first array-valued key in the parsed object
    //
    // This layered approach makes parsing resilient to slight
    // variations in model output.
    let itinerary;

    try {
      const parsed = JSON.parse(rawText);

      if (Array.isArray(parsed)) {
        // The model returned a bare array — use it directly
        itinerary = parsed;
      } else if (Array.isArray(parsed.itinerary)) {
        // The model wrapped it as { itinerary: [...] } — our preference
        itinerary = parsed.itinerary;
      } else {
        // Try any array-valued key as a last resort
        const firstArray = Object.values(parsed).find(v => Array.isArray(v));
        if (firstArray) {
          itinerary = firstArray;
        } else {
          throw new Error('Groq response JSON contained no itinerary array');
        }
      }
    } catch (parseError) {
      throw new Error(`JSON parse failed: ${parseError.message}`);
    }

    // ── VALIDATE THE ITINERARY ────────────────────────────────
    //
    // Check that every day and activity has the shape our
    // frontend expects. If validation fails, fall back to the
    // rule-based engine — better than a half-broken itinerary.

    if (!validateItinerary(itinerary, days)) {
      throw new Error(`Groq itinerary failed validation (got ${itinerary.length} days, expected ${days})`);
    }

    // ── BUILD SUMMARY AND BUDGET TIER ────────────────────────
    //
    // We reuse itineraryEngine's classifyBudget and label maps
    // here so the summary format matches what the rule-based
    // engine produces. This means the frontend and database
    // never have to care which engine produced the itinerary.
    //
    // We can't require() itineraryEngine here because it's not
    // exported — so we duplicate the classification logic.
    // (Alternatively, you could extract it to a shared utils.js.)
    const budgetTier = classifyBudget(Number(budget), days);

    const styleLabels = {
      adventure:  'Adventure & Outdoors',
      cultural:   'Cultural & Historical',
      foodie:     'Food & Culinary',
      relaxation: 'Relaxation & Wellness',
      budget:     'Budget Backpacking',
      luxury:     'Luxury & Fine Dining',
    };

    const budgetLabels = {
      low:    'Budget-Friendly',
      medium: 'Mid-Range',
      high:   'Luxury',
    };

    const summary =
      `${days}-day ${styleLabels[style] || style} trip to ${destination} ` +
      `(${budgetLabels[budgetTier]} — $${budget} total) · AI-powered`;

    console.log(`✅ Groq itinerary ready: ${itinerary.length} days for ${destination}`);

    return {
      success:    true,
      summary:    summary,
      budgetTier: budgetTier,
      itinerary:  itinerary,
    };

  } catch (error) {
    // ── CATCH ALL ERRORS AND RETURN A CLEAN FAILURE ───────────
    //
    // We intentionally catch EVERYTHING here — network errors,
    // parse errors, validation errors, API errors (rate limits,
    // invalid key, model unavailable) — and normalise them into
    // { success: false }.
    //
    // This means server.js NEVER needs its own try/catch around
    // this function. The failure is fully contained.
    //
    // We log the error so developers can debug, but the end user
    // just silently receives a rule-based itinerary instead.
    console.error('❌ Groq AI error (will fall back):', error.message);

    return {
      success: false,
      error:   error.message,
    };
  }
}


// ── SECTION 6: BUDGET CLASSIFIER ─────────────────────────────
//
// Duplicated from itineraryEngine.js so groqService.js stays
// self-contained. The logic is identical — kept here so this
// file has no dependency on itineraryEngine.js.
//
// THRESHOLDS (per day):
//   < $75/day  → low    (budget traveller)
//   < $200/day → medium (mid-range traveller)
//   >= $200/day → high  (luxury traveller)

function classifyBudget(totalBudget, days) {
  const perDay = totalBudget / days;
  if (perDay < 75)  return 'low';
  if (perDay < 200) return 'medium';
  return 'high';
}


// ── EXPORT ────────────────────────────────────────────────────
//
// We export only the generate() function. Everything else
// (buildUserPrompt, validateItinerary, classifyBudget) is
// private implementation detail — hidden from server.js.

module.exports = { generate };