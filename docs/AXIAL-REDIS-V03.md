# AXIAL NETWORK v0.3 — Redis Streams

## Scope

This document describes the v0.3 transport implementation on the review branch. It does not mean the branch has been merged or deployed.

The existing Messenger Worker contract is preserved. The webhook verifies Meta's HMAC signature and durably enqueues a canonical event before returning HTTP 200. On Vercel it schedules the Worker dispatch with `waitUntil()` from `@vercel/functions`, so Kernel Axial and Graph API do not delay Meta's webhook acknowledgment. The Worker reads from a Redis Stream Consumer Group, passes valid Messenger events through Kernel Axial, sends the response, and acknowledges the stream entry only after the send succeeds. `waitUntil()` is still subject to the Function's maximum duration; it is not a durable scheduler.

## Redis key layout

All keys are scoped by environment. The braces around the environment are a literal Redis Cluster hash tag, so every key touched by the same multi-key Lua operation is assigned to the same hash slot:

- \`axial:{env}:messenger:events:inbound:v1\` — inbound event Stream.
- \`axial:{env}:messenger:events:dlq:v1\` — dead-letter Stream.
- \`axial:{env}:messenger:workers:v1\` — Consumer Group.
- \`axial:{env}:messenger:dedupe:v1:{sha256(eventId)}\` — idempotency marker.
- \`axial:{env}:messenger:retry-counts:v1\` — failure count by eventId.
- \`axial:{env}:messenger:retry-meta:v1\` — last failure and due-time metadata.
- \`axial:{env}:messenger:retry-schedule:v1\` — sorted set of due retries.
- \`axial:{env}:messenger:retry-payloads:v1\` — event payloads waiting for retry.
- \`axial:{env}:messenger:dlq-dedupe:v1:{sha256(eventId)}\` — idempotent DLQ transfer marker.

Environment selection order is \`AXIAL_ENV\`, \`VERCEL_ENV\`, then \`NODE_ENV\`. Set \`AXIAL_ENV\` explicitly when multiple deployments share a Redis database.

## Delivery and recovery

1. The webhook derives a deterministic event identifier from the Meta message ID when present; otherwise it hashes the serialized event.
2. An atomic Lua script checks the idempotency key and appends the event only once.
3. The Worker reads fresh events with \`XREADGROUP\`.
5. Pending entries abandoned by a crashed invocation can be reclaimed with \`XAUTOCLAIM\` after \`AXIAL_STREAM_MIN_IDLE_MS\` (default: 60 seconds).
6. Successful Messenger sends are acknowledged. Acknowledged inbound entries are deleted from the Stream so the active Stream does not grow indefinitely.
7. On a processing or send failure, one Lua script increments the attempt count, stores the due time and payload, schedules the retry in a sorted set, acknowledges the failed delivery, and removes the old Stream entry.
8. Before reading new events, the queue atomically republishes due retries to the inbound Stream.
9. After five failed attempts by default, the event is copied to the DLQ with an idempotency marker and removed from the inbound Stream.

The default delay starts at 5 seconds and doubles per failed attempt, capped at 5 minutes. With the default maximum of five attempts, the scheduled delays are 5, 10, 20, and 40 seconds; the fifth failure enters the DLQ.

## Worker activation

The webhook schedules a bounded post-response Worker dispatch after enqueueing. A protected endpoint is also available at:

\`GET /api/internal/messenger-worker\`

It accepts \`Authorization: Bearer <secret>\`, where the secret is \`CRON_SECRET\` or \`AXIAL_WORKER_SECRET\`. Configure a strong secret in the deployment environment; never commit it to this repository.

The protected endpoint is intended for an external scheduler or a future always-on worker. This trigger is necessary because Redis stores retry due times but does not execute JavaScript when a due time arrives. `waitUntil()` only covers the current webhook invocation; it does not wake a Function when a retry's due time arrives later.

This branch adds `.github/workflows/axial-worker-scheduler.yml`, which calls the protected endpoint every five minutes after the workflow is merged into the default branch. Configure the GitHub repository variable `AXIAL_WORKER_URL` as `https://iacirculo.vercel.app/api/internal/messenger-worker` and the GitHub repository secret `AXIAL_WORKER_SECRET` to match the Vercel environment secret `AXIAL_WORKER_SECRET` (or `CRON_SECRET`). The workflow also supports manual execution and exits without error when either setting is absent.

This is a periodic recovery trigger, not a durable real-time scheduler. GitHub scheduled workflows have a five-minute minimum interval and can be delayed under load. A retry whose due time passes just after a scheduler run can remain pending until the next successful scheduled invocation. Use a continuously running worker or a scheduler with stronger delivery guarantees if the operational SLA requires tighter recovery. See [GitHub's schedule syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule).

## Queue metrics

The Worker response reports:

- \`pending\`: Consumer Group lag (events not yet delivered to a consumer).
- \`processing\`: entries currently pending acknowledgment in the Consumer Group.
- \`dead\`: entries in the DLQ Stream.
- \`retryScheduled\`: events waiting for their retry due time.
- \`streamEntries\`: current inbound Stream length.

These values are queue telemetry, not a claim about live Redis data until the endpoint reads the configured Upstash database.

## Validation status

The automated tests use a fake Redis client. They validate key namespacing, Lua command shape, event mapping, consumer operations, retry scheduling metadata, ACK behavior, and the Worker adapter contract. They do not prove that Lua scripts execute correctly against a live Upstash database.

Before production merge/deploy, run the test suite and a controlled integration test against a non-production Redis database. Verify enqueue idempotency, retry due-time publication, \`XAUTOCLAIM\` recovery, DLQ transfer, and isolation between at least two \`AXIAL_ENV\` values. Do not test by sending unsolicited messages to real Messenger users.

## Delivery semantics

The queue provides durable, at-least-once processing. It does not promise exactly-once delivery to Messenger: if Meta accepts an outgoing message but the function fails before Redis ACK, a later recovery can send that response again. A future outbound idempotency layer should address that boundary if duplicate replies must be prevented.


## Resilience test gates

The CI resilience suite uses a dedicated non-production Upstash Redis database. Configure GitHub Actions repository secrets `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; the workflow fails closed when either is missing. Tests use unique `axial:{ci-<run-id>}` namespaces and synthetic event IDs. They never call Messenger or send messages to real users.

Current executable Redis integration coverage:
- ID-001/002/010: concurrent duplicate enqueue and 100-delivery storm; one inbound Stream insertion.
- ID-003: webhook redelivery after ACK is rejected by the queue idempotency marker.
- FR-001: a Consumer Group created after enqueue still reads the first event (cursor `0-0`).
- FR-006: pending entry recovery with `XAUTOCLAIM`.
- FR-007/008: retry publication and transfer to DLQ at the configured attempt limit.

These tests validate Redis queue behavior, not exactly-once Messenger delivery. The external-send/ACK crash window remains at-least-once; this implementation has no provider-backed idempotency guarantee for Messenger Send API. Worker side-effect crash tests, durable completed-event markers, the append-only Event Ledger, DLQ replay, scheduler outage/restart and restore testing remain separate mandatory production gates. A green Redis queue suite does not prove those controls.

DLQ replay acceptance must separately prove manual replay, batch replay with recovered/still-failed/lost counts, replay idempotency, worker restart during replay, and Ledger transitions `DLQ → REPLAY_REQUESTED → COMPLETED/RECOVERED`. Keep the original DLQ record auditable until recovery has been confirmed.


## Event Ledger implementation

The Ledger is stored in the separate `axial:{env}:messenger:events:ledger:v1` Redis Stream. It records identifiers, state, attempt, worker, timestamp, processing duration, normalized error code/category, and safe metadata; it does not copy message text, sender IDs, recipient IDs or raw exception messages.

Enqueue appends `RECEIVED` and `QUEUED`. The adapter appends `PROCESSING` immediately after XREADGROUP or XAUTOCLAIM returns a claim. ACK atomically appends `COMPLETED` and writes a persistent completed-event tombstone. Failure handling appends `FAILED` followed by `RETRY_SCHEDULED` or `DLQ` within its Lua operation. Retry publication adds `QUEUED`; duplicate deliveries add `DUPLICATE_SKIPPED`. Correlation IDs are HMAC pseudonyms when TELEMETRY_HASH_SECRET is configured; otherwise an opaque event-scoped fallback is used.

The processing Ledger write follows the claim rather than sharing the same Redis transaction with XREADGROUP/XAUTOCLAIM. If a worker dies in that narrow interval, the next XAUTOCLAIM records the recovered attempt. The completed tombstone is permanent in this revision; the Ledger is application append-only but not independently archived. Backup/retention policy and event/correlation indexes remain separate production requirements.


## DLQ replay

Manual replay is available through the authenticated Worker routes:

- `POST /api/internal/messenger-worker/dlq/{deadLetterId}/replay`
- `POST /api/internal/messenger-worker/dlq/replay` with `{ "deadLetterIds": ["..."] }` (maximum 100 IDs per request).

Replay appends a new inbound Stream entry with the same eventId and a `replayOf` reference. It records `REPLAY_REQUESTED` and `QUEUED` in the Ledger, preserves the original DLQ entry, rejects a second replay request for the same DLQ entry, and marks the state `RECOVERED` only when the replayed event successfully ACKs. If the replay again reaches the DLQ, its replay state is marked `FAILED_AGAIN` so an operator may request another replay after correcting the cause. The DLQ entry remains intact for audit.

The replay endpoint queues work; it does not send immediately. The normal Worker/scheduler must consume it. Test gates cover manual replay, batch replay of 100 entries, duplicate replay requests, recovery of an interrupted replay via XAUTOCLAIM, and the final Ledger transitions. Provider-side send ambiguity remains at-least-once.


The DLQ is also queryable by an authenticated operator at `GET /api/internal/messenger-worker/dlq?limit=50`. The response omits the original payload and includes the DLQ stream ID needed for manual replay. Replay endpoints queue the event; they do not trigger an immediate send.


## Worker processing lease

Each event has an environment-scoped lease key under `axial:{env}:messenger:processing-lock:v1:{sha256(eventId)}`. A Worker must acquire the lease with Redis `SET NX PX` before it executes the business path. The default lease is five minutes. ACK and failure handling verify the lease owner and release the lease as part of the Lua transition; a worker that no longer owns the lease cannot mark the event completed or schedule a retry. A claim that cannot acquire a live lease is not returned to the business handler. After a crashed worker's lease expires, a later XAUTOCLAIM can acquire the lease and recover the pending item.

This lease prevents ordinary overlapping execution by two workers, but it is not an exactly-once guarantee for an external side effect. A lease can expire while an unusually slow worker is still executing, and the Meta-send/Redis-ACK crash window remains ambiguous. The real-Upstash chaos suite must validate expiry, competing claims, and restart recovery before production.

The Resilience Suite also checks that the DLQ listing endpoint omits payload data and that batch replay retains all original DLQ records while marking replay requests and outcomes in the Ledger.
