## ADDED Requirements

### Requirement: Search skills on the selected agent
When scope is **Agent**, the system SHALL search skills belonging to the
**currently selected** `AgentTarget` only.

#### Scenario: Metadata filter (MVP default)
- **WHEN** the operator submits a non-empty query with Agent scope
- **AND** the skills list for the target is available (or is fetched once)
- **THEN** the UI MUST show only skills whose `name`, `description`, `path`, or
  `category` (when present) match the query (case-insensitive substring)
- **AND** MUST NOT require a separate FTS endpoint for MVP acceptance

#### Scenario: Empty query
- **WHEN** the query is empty or whitespace-only
- **THEN** the system MUST show the full skills list for the current target
- **AND** MUST NOT show a false “no matches” empty state

#### Scenario: No full fleet scan
- **WHEN** Agent scope search runs
- **THEN** the client MUST NOT call `getSkills` for other registry targets as
  part of that search

### Requirement: Prefer server search if available
If live-probe confirms a Hermes endpoint equivalent to
`GET /api/skills/search?q=...`, Agent scope SHALL prefer that endpoint and
MUST fall back to client-side metadata filter when the endpoint is missing
(404) or disabled.

#### Scenario: Fallback when search endpoint absent
- **WHEN** server skill-search returns 404 or is not implemented
- **THEN** the client MUST use list + local filter
- **AND** the UI MAY indicate that filtering is local

### Requirement: Open a hit
Choosing a search hit SHALL select that skill on the current target so content
can load in the detail viewer (same as picking a list row).

#### Scenario: Activate hit
- **WHEN** the operator selects a hit for skill name/path S
- **THEN** the app MUST set the selected skill to S on the current agent

### Requirement: Errors
Auth or network failure while loading the list for search SHALL show an error
and MUST NOT look like “zero skills matched”.

#### Scenario: Auth failure
- **WHEN** `getSkills` returns 401
- **THEN** the UI MUST show an error for the target
- **AND** MUST NOT display only an empty results list without error
