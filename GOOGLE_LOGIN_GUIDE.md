# Google OAuth2 Login: Spring Boot 4 + React 19 on Render

Complete, battle-tested guide. Every gotcha here was hit in production.

---

## 1. Google Cloud Console Setup

### Create OAuth Client
1. Go to https://console.cloud.google.com/apis/credentials
2. **Create Credentials → OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Add **Authorized JavaScript origins**:
   ```
   https://<your-frontend>.onrender.com
   http://localhost:5173   ← for local dev
   ```
5. Add **Authorized redirect URIs**:
   ```
   https://<your-backend>.onrender.com/login/oauth2/code/google
   http://localhost:8080/login/oauth2/code/google   ← for local dev
   ```
6. Save → copy **Client ID** and **Client Secret**

> ⚠️ **Redirect URI goes in "Authorized redirect URIs", NOT "Authorized JavaScript origins".**
> These are two separate fields. A common mistake is adding the callback URL to the wrong one.

> ⚠️ **Changes take up to 5 minutes to propagate.** Don't test immediately after saving.

> ⚠️ **Double-check you are editing the correct OAuth client.** The client ID shown in the
> credentials list must match the one in your Spring Boot config.

---

## 2. Spring Boot 4 Backend

### pom.xml dependencies
```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>4.0.0</version>
</parent>

<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-security</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-oauth2-client</artifactId>
    </dependency>
</dependencies>
```

### application.yml
```yaml
server:
  port: 8080
  servlet:
    session:
      cookie:
        same-site: none    # CRITICAL for cross-origin cookie (see section 6)
        secure: true       # Required when same-site=none

spring:
  security:
    oauth2:
      client:
        registration:
          google:
            client-id: ${GOOGLE_CLIENT_ID}
            client-secret: ${GOOGLE_CLIENT_SECRET}
            scope:
              - openid
              - profile
              - email

app:
  frontend-url: ${FRONTEND_URL:http://localhost:5173}
```

### SecurityConfig.java
```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Value("${app.frontend-url}")
    private String frontendUrl;

    // CRITICAL: always normalize the URL — Render env vars may be bare hostnames
    private String resolvedFrontendUrl() {
        String url = frontendUrl.trim();
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://" + url;
        }
        return url.replaceAll("/+$", "");
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        String frontend = resolvedFrontendUrl();
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/hello").authenticated()
                .anyRequest().permitAll()
            )
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
            )
            .oauth2Login(oauth2 -> oauth2
                .defaultSuccessUrl(frontend + "/", true)
                .failureUrl(frontend + "/?error=login_failed")
            )
            .logout(logout -> logout
                .logoutSuccessUrl(frontend + "/")
                .invalidateHttpSession(true)
                .deleteCookies("JSESSIONID")
            );
        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(resolvedFrontendUrl()));
        config.setAllowedMethods(List.of("GET", "POST", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);   // REQUIRED for cross-origin cookies

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
```

### UserController.java — the Map.of() trap
```java
@GetMapping("/api/user")
public ResponseEntity<?> getUser(@AuthenticationPrincipal OAuth2User user) {
    if (user == null) {
        return ResponseEntity.ok(Map.of("authenticated", false));
    }
    // ✅ CORRECT: explicit <String, Object> type parameter
    return ResponseEntity.ok(Map.<String, Object>of(
        "authenticated", true,
        "name", user.getAttribute("name"),
        "email", user.getAttribute("email"),
        "picture", user.getAttribute("picture")
    ));
}
```

> ⚠️ **Never write `Map.of("authenticated", true, "name", stringValue, ...)`** without explicit
> type parameters. Java infers `V = Boolean` from the first entry (`true`), then throws
> `ClassCastException: String cannot be cast to Boolean` at runtime when it hits the string values.
> Always use `Map.<String, Object>of(...)`.

### Dockerfile (Render requires Docker for Java — no native Java runtime)
```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn clean package -DskipTests -q

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

---

## 3. React 19 Frontend

### api.js
```js
import axios from 'axios';

function normalizeUrl(url) {
  if (!url) return url;
  const trimmed = url.replace(/\/+$/, '');
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return 'https://' + trimmed;
}

const api = axios.create({
  baseURL: normalizeUrl(import.meta.env.VITE_API_URL),
  withCredentials: true,    // REQUIRED — sends JSESSIONID cookie cross-origin
});

export const getUser = () => api.get('/api/user').then(r => r.data);
```

### App.jsx — login redirect
```js
// CRITICAL: normalize URL — same reason as backend (Render may give bare hostname)
function normalizeUrl(url) {
  if (!url) return url;
  const trimmed = url.replace(/\/+$/, '');
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return 'https://' + trimmed;
}

const BACKEND_URL = normalizeUrl(import.meta.env.VITE_API_URL);

// Login: redirect the entire browser (not fetch/axios) to the backend OAuth endpoint
const handleLogin = () => {
  window.location.href = `${BACKEND_URL}/oauth2/authorization/google`;
};

// Logout
const handleLogout = () => {
  window.location.href = `${BACKEND_URL}/logout`;
};
```

> ⚠️ **Never use `fetch` or `axios` to initiate OAuth login.** You must do a full browser
> redirect with `window.location.href`. The OAuth flow requires the browser to follow redirects
> and set cookies — it cannot be done as an XHR/fetch request.

> ⚠️ **If `VITE_API_URL` has no protocol prefix**, the browser treats the URL as a relative path
> and appends it to the current page URL, causing bizarre looping URLs. Always normalize.

### .env (local dev)
```
VITE_API_URL=http://localhost:8080
VITE_GOOGLE_CLIENT_ID=<your-client-id>
```

---

## 4. render.yaml

```yaml
services:
  - type: web
    name: my-backend
    runtime: docker              # ✅ NOT runtime: java — that doesn't exist on Render
    plan: free
    dockerfilePath: ./backend/Dockerfile
    dockerContext: ./backend
    envVars:
      - key: GOOGLE_CLIENT_ID
        sync: false              # Set manually in Render dashboard — never commit secrets
      - key: GOOGLE_CLIENT_SECRET
        sync: false
      - key: FRONTEND_URL
        value: https://my-frontend.onrender.com   # ✅ hardcode full URL — see gotcha below

  - type: web
    name: my-frontend
    runtime: static              # No plan field for static sites — it's always free
    buildCommand: cd frontend && npm install && npm run build
    staticPublishPath: frontend/dist
    envVars:
      - key: VITE_API_URL
        value: https://my-backend.onrender.com    # ✅ hardcode full URL
      - key: VITE_GOOGLE_CLIENT_ID
        value: <your-client-id>
    routes:
      - type: rewrite
        source: /*
        destination: /index.html   # SPA fallback
```

> ⚠️ **Do NOT use `fromService.property: host`** to construct URLs. It returns only the service
> slug (e.g. `my-backend`) without `.onrender.com` and without the `https://` protocol.
> Hardcode the full `https://<slug>.onrender.com` URLs directly.

> ⚠️ **Static sites have no `plan` field.** Only Docker/native web services accept `plan: free`.
> Adding it to a static site causes a deploy error.

> ⚠️ **`VITE_*` env vars are baked in at build time**, not at runtime. If you change them in
> the Render dashboard, the frontend must be redeployed to pick them up.

---

## 5. The Complete Auth Flow

```
1. User clicks "Sign in with Google"
   → browser redirects to: https://<backend>/oauth2/authorization/google

2. Spring Security redirects browser to Google consent screen

3. User grants permission
   → Google redirects to: https://<backend>/login/oauth2/code/google?code=...&state=...

4. Spring Security exchanges code for tokens, fetches user profile
   → Creates HTTP session, sets JSESSIONID cookie (SameSite=None; Secure)
   → Redirects browser to: https://<frontend>/

5. Frontend loads, calls GET /api/user with withCredentials: true
   → Browser sends JSESSIONID cookie cross-origin
   → Backend returns { authenticated: true, name: "...", email: "...", picture: "..." }

6. Frontend renders user profile
```

---

## 6. Cross-Origin Cookie: The Most Common Silent Failure

**Symptom:** Login succeeds (Google redirects back to frontend) but the app immediately
shows "not logged in". `/api/user` returns `{ authenticated: false }`.

**Cause:** Frontend and backend are on different domains. By default, Spring sets
`JSESSIONID` with `SameSite=Lax`. The browser refuses to send `SameSite=Lax` cookies
on cross-origin XHR/fetch requests, even with `withCredentials: true`.

**Fix — three parts, all required:**

1. **Backend** `application.yml`:
   ```yaml
   server:
     servlet:
       session:
         cookie:
           same-site: none
           secure: true
   ```

2. **Backend** CORS config must have `config.setAllowCredentials(true)`

3. **Frontend** axios must have `withCredentials: true`

---

## 7. Render Env Var Management

The Render CLI (v2.10) has **no command to set env vars**. Options:

- **Dashboard**: https://dashboard.render.com → service → Environment tab → Save Changes
  (triggers automatic redeploy)
- **Render API** (if you have an API key):
  ```bash
  curl -X PATCH https://api.render.com/v1/services/<serviceId>/env-vars \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    -H "Content-Type: application/json" \
    -d '[{"key":"GOOGLE_CLIENT_ID","value":"..."}]'
  ```

For secrets (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), always use `sync: false` in
`render.yaml` and set them manually — never commit credentials to the repo.

---

## 8. Troubleshooting Checklist

| Symptom | Cause | Fix |
|---|---|---|
| `runtime: java` error on deploy | Render has no Java runtime | Use `runtime: docker` + Dockerfile |
| `no such plan free for service type web` | `plan` field on static site | Remove `plan` from static site service |
| `defaultTarget must start with '/' or http(s)` | `FRONTEND_URL` has no protocol | Add `resolvedFrontendUrl()` normalization or hardcode full URL |
| URL in browser is `frontend.com/backend-slug/oauth2/...` | `VITE_API_URL` has no protocol | Normalize URL in frontend or hardcode full https:// URL |
| `DNS_PROBE_FINISHED_NXDOMAIN` on login | `VITE_API_URL` is slug only (e.g. `my-backend`) | Hardcode full URL in render.yaml |
| `redirect_uri_mismatch` from Google | Redirect URI not registered | Add `https://<backend>.onrender.com/login/oauth2/code/google` to **Authorized redirect URIs** (not JS origins) |
| Login succeeds but app shows "not logged in" | `SameSite=Lax` cookie blocked cross-origin | Set `same-site: none` + `secure: true` in application.yml |
| `ClassCastException: String cannot be cast to Boolean` | `Map.of()` type inference issue | Use `Map.<String, Object>of(...)` |
| Backend starts but immediately shuts down | Port scan timeout on free tier | Normal — app is slow to start, Render retries and finds the port |
