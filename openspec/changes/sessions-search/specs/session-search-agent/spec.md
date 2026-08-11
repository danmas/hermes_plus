## ADDED Requirements

### Requirement: Search all sessions on the selected Hermes target
When scope is **Agent**, the system SHALL query the official dashboard search
endpoint on the **currently selected** `AgentTarget`:

`GET /api/sessions/search?q=<query>`

with the target’s `profile` applied the same way as other session routes
(`?profile=` when the target defines a profile). Authentication SHALL reuse the
existing Hermes client auth for that target.

#### Scenario: Successful search
- **WHEN** the operator submits a non-empty query with Agent scope and the
  target is reachable and authorized
- **THEN** the client MUST call `/api/sessions/search` with that query
- **AND** MUST display returned session hits (at least session id and a title or
  preview when provided by the API)

#### Scenario: Empty query
- **WHEN** the query string is empty or whitespace-only
- **THEN** the system MUST NOT call `/api/sessions/search`
- **AND** MUST show the normal paginated session list for the target (or clear
  search results)

#### Scenario: Auth or network failure
- **WHEN** search returns 401/5xx or the request fails
- **THEN** the UI MUST show an error for that target
- **AND** MUST NOT display a false empty-success state that implies “no matches”

### Requirement: Search is FTS-backed server-side
Agent scope SHALL rely on Hermes server-side search (FTS5), not on downloading
all sessions’ messages and filtering in the browser.

#### Scenario: No full history scan
- **WHEN** Agent scope search runs
- **THEN** the client MUST NOT issue `GET /api/sessions/{id}/messages` for every
  session in the profile as part of computing search results

### Requirement: Open a hit
Choosing a search hit SHALL select that session on the current target (same
behavior as picking a row in the session list) so messages can load in the chat
pane.

#### Scenario: Activate hit
- **WHEN** the operator selects a hit with session id S
- **THEN** the app MUST set the selected session to S on the current agent
