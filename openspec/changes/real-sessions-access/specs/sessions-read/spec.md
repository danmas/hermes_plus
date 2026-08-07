## ADDED Requirements

### Requirement: List sessions for a target with pagination
The system SHALL provide a read API client method that calls
`GET /api/sessions?profile=<profile>&limit=<n>&offset=<m>` (profile omitted only if
target has no profile) and returns structured data including:
`sessions` (array), `total` (number), `limit` (number), `offset` (number).

#### Scenario: First page for projects-ex
- **WHEN** sessions are listed for target `local:projects-ex` with `limit=20` and `offset=0`
- **AND** local Hermes dashboard is running with real data
- **THEN** the response MUST have HTTP 200
- **AND** `sessions.length` MUST be ≤ 20
- **AND** `total` MUST be a number ≥ `sessions.length`
- **AND** at least one session object MUST include `id` and `message_count` fields

#### Scenario: First page for default
- **WHEN** sessions are listed for target `local:default` with `limit=20` and `offset=0`
- **AND** local Hermes dashboard is running with real data
- **THEN** the response MUST have HTTP 200
- **AND** `total` MUST be ≥ 1 when the default profile has historical sessions

#### Scenario: First page for the LAN agent
- **WHEN** sessions are listed for target `l1:default` with `limit=20` and `offset=0`
- **AND** the LAN agent is reachable and a cookie session has been established
- **THEN** the response MUST have HTTP 200
- **AND** the envelope MUST contain `sessions`, `total`, `limit`, `offset`
- **AND** `total` MUST be ≥ 1 when that agent has historical sessions

### Requirement: Session list items expose operator-useful fields
Each session in the list SHALL be usable in a UI/list demo with at least:
`id`, and when present from Hermes: `title` or `display_name`, `model`,
`message_count`, `source`, and activity timestamps if provided by API.

#### Scenario: Display fields available for a known live session
- **WHEN** the first page of `projects-ex` sessions is loaded against live Hermes
- **THEN** at least one session MUST have a non-empty `id`
- **AND** the client MUST be able to read `message_count` without throwing

### Requirement: Load messages for a selected session
The system SHALL provide a read API client method that calls
`GET /api/sessions/{id}/messages?profile=<profile>` and returns a structure including
`session_id` and `messages` (array). Optional `pagination` MUST be accepted if present.

#### Scenario: Messages for a real projects-ex session
- **WHEN** a valid session `id` from the projects-ex list is requested for messages
- **THEN** the response MUST have HTTP 200
- **AND** `messages` MUST be an array
- **AND** when the session has history, `messages.length` MUST be ≥ 1
- **AND** at least one message MUST include a `role` field

### Requirement: Sessions read works uniformly across auth mechanisms
The sessions-read layer SHALL expose the same method surface for `session-token` and
`cookie` targets, so that callers do not branch on auth mechanism. The mechanism
difference MUST be contained inside the client/transport layer.

#### Scenario: Same call shape for local and LAN targets
- **WHEN** a caller lists sessions for `local:projects-ex` and then for `l1:default`
- **THEN** both calls MUST use the same client method signature
- **AND** each MUST apply its own target auth mechanism internally

### Requirement: Errors are observable per target
The sessions-read layer SHALL surface an explicit error status or message for a target
when Hermes is offline, auth fails, or the profile is invalid, and MUST NOT crash the
whole process because of a single target failure.

#### Scenario: Offline Hermes yields explicit failure
- **WHEN** Hermes dashboard is not reachable on the configured origin
- **THEN** the sessions list operation MUST fail with an explicit error
- **AND** MUST NOT return a fake non-empty sessions array

### Requirement: Read-only in period-1
Period-1 sessions access SHALL be read-only. The system MUST NOT implement
rename, delete, bulk-delete, or import of sessions as part of this change.

#### Scenario: No mutation methods required
- **WHEN** period-1 sessions-read capability is complete
- **THEN** successful acceptance criteria MUST be satisfiable using only GET endpoints
  for sessions list and messages
