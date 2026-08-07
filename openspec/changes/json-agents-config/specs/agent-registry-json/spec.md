## ADDED Requirements

### Requirement: Agent registry is a declarative JSON file
The system SHALL read the agent inventory from a JSON configuration file
named `agents-config.json` located in the project root directory.
The file SHALL contain a JSON object with an `agents` array of `AgentTarget` objects.
The file SHALL be committed to version control and SHALL NOT contain literal
credentials — only `${ENV_VAR}` placeholders for sensitive values.

#### Scenario: Config file exists and is valid
- **WHEN** `agents-config.json` exists in the project root and contains a valid
  `{ agents: [...] }` structure
- **THEN** the Vite middleware SHALL parse it, expand all `${VAR_NAME}` placeholders
  using environment variables, and return the resolved `FleetConfig` as JSON
- **AND** the response SHALL include all agents from the file

#### Scenario: Config file is missing
- **WHEN** `agents-config.json` does not exist
- **THEN** `GET /api/agents` SHALL return HTTP 404 with an error body
- **AND** the client SHALL fall back to the hardcoded agent list in
  `src/config/agents.ts`
- **AND** the client SHALL log a console warning indicating the fallback is active

#### Scenario: Config file has invalid JSON syntax
- **WHEN** `agents-config.json` contains malformed JSON
- **THEN** `GET /api/agents` SHALL return HTTP 500 with `{ error: "Invalid JSON", details: "<parse error message>" }`
- **AND** the client SHALL fall back to the hardcoded agent list

### Requirement: Environment variable substitution
All string values in the configuration SHALL support `${VAR_NAME}` placeholder
syntax. The system SHALL replace each placeholder with the corresponding
environment variable value at resolution time. Placeholders for which no
environment variable is set SHALL be replaced with an empty string, and a
warning SHALL be logged.

#### Scenario: Placeholder resolves to env value
- **WHEN** `agents-config.json` contains `"password": "${VITE_HERMES_L1_PASSWORD}"`
  and `VITE_HERMES_L1_PASSWORD=secret123` is set in the environment
- **THEN** the resolved config SHALL have `"password": "secret123"`

#### Scenario: Placeholder has no matching env var
- **WHEN** `agents-config.json` contains `"token": "${MISSING_VAR}"`
  and `MISSING_VAR` is not set in the environment
- **THEN** the resolved config SHALL have `"token": ""`
- **AND** a warning SHALL be logged indicating `MISSING_VAR` is not defined

### Requirement: Agent config is served through Vite middleware
The system SHALL expose a `GET /api/agents` HTTP endpoint through Vite's
dev-server middleware. This endpoint SHALL read `agents-config.json`,
apply env-var substitution, validate the result, and return the resolved
`FleetConfig` as JSON. The middleware SHALL NOT require authentication.

#### Scenario: Middleware returns resolved config
- **WHEN** an HTTP GET request is made to `/api/agents`
- **THEN** the response SHALL have status 200 and Content-Type `application/json`
- **AND** the response body SHALL match the `FleetConfig` TypeScript interface:
  `{ agents: AgentTarget[] }`
- **AND** all `${VAR_NAME}` placeholders SHALL be resolved

### Requirement: Agent configuration is validated at load time
Before serving the agent list, the system SHALL validate that:
- Every agent has a unique `id` field
- Every agent has a non-empty `name` field
- Every agent's `auth.type` is one of: `none`, `session-token`, `bearer`, `cookie`
- The `agents` property is an array

#### Scenario: Duplicate agent IDs
- **WHEN** `agents-config.json` contains two agents with the same `id` value
- **THEN** `GET /api/agents` SHALL return HTTP 500
- **AND** the error body SHALL indicate which `id` is duplicated

#### Scenario: Missing required field
- **WHEN** an agent in `agents-config.json` is missing the `name` field
- **THEN** `GET /api/agents` SHALL return HTTP 500
- **AND** the error body SHALL indicate which agent is invalid and which field is missing

#### Scenario: Invalid auth type
- **WHEN** an agent has `auth.type` set to an unrecognized value (e.g., `"oauth"`)
- **THEN** `GET /api/agents` SHALL return HTTP 500
- **AND** the error body SHALL list the valid auth types

### Requirement: Client loads agents asynchronously with fallback
The client SHALL load the agent list by calling `GET /api/agents`. If the
request fails (network error, non-2xx response), the client SHALL use the
hardcoded agent list from `src/config/agents.ts` as a fallback. The fallback
SHALL be transparent to the rest of the application — components receive
an `AgentTarget[]` regardless of the source.

#### Scenario: Successful load from middleware
- **WHEN** the client calls `loadAgentsFromConfig()` and the middleware returns 200
- **THEN** the function SHALL return the parsed `AgentTarget[]` from the response

#### Scenario: Middleware unavailable
- **WHEN** the client calls `loadAgentsFromConfig()` and the request fails
  (network error or non-2xx status)
- **THEN** the function SHALL return `null`
- **AND** `getAgents()` SHALL return the hardcoded `FALLBACK_AGENTS` array
- **AND** a console warning SHALL be emitted

### Requirement: Example config file documents the format
The project SHALL include an `agents-config.json.example` file that:
- Documents every field with inline comments
- Provides an example for each supported auth type
- Explains the `${ENV_VAR}` placeholder mechanism
- Matches the current agent inventory exactly (same 3 agents)

#### Scenario: Example file exists and is complete
- **WHEN** a new developer opens `agents-config.json.example`
- **THEN** they SHALL see all supported fields with descriptions
- **AND** they SHALL see at least one example per auth type (`session-token`, `cookie`)
- **AND** the file SHALL be syntactically valid JSON (JSONC with comments is acceptable
  for the example file only)
