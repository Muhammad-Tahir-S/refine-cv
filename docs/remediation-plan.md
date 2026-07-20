# Remediation plan

Baseline commit: `c56f8b75c641c4a7c6b34dc4161a6247a5d3ea20`

Baseline verification on 20 July 2026:

- `pnpm test`: pass (12 tests)
- `pnpm typecheck`: fail (`discover-linkedin.ts` passes unsupported `keywords`)
- `pnpm build`: fail (same TypeScript error)
- `git diff --check`: pass

Each phase is implemented and verified independently, then committed before the
next phase begins.

## Progress

- [x] Phase 0: establish and record the baseline
- [x] Phase 1: restore build and LinkedIn CLI integrity
- [x] Phase 2: introduce executable search policies
- [x] Phase 3: separate profile and job lifecycle state
- [x] Phase 4: make persistence transactional
- [x] Phase 5: harden HTTP and polling behavior
- [x] Phase 6: repair identity, dedupe, and provenance
- [x] Phase 7: fix and optimize board adapters
- [x] Phase 8: improve reports and observability
- [x] Phase 9: repair GitHub evidence semantics
- [ ] Phase 10: harden CV rendering
- [ ] Phase 11: add effectiveness improvements
- [ ] Phase 12: complete quality, privacy, and operational gates

## Phase gates

### Phase 1

- LinkedIn CLI and library option contracts agree.
- Keywords, experience levels, output path, alternate config, role profile, and
  isolated state behave as advertised.
- Typecheck, build, tests, and whitespace checks pass.

### Phase 2

- Search configuration compiles into an explicit typed policy.
- React/frontend and Node.js/backend profiles have tested role filters.
- Configured levels and geo options affect runtime behavior.
- Reports serialize the same effective policy used by filtering.

### Phase 3

- Seen state is profile-aware.
- New, seen, applied, dismissed, and expired states are distinct.
- Original `firstSeenAt` and `appliedAt` values are preserved.
- State schemas have tested migrations.

### Phase 4

- State and artifacts use atomic writes.
- Artifacts become durable before state advances.
- Runs have unique identifiers and do not overwrite prior reports.
- Interrupted writes and concurrent runs are handled safely.

### Phase 5

- HTTP requests have timeouts and bounded retries.
- `Retry-After` and source polling intervals are respected.
- Source poll state and timings are recorded.
- A total source outage returns a failing exit status.

### Phase 6

- Listings are deduplicated within and across sources.
- Canonical identity does not destroy case-sensitive paths or meaningful query
  parameters.
- Merged jobs retain all source provenance.
- Configured source IDs and adapter IDs remain distinct.

### Phase 7

- Remote OK metadata and real jobs are distinguished correctly.
- Quarantine reasons are retained.
- Source-specific configuration is either implemented or removed.
- All seven adapters have representative fixture tests.

### Phase 8

- Every run writes a versioned manifest with commit, config, policy, source,
  timing, polling, filtering, and quarantine metadata.
- Reports include required attribution and safe output escaping.
- Output names and counts accurately describe their contents.

### Phase 9

- GitHub refreshes preserve a complete evidence snapshot and separate deltas.
- Commits and pull requests merge by stable identifiers.
- Watermarks advance only after durable output writes.
- Repeated incremental refreshes do not lose historical evidence.

### Phase 10

- Renderer metadata markers are explicit.
- Unsupported Markdown produces diagnostics instead of silent loss.
- Parser, HTML, and extracted-PDF text are covered by tests.
- Internal evidence metadata cannot leak into submission assets.

### Phase 11

- Relevance, geo confidence, and freshness are explainable scores.
- Expired listings and application outcomes are tracked.
- Source yield and false-positive rates can be measured.
- Ranking does not alter evidence truth or hard eligibility rules.

### Phase 12

- Tests cover pipeline, state, geo, filters, adapters, rendering, and evidence
  refresh.
- CI runs install, typecheck, tests, build, and repository checks.
- Setup validation covers job scanning.
- Privacy/release safeguards exist.
- Node and browser-install guidance is consistent.
- Stale ATS documentation and artifacts are removed or archived.
