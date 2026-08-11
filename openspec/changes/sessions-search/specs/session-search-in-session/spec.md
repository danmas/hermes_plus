## ADDED Requirements

### Requirement: Search within the selected session
When scope is **Session** and a real session is selected (not `new` / null), the
system SHALL allow the operator to enter a non-empty query and see messages from
that session whose text matches the query (case-insensitive substring match over
message `content` and stringified `tool_calls` when present).

#### Scenario: Match in loaded messages
- **WHEN** the selected session’s messages are loaded and at least one message
  contains the query string in `content`
- **THEN** the UI MUST list or highlight those matching messages
- **AND** MUST NOT call `GET /api/sessions/search` solely for this scope

#### Scenario: Messages not yet loaded
- **WHEN** scope is Session, a session id is selected, and messages are not in
  client state
- **THEN** the system MUST load messages via the existing session messages API
  before applying the filter
- **AND** MUST surface load errors without pretending zero matches on failure

#### Scenario: No session selected
- **WHEN** no session is selected or the selection is the draft `new` session
- **THEN** Session scope MUST be unavailable or MUST show a clear prompt to
  select a session
- **AND** MUST NOT issue a fleet or agent-wide search under Session scope

### Requirement: Navigate to a match in-session
Selecting a match within Session scope SHALL focus that message in the chat /
transcript view (scroll into view or equivalent).

#### Scenario: Click match
- **WHEN** the operator activates a match result for message index or id M
- **THEN** the transcript MUST bring message M into view if it is rendered
