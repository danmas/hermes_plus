## ADDED Requirements

### Requirement: Runnable live demonstration of real session access
The project SHALL provide a runnable demonstration (UI view and/or Node/TS script under
project conventions) that connects to the **live** local Hermes dashboard and shows
real session data for both period-1 targets: `local:projects-ex` and `local:default`.

#### Scenario: Demo lists real sessions for both local agents
- **WHEN** an operator runs the demo with `hermes dashboard` available on :9119
- **THEN** the demo MUST print or render a non-empty session list for `projects-ex`
  OR clearly report zero only if Hermes returns `total=0`
- **AND** MUST do the same for `default`
- **AND** MUST show for each listed row at least `id` and `message_count` (and title
  when Hermes provides it)

### Requirement: Demo reaches the LAN agent over cookie auth
The demonstration SHALL also exercise the LAN agent `l1:default`
(`http://192.168.1.221:9119`), authenticating with password login from environment
variables, and SHALL show real session rows from it.

#### Scenario: Demo lists real sessions for the LAN agent
- **WHEN** an operator runs the demo with the LAN agent reachable and
  `HERMES_L1_USERNAME` / `HERMES_L1_PASSWORD` set
- **THEN** the demo MUST print or render a non-empty session list for `l1:default`
  OR clearly report zero only if Hermes returns `total=0`
- **AND** MUST show at least `id` and `message_count` per row

#### Scenario: Demo fails clearly when LAN credentials missing
- **WHEN** an operator runs the demo without the LAN credentials environment variables
- **THEN** the demo MUST fail with a clear human-readable error naming the missing
  environment variables
- **AND** MUST NOT attempt a fake anonymous success for the LAN target

### Requirement: Demo opens messages of one real session
The demo SHALL allow selecting or auto-picking one session id from a live list and
loading its messages, showing at least message count and the `role` of the first
message(s).

#### Scenario: Messages load for picked session
- **WHEN** the demo picks the first session from the live `projects-ex` list that has
  `message_count` ≥ 1
- **THEN** loading messages MUST succeed
- **AND** the demo MUST report the number of returned messages

### Requirement: Demo fails loudly without Hermes
If Hermes is not running or auth token cannot be obtained, the demo MUST fail with a
clear human-readable error (not an empty success).

#### Scenario: Clear error when dashboard down
- **WHEN** nothing listens on the Hermes API origin and the demo is run
- **THEN** the operator MUST see an explicit failure mentioning connectivity or auth

### Requirement: No committed secrets
The demo MUST NOT require committing session tokens into the git repository.
Token MAY come from live HTML parse or local env.

#### Scenario: Repo has no hardcoded session token
- **WHEN** the period-1 demo source is reviewed
- **THEN** it MUST NOT contain a fixed production/session token string required for operation
