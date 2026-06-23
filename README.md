# TravelMate

TravelMate is a full-stack travel planning application that helps users generate personalized travel itineraries based on destination, budget, travel style, and trip duration.

The application combines AI-powered itinerary generation with a rule-based fallback engine to ensure reliable trip planning. Users can save trips, manage trip history, and export itineraries as PDF documents.

## Features

* AI-powered itinerary generation
* Rule-based fallback engine
* Personalized trip planning
* Save trips to MySQL database
* View trip history
* Delete saved trips
* PDF itinerary export
* Responsive user interface
* REST API architecture
* Express backend integration

## Tech Stack

### Frontend

* HTML5
* CSS3
* JavaScript

### Backend

* Node.js
* Express.js

### Database

* MySQL

### Additional Libraries

* PDF generation library
* AI API integration
* dotenv
* cors

## Project Architecture

```text
User Interface
       |
       v
Express Backend
       |
       +-------------------+
       |                   |
       v                   v
AI Itinerary Engine   Rule-Based Engine
       |
       v
MySQL Database
       |
       v
PDF Export
```

## How It Works

1. User enters:

   * Destination
   * Travel Dates
   * Budget
   * Travel Style

2. TravelMate sends the request to the Express backend.

3. The backend attempts to generate an itinerary using the AI service.

4. If the AI service is unavailable, the application automatically switches to the rule-based itinerary engine.

5. The generated itinerary is displayed to the user.

6. Users can:

   * Save trips
   * View saved trips
   * Delete saved trips
   * Export itineraries as PDF

## Installation

### Clone the Repository

```bash
git clone <your-repository-url>
cd travelmate
```

### Install Dependencies

```bash
npm install
```

### Configure Environment Variables

Create a `.env` file in the project root.

```env
PORT=3000

# AI Provider Key
API_KEY=your_api_key_here

# MySQL Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=travelmate
```

### Start the Server

```bash
npm start
```

or

```bash
node server.js
```

### Open the Application

```text
http://localhost:3000
```

## Database

Example database table:

```sql
CREATE TABLE trips (
    id INT AUTO_INCREMENT PRIMARY KEY,
    destination VARCHAR(100),
    budget VARCHAR(50),
    style VARCHAR(50),
    start_date DATE,
    end_date DATE,
    itinerary LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Future Enhancements

* Interactive maps using Leaflet and OpenStreetMap
* Trip sharing functionality
* User authentication
* Trip favorites
* Calendar integration
* Multi-destination trip planning

## Screenshots

Add screenshots here after completing the UI.

## Learning Outcomes

This project helped me learn:

* Full-stack web development
* REST API design
* Node.js and Express
* MySQL integration
* Database CRUD operations
* Environment variable management
* PDF generation
* AI API integration
* Git and GitHub workflows

## Author

Developed as a full-stack portfolio project using modern web technologies.
