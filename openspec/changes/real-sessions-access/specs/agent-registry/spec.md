## ADDED Requirements

### Requirement: Agent target is the routing unit
The system SHALL model each Hermes agent access point as an `AgentTarget` with at least:
`id` (unique string), `name`, `baseUrl`, optional `profile`, and `auth` descriptor.
The `auth` descriptor SHALL express at least the mechanism kind
(`none` | `session-token` | `cookie`) so that one registry can hold both loopback
token-based agents and gated password-protected agents.

#### Scenario: Three period-1 targets exist
- **WHEN** the agent registry is loaded in period-1 configuration
- **THEN** it MUST include targets `local:projects-ex` (profile `projects-ex`) and
  `local:default` (profile `default`)
- **AND** it MUST include target `l1:default` for the LAN agent with profile `default`
- **AND** the two local targets MUST use empty `baseUrl` meaning same-origin requests via
  the Vite dev proxy to the local Hermes dashboard

#### Scenario: LAN target declares cookie auth and its own origin
- **WHEN** the registry entry `l1:default` is loaded
- **THEN** its auth kind MUST be `cookie`
- **AND** it MUST resolve to the Hermes dashboard at `http://192.168.1.221:9119`
  (directly or through a dedicated proxy path)
- **AND** it MUST NOT contain literal credentials in source

### Requirement: Registry is explicit, not auto-discovery
The system SHALL treat the agent inventory as an explicit configuration list.
The system MUST NOT require network scanning or auto-discovery of Hermes instances
for period-1 operation.

#### Scenario: Unknown hosts are not invented
- **WHEN** only the period-1 registry file/config is present
- **THEN** the system MUST expose only configured targets
- **AND** MUST NOT invent remote `baseUrl` values

### Requirement: Profile is applied per request scope
For a target with a non-empty `profile`, the system SHALL scope Hermes REST calls with
query parameter `profile=<name>`.

#### Scenario: projects-ex profile on sessions list
- **WHEN** the client lists sessions for `local:projects-ex`
- **THEN** the HTTP request MUST include `profile=projects-ex`
