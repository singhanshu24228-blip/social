# Contact Local — Prototype Workspace

This repo contains a prototype scaffold for Contact Local (PWA chat for nearby users).

Folders:
- `backe/` — Express + TypeScript + Mongoose + Socket.io
- `frontend/` — Vite + React + TypeScript + Tailwind + PWA

Run locally:
- Backend: cd backe && npm install && npm run dev
- Frontend: cd frontend && npm install && npm run dev

Notes:
- Populate `.env` in `backe/` with `MONGODB_URI` and `JWT_SECRET`.
- Frontend uses `VITE_API_URL` if set.
- If your frontend and backend are on different domains, cookie auth + CSRF will not work unless you proxy `/api` through the frontend domain (recommended) or you opt into Bearer auth (see below).

## Render deployment (single service)
Create a Render **Web Service** (not a Static Site):
- Root Directory: repo root (leave blank / `.`), not `backe/`
- Build Command: `npm run render:build`
- Start Command: `npm start`

Environment variables:
- `MONGODB_URI`
- `JWT_SECRET`
- `CLIENT_URL` (optional if serving frontend from the same origin; set it if your frontend is hosted on a different domain)

Optional auth env vars:
- `EXPOSE_ACCESS_TOKEN=true` — include an `accessToken` in `/api/auth/login|signup|refresh` responses so the frontend can use `Authorization: Bearer ...` when cookies/CSRF aren't viable across domains.

What's implemented so far:
- Signup/Login with email and password (bcrypt + JWT)
- Username uniqueness enforced within 2 KM
- Location update and nearby users endpoint (distance in meters, no exact location returned)
- Basic Socket.io auth + presence events
- Frontend skeleton: Signup (requests geolocation), Login, Home (nearby users) and socket presence

Next steps:
- Group auto-creation, messaging, status, group chat pages and delivery statuses
- PWA offline caching improvements and push notifications
- Security hardening & deployment configuration
# socal
# social
# social
# social
# local
# local
# local
# local
# socialnew
# socialnew
# social2
