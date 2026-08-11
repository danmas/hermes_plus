## ADDED Requirements

### Requirement: Search inside the selected skill content
When scope is **Skill** (in-skill), the system SHALL search within the content
of the **currently selected** skill only (client-side filter over loaded text).

#### Scenario: Match in body
- **WHEN** a skill is selected and its content is loaded
- **AND** the operator submits a non-empty query with Skill scope
- **THEN** the UI MUST find case-insensitive substring matches in the content
- **AND** MUST highlight or otherwise mark at least the first match
- **AND** MUST allow navigation to the match (scroll into view)

#### Scenario: Content not yet loaded
- **WHEN** Skill scope search runs but content is not in memory
- **THEN** the system MUST load content via the skill-content-read method first
- **AND** then apply the filter

#### Scenario: No skill selected
- **WHEN** no skill is selected (or only a placeholder)
- **THEN** Skill scope MUST be disabled or show a clear message that a skill
  must be selected
- **AND** MUST NOT search other skills’ bodies

### Requirement: Empty query restores content view
When the in-skill query is cleared, the viewer SHALL show the full content
without match filters.

#### Scenario: Clear query
- **WHEN** the operator clears the search box in Skill scope
- **THEN** the content viewer MUST show the unfiltered skill body

### Requirement: Do not use sessions FTS for skills
In-skill search MUST NOT call `/api/sessions/search` or session message APIs.

#### Scenario: No session endpoints
- **WHEN** Skill scope search runs
- **THEN** the client MUST NOT issue session search or sessions list requests
  as part of computing skill content matches
