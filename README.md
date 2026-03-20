# Contact Local — Prototype Workspace

This repo contains a prototype scaffold for Contact Local (PWA chat for nearby users).

Folders:
- `backe/` — Express + TypeScript + Mongoose + Socket.io
- `frontend/` — Vite + React + TypeScript + Tailwind + PWA

Run locally:
- Backend: cd backe && npm install && npm run dev
- Frontend: cd frontend && npm install && npm run dev

Notes:
- Populate `.env` in `backe/` with `MONGODB_URI`, `JWT_SECRET` and (in production) `CLIENT_URL`.
  - To enable the password reset email flow you should also set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `SMTP_PASS` (or configure an unauthenticated relay). `SMTP_FROM` can be used to customize the sender address.
  - **Development note:** if you don't configure SMTP locally the OTP won't actually be sent.  In non‑production builds the code will log the one‑time code to the backend console (look for `[email] OTP for ...` or `[auth] generated OTP ...`).  That log entry lets you test reset without a mail server.
  - A similar mechanism is used for account deletion: `/api/auth/request-delete` will send an OTP and `/api/auth/delete-account` allows the authenticated user to provide their password and OTP to remove their account.
- You can also request a username change by POSTing `/api/auth/request-username-change` with `{ newUsername }`.  An OTP is emailed, and the user may then POST `/api/auth/change-username` with `{ password, otp }` to finalize the update (availability is checked within 2 km of the user as usual).
- Frontend uses `VITE_API_URL` if set.
- Status API now serves a follower-based feed (`GET /api/status/feed`); `/api/status/nearby` is maintained for backwards compatibility.
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

**Optional cloud storage variables (for Cloudinary uploads):**
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY` (e.g. 731627638595454)
- `CLOUDINARY_API_SECRET` (e.g. eMcf9B1kB3D32iCPqlf5FadOziI)


Optional auth env vars:
- `EXPOSE_ACCESS_TOKEN=true` — include an `accessToken` in `/api/auth/login|signup|refresh` responses so the frontend can use `Authorization: Bearer ...` when cookies/CSRF aren't viable across domains.

What's implemented so far:
- Signup/Login with email and password (bcrypt + JWT)
- Username uniqueness enforced within 2 KM
- Location update and nearby users endpoint (distance in meters, no exact location returned)
- Basic Socket.io auth + presence events
- Frontend skeleton: Signup (requests geolocation), Login, Home (nearby users) and socket presence

Next steps:
- Group auto-creation, messaging, status (visible only to followers), group chat pages and delivery statuses
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
