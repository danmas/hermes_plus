## ADDED Requirements

### Requirement: Copy is non-destructive on source
Copy SHALL NOT delete, uninstall, or modify the skill on the source agent.

#### Scenario: Source intact
- **WHEN** copy A→B succeeds
- **THEN** skill still exists on A under the same name

### Requirement: Full-file export via filesystem API
Export SHALL build a SkillPackage by reading the skill directory tree using
Hermes filesystem APIs (`/api/fs/list`, `/api/fs/read-text`, and binary read if
allowed), not only `GET /api/skills/content`.

#### Scenario: Multi-file export
- **WHEN** source skill has SKILL.md plus at least one nested file
- **THEN** the package MUST contain both (subject to deny-list and size policy)

### Requirement: Create-mode import only (MVP)
Import SHALL create a new skill on the target. Overwrite of an existing skill
name is out of MVP.

#### Scenario: Name free
- **WHEN** target has no skill with the chosen name
- **THEN** import MUST create the skill and write all package files under its root

#### Scenario: Name taken
- **WHEN** target already has that name
- **THEN** import MUST NOT overwrite
- **AND** the operator MUST choose cancel or a new name (rename)

### Requirement: Export before target writes
The system SHALL finish export (full package in BFF memory/response) before any
create/write on the target.

#### Scenario: Export fails
- **WHEN** export fails
- **THEN** no skill MUST be created on the target

### Requirement: Cross-host via BFF
Source and target MAY be different hosts/profiles. Browser SHALL call hermes_plus
BFF; upstream credentials stay server-side.

#### Scenario: Local to LAN
- **WHEN** operator copies to a LAN AgentTarget
- **AND** BFF can auth both sides
- **THEN** the skill MUST appear on the LAN target after successful import

### Requirement: User skills default sources
Default copy sources are user/agent skills. Stock/hub are not default drag sources.

### Requirement: Operator auth
BFF export/import require a valid hermes_plus operator session.

#### Scenario: No session
- **WHEN** unauthenticated
- **THEN** 401/403 and no package body
