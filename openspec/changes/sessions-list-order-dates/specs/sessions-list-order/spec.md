## ADDED Requirements

### Requirement: Sessions list is newest-first
The sessions list UI SHALL present sessions ordered from newest to oldest,
using `started_at` as the primary key (descending). Sessions without
`started_at` SHALL appear after those with a timestamp. Equal timestamps
SHALL be ordered by `id` descending.

#### Scenario: Mixed timestamps on one page
- **WHEN** the API returns a page containing sessions A, B, C with
  `started_at` values 100, 300, 200 respectively
- **THEN** the rendered order MUST be B, C, A (300, 200, 100)

#### Scenario: Missing started_at
- **WHEN** a session has no `started_at` and others have numeric `started_at`
- **THEN** the session without `started_at` MUST appear after all dated sessions
  on that page

### Requirement: Prefer server-side order when available
The client SHALL pass server-side ordering query parameters if live Hermes accepts a query parameter requesting newest-first ordering on `GET /api/sessions`, in addition to `limit` and `offset`. The chosen parameter names MUST be recorded in project KB after verification.

#### Scenario: No supported order parameter
- **WHEN** live probe shows no working order/sort query parameter
- **THEN** the client MUST still satisfy newest-first via client-side sort of
  the returned page
- **AND** MUST NOT fail the list request due to absence of sort params

### Requirement: Sort does not break pagination controls
Applying newest-first ordering MUST NOT change `limit`/`offset` request shape
or the meaning of `total` from the API envelope.

#### Scenario: Next page
- **WHEN** the operator moves from offset 0 to offset = PAGE_SIZE
- **THEN** the client MUST request the next page with the same limit
- **AND** MUST apply the same newest-first rule to the new page’s `sessions`
