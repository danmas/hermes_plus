## ADDED Requirements

### Requirement: Canonical SkillPackage format
The system SHALL represent a transferable skill as a **SkillPackage** with:
`version`, `name`, `files[]` (each with `relativePath`, `content`, `encoding`),
and `files` MUST include `SKILL.md`.

#### Scenario: Minimal valid package
- **WHEN** a skill contains only `SKILL.md`
- **THEN** `files.length` MUST be 1
- **AND** that entry MUST be the skill markdown file
- **AND** `name` MUST be non-empty

#### Scenario: Multi-file package
- **WHEN** the skill root contains additional regular files
- **THEN** export MUST include them as relative paths under the skill root
- **AND** paths MUST NOT contain `..` or be absolute

### Requirement: Path safety
Import/export validation SHALL reject unsafe `relativePath` values.

#### Scenario: Traversal rejected
- **WHEN** any file entry contains `..` in `relativePath`
- **THEN** validation MUST fail and import MUST NOT write

### Requirement: Completeness
A transfer MUST NOT be reported as successful full copy if the source tree had
more regular files than the package (except explicit allow-listed skips such as
denied sensitive basenames, which MUST be listed in the error or meta).

#### Scenario: Incomplete package blocked
- **WHEN** export discovers N transferable files but package has fewer without documented skip
- **THEN** export MUST fail and import MUST NOT start
