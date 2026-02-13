# DevSyncPro: The GPS for Your Software

**What is this project?**
DevSyncPro is a tool that acts like a **"Live Map"** for your software.

Imagine you are building a huge city (your software ecosystem) with many different buildings (services like `backend`, `frontend`, `database`).
- **The Problem:** It's hard to remember how everything is connected. If you change a pipe in the basement, you might accidentally break the water supply for the whole city, but you wouldn't know until it's too late.
- **The Solution:** DevSyncPro scans all your blueprints (code) and draws a live map. It shows you exactly what depends on what.

### 🧩 What does it solve?

1.  **Blindness ("The Spaghetti Problem")**
    *   *Without it:* You guess how `frontend` talks to `backend`.
    *   *With it:* You **see** a green line connecting them on the screen.

2.  **Unexpected Breakages ("Blast Radius")**
    *   *Without it:* You update the `backend` code, and suddenly the `frontend` stops working.
    *   *With it:* The system warns you: "Warning! 5 other services rely on this code. Be careful."

3.  **Slow Fixing ("Root Cause Analysis")**
    *   *Without it:* When the site crashes, you spend 3 hours reading logs to find the error.
    *   *With it:* The **AI Analyzer** reads the logs for you and says: "The database password expired. Here is how to update it."

### 🚀 How it works (The components you saw)
*   **Scanner**: The robot that reads your code (e.g., `IloveShirgonda`) and draws the circles.
*   **Orchestrator**: The traffic controller that watches for crashes (Incidents).
*   **Dashboard**: The screen where you see the map and control everything.

### 🏗️ Architecture
```mermaid
graph TD
    A[Repo Scanner (Go)] -->|Pub/Sub| B[Orchestrator (Go)]
    B -->|WebSockets| C[Frontend Dashboard (React)]
    A --API--> C
    D[AI Analyzer (Python)] -.->|Analysis| B
```

### 🎮 How to run it
```bash
# 1. Start the backend services
docker-compose up --build

# 2. Open the dashboard
Open http://localhost:3000
```
