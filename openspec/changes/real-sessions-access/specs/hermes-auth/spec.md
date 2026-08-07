## ADDED Requirements

### Requirement: Gated REST on token-capable targets uses X-Hermes-Session-Token
For targets whose auth type is `session-token`, the client SHALL authenticate gated
Hermes dashboard REST endpoints (including `/api/sessions` and
`/api/sessions/{id}/messages`) by sending the header
`X-Hermes-Session-Token: <token>` on every such request.

#### Scenario: Sessions without token are rejected by Hermes
- **WHEN** a request is made to `GET /api/sessions` without a valid session token
- **THEN** Hermes responds with HTTP 401 (as verified for Hermes 0.20.0)

#### Scenario: Sessions with session token succeed
- **WHEN** a request is made to `GET /api/sessions?profile=projects-ex` with a valid
  `X-Hermes-Session-Token`
- **THEN** Hermes responds with HTTP 200 and a JSON body containing a sessions list

### Requirement: Token acquisition for local dashboard
The client SHALL obtain the session token by either:
1. using an explicitly provided token (config / env `HERMES_DASHBOARD_SESSION_TOKEN`), or
2. parsing `SESSION_TOKEN__="..."` from the Hermes SPA HTML at `GET {hermesOrigin}/`
   where `{hermesOrigin}` for local dev is `http://127.0.0.1:9119` (not the Vite app root).

#### Scenario: Token parsed from Hermes HTML
- **WHEN** no explicit token is configured and local Hermes dashboard is running on :9119
- **THEN** the client MUST successfully extract a non-empty `SESSION_TOKEN__` value from
  `GET http://127.0.0.1:9119/`

### Requirement: Bearer is not the primary period-1 auth path
The system MUST NOT rely on `Authorization: Bearer` as the primary mechanism to access
`/api/sessions` in period-1, because Hermes 0.20.0 does not register sessions routes as
token-routes.

#### Scenario: Design and docs prefer session-token header
- **WHEN** period-1 auth is documented or implemented
- **THEN** the prescribed header for gated REST MUST be `X-Hermes-Session-Token`

### Requirement: Dev traffic uses same-origin proxy for API
In local development, browser calls to Hermes REST API SHALL go same-origin to the Vite
dev server path `/api/*`, which proxies to `127.0.0.1:9119`, so that custom auth headers
are not blocked by CORS preflight on gated routes.

#### Scenario: Browser does not need cross-origin custom-header CORS for /api/sessions
- **WHEN** the UI runs on `http://localhost:5173` and requests `/api/sessions?profile=...`
- **THEN** the request MUST be same-origin to :5173 and reach Hermes via the dev proxy

### Requirement: Auth mechanism is selected by feature detection
The system SHALL support two auth mechanisms and select one per target instead of
hardcoding: `session-token` (header) and `cookie` (password login session).
Detection SHALL use an unauthenticated probe of `GET /api/health` or `GET /api/status`,
reading the boolean field `auth_required`.

#### Scenario: Loopback agent reports auth not required
- **WHEN** `GET /api/health` on the local dashboard returns `auth_required: false`
- **THEN** the target MUST be treated as `session-token` capable
- **AND** the client MUST attempt token acquisition per the token requirement

#### Scenario: LAN agent reports auth required
- **WHEN** `GET /api/health` on `http://192.168.1.221:9119` returns `auth_required: true`
- **THEN** the target MUST be treated as `cookie` auth
- **AND** the client MUST NOT expect `SESSION_TOKEN__` to be present in the SPA HTML

### Requirement: Cookie auth via password login
For targets whose auth type is `cookie`, the client SHALL authenticate by sending
`POST /auth/password-login` with JSON body `{ "provider": "basic", "username": "...",
"password": "..." }` and SHALL reuse the returned session cookies
(`hermes_session_at`, `hermes_session_rt`, `hermes_session_provider`) on subsequent
gated REST requests.

#### Scenario: Successful password login on LAN agent
- **WHEN** valid credentials are posted to `POST /auth/password-login` on the LAN agent
- **THEN** the response MUST be HTTP 200 with body containing `ok: true`
- **AND** the response MUST set at least the cookie `hermes_session_at`

#### Scenario: Gated sessions succeed with cookie session
- **WHEN** `GET /api/sessions?profile=default` is requested on the LAN agent with the
  session cookies obtained from password login
- **THEN** Hermes MUST respond with HTTP 200
- **AND** the body MUST contain a `sessions` array and a numeric `total`

#### Scenario: Gated sessions rejected without cookie
- **WHEN** `GET /api/sessions` is requested on the LAN agent with no session cookie
- **THEN** Hermes MUST respond with HTTP 401

#### Scenario: SPA root redirects when unauthenticated
- **WHEN** `GET /` is requested on the LAN agent without a session cookie
- **THEN** Hermes MUST respond with a redirect (HTTP 302) to the login page
- **AND** the client MUST NOT treat that HTML as a source of a session token

### Requirement: Credentials are never committed
Credentials for cookie-auth targets SHALL be supplied at runtime via environment
variables (for the LAN agent: `HERMES_L1_USERNAME`, `HERMES_L1_PASSWORD`).
The repository MUST NOT contain plaintext passwords or session cookies for any agent.

#### Scenario: Registry references env, not literals
- **WHEN** the agent registry declares a cookie-auth target
- **THEN** it MUST reference environment variables for credentials
- **AND** MUST NOT embed a literal password string

### Requirement: Browser cookie flow goes through the dev proxy
Browser-originated access to a cookie-auth target SHALL be routed through the dev
server proxy (or a BFF), because session cookies are `HttpOnly` and cross-origin
credentialed requests to a LAN agent are blocked by CORS preflight on gated routes.
The page MUST NOT issue gated requests directly to the agent origin.

#### Scenario: LAN agent access from the app uses a proxy path
- **WHEN** the UI needs sessions of the LAN agent
- **THEN** the request MUST target a proxy path served by the app origin
- **AND** the proxy MUST forward login and cookie handling to `192.168.1.221:9119`
