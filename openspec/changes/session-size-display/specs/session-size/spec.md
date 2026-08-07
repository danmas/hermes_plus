## ADDED Requirements

### Requirement: Format byte sizes for display
The system SHALL provide a pure helper that formats a non-negative byte count
into a short human-readable string using binary units (B, KB, MB).

#### Scenario: Small payload
- **WHEN** `formatBytes` is called with `800`
- **THEN** the result MUST be a string containing `B` (e.g. `800 B`)

#### Scenario: Kilobyte payload
- **WHEN** `formatBytes` is called with `19000`
- **THEN** the result MUST use KB units with at most one fractional digit
  (e.g. `18.6 KB`)

#### Scenario: Megabyte payload
- **WHEN** `formatBytes` is called with `1500000`
- **THEN** the result MUST use MB units (e.g. `1.43 MB`)

### Requirement: Compute session payload size from messages
The system SHALL provide a pure helper `sessionPayloadSize(messages)` that,
given the `messages` array from `GET /api/sessions/{id}/messages`, returns at
least:
- `chars` (number) — aggregate text weight of `content` strings and serialized
  `tool_calls` when present;
- `bytes` (number) — UTF-8 byte length of `JSON.stringify(messages)`;
- `approxTokens` (number) — `round(chars / 4)` for UI only.

#### Scenario: Empty session
- **WHEN** `sessionPayloadSize` is called with `[]`
- **THEN** `chars`, `bytes`, and `approxTokens` MUST all be `0`

#### Scenario: Session with text content
- **WHEN** messages contain at least one item with non-empty string `content`
- **THEN** `chars` MUST be ≥ that content length
- **AND** `bytes` MUST be ≥ `chars`

#### Scenario: Tool calls contribute to size
- **WHEN** a message includes a non-empty `tool_calls` array
- **THEN** `chars` MUST increase relative to the same message without `tool_calls`

### Requirement: List view shows message_count without fetching messages
The sessions list UI SHALL display `message_count` from the list DTO for each
row and MUST NOT call `GET /api/sessions/{id}/messages` solely to populate a
size column for every visible row.

#### Scenario: Paginated list render
- **WHEN** the operator opens the sessions list for a target with `limit=20`
- **THEN** each rendered row that has `message_count` from Hermes MUST show that
  count
- **AND** the client MUST NOT issue one messages request per listed session id
  as part of initial list render

### Requirement: Optional list size badge only from list DTO fields
The system SHALL NOT invent list-row byte sizes by downloading full message histories, and MAY render a size badge only if the session object from `GET /api/sessions` already includes a numeric size or token field provided by Hermes (e.g. `bytes`, `size`, `total_tokens`).

#### Scenario: No size field on list item
- **WHEN** a list session object has `message_count` but no recognized size field
- **THEN** the list row MUST still render using `message_count`
- **AND** MUST NOT block or error due to missing size

### Requirement: Open session shows computed payload size
The UI SHALL show a human-readable payload size derived from `sessionPayloadSize` (primary: formatted `bytes`) after messages for the selected session have been loaded successfully.

#### Scenario: Open non-empty session
- **WHEN** the operator selects a session that returns at least one message
- **AND** messages have finished loading without error
- **THEN** the session header or chat meta area MUST show a formatted byte size
  (via `formatBytes`)
- **AND** MAY show approximate tokens labeled as approximate

#### Scenario: Heavy session warning
- **WHEN** computed `bytes` exceed the configured heavy threshold (default
  500000)
- **THEN** the UI MUST surface a non-blocking visual hint that the session is
  large

### Requirement: Size helpers remain pure and testable
`formatBytes` and `sessionPayloadSize` SHALL be pure functions with no network
I/O and no dependency on React lifecycle, so they can be unit-tested without
Hermes running.

#### Scenario: Deterministic compute
- **WHEN** `sessionPayloadSize` is called twice with the same messages array
  reference content
- **THEN** both results MUST be deeply equal for `chars`, `bytes`, and
  `approxTokens`
