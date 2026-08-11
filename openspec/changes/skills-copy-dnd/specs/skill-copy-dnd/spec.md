## ADDED Requirements

### Requirement: DnD is primary copy UX
The operator SHALL be able to start copy by dragging a user skill row onto a
different fleet agent card (HTML5 DnD and/or shared drag context).

#### Scenario: Drop on other agent
- **WHEN** user skill is dropped on another agent card
- **THEN** export→import pipeline MUST start for that pair
- **AND** progress MUST be visible until terminal success/failure

#### Scenario: Same agent
- **WHEN** drop target equals source agent
- **THEN** no duplicate create; no-op or short message

### Requirement: Drag sources and drop targets
User skill rows are draggable; stock skills are not (MVP). Fleet cards for other
agents are valid drop targets and MUST show highlight when drag is over them.

### Requirement: Shared drag state
The UI SHALL use an application-level dragging skill context in addition to
`dataTransfer`, so drops work across separately scrolling panes.

### Requirement: In-flight guard
Concurrent duplicate imports for the same `(targetAgentId, skillName)` MUST be
rejected or serialized (BFF lock preferred; UI lock alone is insufficient).

### Requirement: Outcome feedback
Success MUST refresh/invalidate target skills list. Failure MUST show error and
whether cleanup ran.
