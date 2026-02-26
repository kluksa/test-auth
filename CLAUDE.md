# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Google OAuth2 demo app: Spring Boot 4 backend + React 19 frontend. The backend handles OAuth2 via session cookies; the frontend redirects the browser to the backend's `/oauth2/authorization/google` endpoint to initiate login.

## Commands

### Backend (from `backend/`)
```bash
./mvnw spring-boot:run        # Run locally (requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars)
./mvnw clean package          # Build JAR
./mvnw test                   # Run all tests
./mvnw test -Dtest=ClassName  # Run a single test class
```

### Frontend (from `frontend/`)
```bash
npm run dev      # Dev server at http://localhost:5173
npm run build    # Production build to dist/
npm run lint     # ESLint
npm run preview  # Preview production build
```

## Architecture

### Auth flow
1. Frontend redirects browser to `{BACKEND_URL}/oauth2/authorization/google`
2. Spring Security handles Google OAuth2 redirect and callback
3. On success, backend redirects browser to `{FRONTEND_URL}/` (configured via `app.frontend-url`)
4. Frontend calls `GET /api/user` on load to check session state (cookie-based, `withCredentials: true`)
5. Logout hits `{BACKEND_URL}/logout`, which invalidates the session and redirects to `{FRONTEND_URL}/`

### Backend (`backend/src/main/java/com/example/auth/`)
- `config/SecurityConfig.java` — CORS (single allowed origin = `FRONTEND_URL`), OAuth2 login, logout, session config. The `resolvedFrontendUrl()` method normalizes the URL by adding `https://` if missing.
- `controller/UserController.java` — `GET /api/user`: returns auth status + Google profile fields
- `controller/HelloController.java` — `GET /api/hello` and `POST /api/hello`: protected endpoints requiring authentication

### Frontend (`frontend/src/`)
- `api.js` — axios instance with `withCredentials: true` and `baseURL = VITE_API_URL`
- `App.jsx` — single-page app; checks `/api/user` on mount to determine login state

## Environment Variables

### Backend
| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret |
| `FRONTEND_URL` | Frontend origin for CORS and redirects (default: `http://localhost:5173`) |

### Frontend
| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL (default: `http://localhost:8080`) |
| `VITE_GOOGLE_CLIENT_ID` | Google client ID (available in frontend but auth itself is handled by backend) |

Local frontend env is in `frontend/.env`.

## Deployment

Deployed on Render via `render.yaml`: backend as a Docker service, frontend as a static site. The backend Dockerfile does a two-stage Maven build with Java 21.

## Render Deployment Gotchas

- **No Java runtime** — backend must use `runtime: docker`; `runtime: java` is invalid
- **Static sites have no `plan` field** — omit it; Docker/native web services use `plan: free`
- **`fromService.property: host` is unreliable** — returns only the service slug (e.g. `test-auth-backend-loiu`), not the full hostname. Do not use it for URL construction. Hardcode the full `https://<slug>.onrender.com` URLs directly in `render.yaml` instead
- **`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be set manually** in the Render dashboard (`sync: false` in render.yaml); never commit actual values
- After deploying, add the backend callback URL to Google Console: `https://<backend>.onrender.com/login/oauth2/code/google`

## Known Code Gotchas

- **`Map.of()` with mixed types** — `Map.of("authenticated", true, "name", stringValue)` infers `V=Boolean` from the first entry and throws `ClassCastException` at runtime. Always use `Map.<String, Object>of(...)` when mixing booleans and strings.
- **Session cookie cross-origin** — frontend and backend on different domains requires `server.servlet.session.cookie.same-site: none` + `secure: true` in `application.yml`, plus `allowCredentials(true)` in CORS config, plus `withCredentials: true` in axios. All three are required.
- **OAuth login must use `window.location.href`** — never use `fetch`/axios to initiate OAuth; the browser must follow the redirect chain to set cookies correctly.

## Render CLI Notes

- Check logs: `render logs --resources <serviceId> --output text --limit 50`
- Filter errors: `render logs --resources <serviceId> --output text --level error`
- Search text: `render logs --resources <serviceId> --output text --text "keyword"`
- **No env var management command** — use Render dashboard or API directly; `render env set` does not exist
- Service IDs: backend=`srv-d6f2o3jh46gs73e3odeg`, frontend=`srv-d6f2o4bh46gs73e3oe7g`

## GitHub Push

- SSH key on this machine belongs to a different account (`kluksaAg`); push via HTTPS token: `GH_TOKEN=$(gh auth token) git remote set-url origin "https://kluksa:$(gh auth token)@github.com/kluksa/test-auth.git" && git push` then reset the remote URL
