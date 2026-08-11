## ADDED Requirements

### Requirement: Create-mode cleanup on failure (MVP)
If import creates a new skill and later fails, the system SHALL attempt to remove
that skill’s files/registration from the **target** only.

#### Scenario: Partial write
- **WHEN** create succeeded and a later file write fails
- **THEN** cleanup MUST run on the target
- **AND** overall result MUST be failure (not success)
- **AND** source MUST remain unchanged

#### Scenario: Export-only failure
- **WHEN** no target writes occurred
- **THEN** cleanup is a no-op and target is unchanged

### Requirement: No overwrite rollback in MVP
Backup package, restore-on-overwrite-fail, and staging rename are **out of MVP**.
Overwrite mode is not offered.

#### Scenario: Existing name
- **WHEN** target already has the skill name
- **THEN** the system MUST NOT enter a destructive overwrite path in this change

### Requirement: Post-verify before success
Before reporting success, the system SHOULD verify target file set against the
package (e.g. recursive `fs/list` count/names). Mismatch MUST fail and trigger
create-mode cleanup.

### Requirement: Cleanup failure is explicit
If cleanup fails after a failed import, the UI MUST state that manual inspection
of the target skill may be required.
