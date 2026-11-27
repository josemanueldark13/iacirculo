'use strict';

const assert = require('node:assert/strict');
const worker = require('../services/messengerWorker');
const {
    dispatchQueued,
    MAX_INLINE_EVENTS
} = require('../services/guerrillaAxialPipelines');

async function main() {
    const originalProcessBatch = worker.processBatch;
    try {
        const calls = [];
        let remaining = 21;
        worker.processBatch = async requested => {
            calls.push(requested);
            const claimed = Math.min(requested, remaining);
            remaining -= claimed;
            return {
                claimed,
                processed: claimed,
                ignored: 0,
                retried: 0,
                deadLetter: 0,
                queue: { pending: remaining, processing: 0, dead: 0 }
            };
        };

        const complete = await dispatchQueued(21);
        assert.deepEqual(calls, [10, 10, 1]);
        assert.equal(complete.requested, 21);
        assert.equal(complete.dispatchBudget, 21);
        assert.equal(complete.claimed, 21);
        assert.equal(complete.processed, 21);
        assert.equal(complete.batches.length, 3);
        assert.equal(complete.dispatchBudgetRemaining, 0);
        assert.equal(complete.inlineLimitReached, false);

        let partialCalls = 0;
        worker.processBatch = async requested => {
            partialCalls++;
            if (partialCalls === 1) {
                return {
                    claimed: Math.min(4, requested),
                    processed: 3,
                    ignored: 1,
                    retried: 0,
                    deadLetter: 0,
                    queue: { pending: 8, processing: 0, dead: 0 }
                };
            }
            return {
                claimed: 0,
                processed: 0,
                ignored: 0,
                retried: 0,
                deadLetter: 0,
                queue: { pending: 0, processing: 0, dead: 0 }
            };
        };

        const partial = await dispatchQueued(20);
        assert.equal(partialCalls, 2);
        assert.equal(partial.claimed, 4);
        assert.equal(partial.processed, 3);
        assert.equal(partial.ignored, 1);
        assert.equal(partial.dispatchBudgetRemaining, 16);
        assert.equal(partial.batches.length, 2);

        let zeroCalls = 0;
        worker.processBatch = async () => {
            zeroCalls++;
            return { claimed: 0 };
        };
        const empty = await dispatchQueued(5);
        assert.equal(zeroCalls, 1);
        assert.equal(empty.claimed, 0);
        assert.equal(empty.dispatchBudgetRemaining, 5);

        const noEvents = await dispatchQueued(0);
        assert.equal(noEvents.claimed, 0);
        assert.equal(noEvents.batches.length, 0);
        assert.equal(zeroCalls, 1, 'no debe invocar al Worker cuando no hay eventos aceptados');

        const invalidCount = await dispatchQueued('not-a-number');
        assert.equal(invalidCount.requested, 0);
        assert.equal(invalidCount.dispatchBudget, 0);

        const cappedCalls = [];
        worker.processBatch = async requested => {
            cappedCalls.push(requested);
            return {
                claimed: requested,
                processed: requested,
                ignored: 0,
                retried: 0,
                deadLetter: 0
            };
        };
        const capped = await dispatchQueued(MAX_INLINE_EVENTS + 25);
        assert.deepEqual(cappedCalls, Array(10).fill(10));
        assert.equal(capped.requested, MAX_INLINE_EVENTS + 25);
        assert.equal(capped.dispatchBudget, MAX_INLINE_EVENTS);
        assert.equal(capped.claimed, MAX_INLINE_EVENTS);
        assert.equal(capped.dispatchBudgetRemaining, 0);
        assert.equal(capped.inlineLimitReached, true);

        console.log('PIPELINE DISPATCH: PASS (multi-batch, bounded execution, empty queue, invalid input)');
    } finally {
        worker.processBatch = originalProcessBatch;
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
