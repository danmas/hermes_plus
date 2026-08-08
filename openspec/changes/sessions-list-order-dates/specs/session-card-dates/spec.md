## ADDED Requirements

### Requirement: Session card shows an activity timestamp
Each session card in the list SHALL show a human-readable time derived from
Hermes session fields. Primary field is `started_at`; if absent, `ended_at`;
if both absent, an em dash or equivalent placeholder.

#### Scenario: started_at present
- **WHEN** a session has numeric `started_at`
- **THEN** the card footer (or equivalent meta row) MUST display a formatted
  value based on that timestamp
- **AND** MUST NOT show only the raw unix number

#### Scenario: only ended_at present
- **WHEN** `started_at` is missing and `ended_at` is a number
- **THEN** the card MUST display a formatted value based on `ended_at`

#### Scenario: no timestamps
- **WHEN** both `started_at` and `ended_at` are missing
- **THEN** the card MUST show a clear empty placeholder (e.g. `—`)
- **AND** MUST NOT throw

### Requirement: Date format includes time for same-day recency
The displayed format SHALL include time-of-day when useful for distinguishing
sessions on the same calendar day (not date-only `toLocaleDateString()` alone).

#### Scenario: Two sessions same day
- **WHEN** two sessions share the same local calendar day but different hours
- **THEN** their displayed labels MUST differ (time component present)
  so the operator can tell which is later without opening the session

### Requirement: Full timestamp available on hover when shortened
The element SHALL expose the full timestamp via `title` or accessible name (ISO-8601 or locale full string) if the visible label is shortened (relative or date-only compact form).

#### Scenario: Hover title
- **WHEN** the visible date label is rendered for a session with `started_at`
- **THEN** the date element MUST provide a fuller absolute timestamp for hover
  or accessibility when the visible form omits timezone or seconds
