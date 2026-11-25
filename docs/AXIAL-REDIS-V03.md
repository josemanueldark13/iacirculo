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

The protected endpoint is intended for an external scheduler or a future always-on worker. This trigger is necessary because Redis stores retry due times but does not execute JavaScript when a due time arrives. `waitUntil()` only covers the current webhook invocation; it does not wake a Function when a retry's due time arrives later. If no new Messenger event arrives, a due retry remains scheduled until the Worker endpoint is called.

Do not configure a frequent Vercel Cron expression on Hobby: Vercel currently limits Hobby Cron Jobs to once per day. Pro permits once per minute, which is still coarser than the five-second initial retry delay. Use a scheduler capable of calling the protected endpoint at the required cadence, or deploy a continuously running worker. See the [Vercel Cron usage limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing).

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
