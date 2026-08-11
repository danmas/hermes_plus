## ADDED Requirements

### Requirement: Search across all registered agents
When scope is **Fleet**, the system SHALL run the same session search capability
as Agent scope against **each** `AgentTarget` in the fleet registry that the
client can reach, in parallel where practical, and present a combined result
list.

#### Scenario: Two targets return hits
- **WHEN** fleet search runs with query Q and targets A and B both return at
  least one hit
- **THEN** the combined UI MUST show hits from both A and B
- **AND** each hit MUST be labeled with enough identity to know which agent /
  profile it came from (e.g. agent id or display name)

#### Scenario: One target fails
- **WHEN** target A succeeds and target B fails (network or 401)
- **THEN** hits from A MUST still be shown
- **AND** the failure of B MUST be visible (per-target error or summary)
- **AND** the overall operation MUST NOT be presented as total success with
  zero explanation

### Requirement: Fleet search does not require parsing remote state.db
Fleet aggregation SHALL only use HTTP(S) session search (and existing auth /
proxy paths). The system MUST NOT SSH or read `state.db` files on remote hosts
to implement fleet search.

#### Scenario: Thin client only
- **WHEN** fleet search is executed
- **THEN** each target contribution MUST go through the Hermes web API search
  route (or BFF proxy to that route)

### Requirement: Reachability limits are explicit
If some registry targets are not reachable from the browser without a BFF
(CORS, loopback-only bind), the UI SHALL only query reachable targets in MVP
and SHOULD indicate that other agents were skipped.

#### Scenario: Unreachable target skipped
- **WHEN** a target has no working baseUrl/proxy from the current UI runtime
- **THEN** fleet search MAY skip it
- **AND** MUST not silently claim that agent was fully searched if it was skipped

### Requirement: Activate fleet hit switches agent context
Selecting a hit from another agent SHALL switch the active `AgentTarget` to
that hit’s agent and select the session id, then load messages as usual.

#### Scenario: Cross-agent open
- **WHEN** the operator activates a hit belonging to agent Z while agent Y is
  selected
- **THEN** the active agent MUST become Z
- **AND** the selected session MUST become the hit’s session id
