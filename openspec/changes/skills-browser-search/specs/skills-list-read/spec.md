## ADDED Requirements

### Requirement: List skills for a target
The system SHALL provide a client method that calls Hermes
`GET /api/skills` (with `?profile=` when the `AgentTarget` defines a profile)
using the same auth transport as sessions-read for that target, and returns a
list of skill objects.

#### Scenario: List on local projects-ex
- **WHEN** skills are listed for a local target with profile `projects-ex`
- **AND** Hermes dashboard is running and authorized
- **THEN** the response MUST be HTTP 200
- **AND** the client MUST obtain an array of skills (possibly empty)
- **AND** when the profile has installed skills, `length` MUST be ≥ 1
- **AND** at least one item MUST expose a non-empty `name` (or equivalent id field documented after live-probe)

#### Scenario: List on LAN cookie target
- **WHEN** skills are listed for a cookie-auth target (e.g. `l1:default`)
- **AND** cookie session has been established
- **THEN** the response MUST be HTTP 200
- **AND** the method signature MUST match the local target call (auth differences internal)

### Requirement: Skill list items expose operator-useful fields
Each skill in the list SHALL be usable in a UI row with at least a stable
identifier (`name` and/or `path`) and, when provided by Hermes: `description`,
`enabled`, `category`.

#### Scenario: Display fields
- **WHEN** the skills list is loaded against live Hermes with at least one skill
- **THEN** the UI MUST be able to render a title from `name` (or path basename)
- **AND** MUST tolerate missing optional fields without throwing

### Requirement: Envelope normalization
If Hermes returns a non-array envelope for the skills list, the client SHALL
normalize it to an array for callers so UI code does not branch on shape.

#### Scenario: Array or envelope
- **WHEN** the raw body is a JSON array
- **THEN** the client MUST return that array
- **WHEN** the raw body is an object with a skills array field (if discovered live)
- **THEN** the client MUST return that array
- **AND** MUST NOT return a fake non-empty list on parse failure

### Requirement: Errors are observable per target
The skills-list layer SHALL surface an explicit error when Hermes is offline,
auth fails, or the profile is invalid, and MUST NOT crash the app because of a
single target failure.

#### Scenario: Offline Hermes
- **WHEN** the target origin is not reachable
- **THEN** the list operation MUST fail with an explicit error
- **AND** MUST NOT present a silent empty success as “no skills”

### Requirement: Read-only period-1 for list
Period-1 skills list SHALL be read-only. The system MUST NOT require
create/toggle/delete endpoints for acceptance.

#### Scenario: GET-only acceptance
- **WHEN** skills-list-read is accepted
- **THEN** criteria MUST be satisfiable using only GET for listing skills
