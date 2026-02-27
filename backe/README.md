# Contact Local — Backend (Prototype)

This folder contains the backend for Contact Local. Features scaffolded:

- Express + TypeScript
- Mongoose models (User with GeoJSON and 2dsphere index)
- Basic auth routes: /api/auth/signup and /api/auth/login (bcrypt + JWT)
- JWT middleware
- Username uniqueness check within 2 KM on signup, login, and location updates
- Endpoint: PUT /api/users/location (auth) — validates username uniqueness before updating location
- Endpoint: GET /api/users/check-username?username=...&lat=...&lng=... — rate-limited username availability check
- Endpoint: GET /api/users/nearby?lat=...&lng=... — returns users within 2 KM with approximate distance (meters) and online status (exact location is never exposed)
- Socket.io integration with JWT auth; presence updates (online/offline) are emitted via 'presence:update' events
- Group auto-creation logic: `ensureGroupsForLocation(coords)` creates 1KM and 2KM groups for a derived areaCode/pincode (now uses Nominatim reverse geocoding to derive a 3-letter area code and postcode with fallback to a pseudo pincode)
- Endpoints:
  - `GET /api/groups/available?lat=..&lng=..` (auth) — lists groups within 2KM and whether the user is a member
  - `POST /api/groups/:groupId/join` (auth) — join a group if within allowed range
  - `POST /api/groups/:groupId/leave` (auth) — leave a group

Environment:
- Copy `.env.example` to `.env` and fill in `MONGODB_URI` and `JWT_SECRET`.
- Optional: set `PORT` (defaults to 5000; in dev it will try the next ports if 5000 is busy).

Run locally:
- npm install
- npm run dev

Next steps:
- Add Socket.io with token auth
- Implement group logic & messages
- Add rate-limiting and production readiness
# social
