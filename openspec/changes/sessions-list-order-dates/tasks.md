# Tasks: sessions-list-order-dates

## 1. Live probe (sort API)

- [x] 1.1 Against running Hermes `:9119`, try `GET /api/sessions` with candidate
      params (`sort`, `order`, `order_by`, values `started_at` / `desc`)
- [x] 1.2 Record working params or “none” in `KB/README_SURVEY.md`
- [x] 1.3 Confirm unit of `started_at` (ms vs sec) on live payload

## 2. Client order

- [x] 2.1 Add pure `sortSessionsNewestFirst(sessions: HermesSession[])`
- [x] 2.2 Apply after fetch in `_SessionList` before render
- [x] 2.3 If server param works — pass from `getSessions` / client

## 3. Date on cards

- [x] 3.1 Add `formatSessionWhen(ts: number): { label: string; title: string }`
      (handle sec vs ms if needed)
- [x] 3.2 Card footer: `started_at` → else `ended_at` → else `—`
- [x] 3.3 Same-day sessions show distinct times
- [x] 3.4 Set `title` on date element for full absolute time

## 4. Verification

- [x] 4.1 Visual: newest session near top of first page (or within-page DESC)
- [x] 4.2 Card shows date+time, not raw epoch
- [x] 4.3 Session without dates still lists without crash
- [x] 4.4 `npm run build` clean

## 5. OpenSpec hygiene

- [x] 5.1 CHANGELOG when implemented
- [ ] 5.2 Archive change after accept
