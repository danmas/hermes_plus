## ADDED Requirements

### Requirement: Search skills across the fleet
When scope is **Fleet**, the system SHALL query skills on **multiple**
`AgentTarget` entries from the registry (all targets that are expected to be
reachable via existing proxy/BFF paths), apply the same match rules as Agent
scope per target, and merge results with an agent label.

#### Scenario: Parallel fan-out
- **WHEN** the operator submits a non-empty query with Fleet scope
- **THEN** the client MUST request skills lists for registry targets in parallel
  (or reuse fresh caches)
- **AND** each hit MUST include enough fields to identify the skill and the
  source agent (`agentId`, and display name when available)

#### Scenario: Partial failure
- **WHEN** one target fails (timeout, 401, network) and another succeeds
- **THEN** the UI MUST still show successful hits
- **AND** MUST show a per-target error indicator for failures
- **AND** MUST NOT discard successful hits because of one failure

#### Scenario: Empty query
- **WHEN** the query is empty
- **THEN** Fleet search MUST NOT imply a global full dump is required for MVP
- **AND** the UI SHOULD return to the current agent’s full list (or a clear
  idle state), consistent with sessions fleet search empty-q behavior

### Requirement: Open fleet hit switches agent
Selecting a fleet hit from another agent SHALL switch the active agent to that
target and select the skill so content loads in context of the correct profile.

#### Scenario: Cross-agent open
- **WHEN** a hit is tagged with `agentId` A and skill S
- **AND** the current agent is not A
- **THEN** the app MUST set selected agent to A
- **AND** MUST set selected skill to S

### Requirement: Timeouts
Each target’s list request in Fleet scope SHALL be bounded by a short timeout
(design: 2–3 s) so one hung host cannot block all results indefinitely.

#### Scenario: Slow target
- **WHEN** one target does not respond within the timeout
- **THEN** that target MUST be marked failed/timed out
- **AND** other targets’ hits MUST still appear

### Requirement: No disk scan
Fleet skill search SHALL use only Hermes web-API (or BFF proxy to it), not
local filesystem enumeration of skill directories.

#### Scenario: API-only
- **WHEN** Fleet search runs
- **THEN** the implementation MUST NOT read `skills/**/*.md` from the
  hermes_plus or Hermes home disk as the search data source
