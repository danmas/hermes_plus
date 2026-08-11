## ADDED Requirements

### Requirement: Load skill content by reference
The system SHALL provide a client method that calls Hermes
`GET /api/skills/content` with the query parameters required by the live API
(determined by live-probe: e.g. skill `name` and/or `path` and `profile`) and
returns the skill body as text (or structured content if Hermes returns JSON
with a text field).

#### Scenario: Content for a listed skill
- **WHEN** the operator selects a skill that appears in the list for the current target
- **AND** the client requests content with the correct reference fields
- **THEN** the response MUST be HTTP 200
- **AND** the UI MUST receive a non-empty body when the skill file exists
- **AND** the body MUST be displayable as text/markdown in a read-only viewer

#### Scenario: Missing skill
- **WHEN** content is requested for a non-existent skill name/path
- **THEN** the client MUST surface an explicit error or empty state
- **AND** MUST NOT show another skill’s body

### Requirement: Same auth surface as list
Content fetch SHALL use the same `HermesClient` / auth / profile / proxyPath
rules as `getSkills()` for that target.

#### Scenario: Local and LAN
- **WHEN** content is loaded for `local:projects-ex` and for a cookie LAN target
- **THEN** both MUST use the same client method signature
- **AND** each MUST apply its own auth mechanism internally

### Requirement: Cache and reselect
The UI layer SHOULD cache content per `(agentId, skillKey)` so re-selecting the
same skill does not always re-fetch, while still allowing manual refresh.

#### Scenario: Reselect uses cache
- **WHEN** skill A content was loaded successfully
- **AND** the operator selects skill B then skill A again within the cache TTL
- **THEN** the viewer MAY show A without a second network request
- **AND** a refresh action MUST force a new GET if implemented

### Requirement: Read-only viewer
Period-1 content view SHALL be read-only. The system MUST NOT expose save/edit
controls for skill content in this change.

#### Scenario: No edit controls required
- **WHEN** skill-content-read is complete
- **THEN** acceptance MUST not depend on PUT `/api/skills/content` or create APIs
