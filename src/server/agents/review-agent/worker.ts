import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import logger from '@/lib/logger'
import { ENVIRONMENT_ID, getConfigValue } from '@/server/config'
import { sentryInitOptions } from '@/lib/sentry'
import { STUDY_REVIEW_QUEUE_STALE_AFTER_MS } from '@/lib/study-review'
import { generateAndStoreStudyReview, StudyReviewGenerationFailed } from './runner'

// Entry point of the review worker Lambda, which is where generation runs in a deployed
// environment. The app process cannot host it: it answers an HTTP request and is then frozen,
// which a run measured in minutes does not survive (OTTER-799).

const messageSchema = z.object({
    studyJobId: z.string(),
    round: z.number().int().positive(),
    // Absent on a message enqueued before this field existed, which reads as "no idea how long it
    // waited" and is run rather than dropped.
    requestedAt: z.string().optional(),
})

// SQS hides a failed message for the whole visibility timeout, so a redelivery lands long after the
// reviewer either got their summary or retried. Running it then would wipe the row they are looking
// at and pay for a report nobody is waiting for (OTTER-799).
function waitedTooLong(requestedAt: string | undefined): boolean {
    if (!requestedAt) return false
    const requested = new Date(requestedAt).getTime()
    return Number.isFinite(requested) && Date.now() - requested >= STUDY_REVIEW_QUEUE_STALE_AFTER_MS
}

let sentryStarted: Promise<void> | null = null

// The worker has no Next instrumentation hook, so it starts Sentry itself, once per cold start.
function startSentry(): Promise<void> {
    return (sentryStarted ??= (async () => {
        const dsn = await getConfigValue('NEXT_PUBLIC_SENTRY_DSN', false)
        if (!dsn) return
        // No tracesSampleRate: this is a queue worker, not a request path, and tracing every
        // minutes-long generation buys nothing the logs do not already carry.
        Sentry.init(
            sentryInitOptions({
                dsn,
                environment: ENVIRONMENT_ID,
                release: process.env.RELEASE_TAG || 'unknown',
            }),
        )
    })())
}

function parseMessage(record: SQSRecord): z.infer<typeof messageSchema> | null {
    let body: unknown
    try {
        body = JSON.parse(record.body)
    } catch {
        logger.warn('Review worker dropping a message that is not JSON', { messageId: record.messageId })
        return null
    }

    const parsed = messageSchema.safeParse(body)
    if (parsed.success) return parsed.data

    // Redriving a message this worker cannot read would only repeat the same rejection.
    logger.warn('Review worker dropping a message it cannot read', { messageId: record.messageId })
    return null
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
    await startSentry()
    const batchItemFailures: { itemIdentifier: string }[] = []

    for (const record of event.Records) {
        const message = parseMessage(record)
        if (!message) continue

        if (waitedTooLong(message.requestedAt)) {
            logger.warn('Review worker dropping a message the reviewer has stopped waiting for', {
                messageId: record.messageId,
                studyJobId: message.studyJobId,
                round: message.round,
            })
            continue
        }

        try {
            await generateAndStoreStudyReview(message.studyJobId, message.round)
        } catch (error: unknown) {
            logger.error(error)
            Sentry.captureException(error)
            // A recorded failure is already on the reviewer's screen beside a Retry control, so
            // running the same generation again when the queue redelivers helps nobody. Anything
            // else got no further than the claim, and the round is worth another attempt. That
            // attempt is a backstop, not the reviewer's recovery: a redelivery waits out the whole
            // visibility timeout, long after Retry became available to them.
            if (!(error instanceof StudyReviewGenerationFailed)) {
                batchItemFailures.push({ itemIdentifier: record.messageId })
            }
        }
    }

    await Sentry.flush(2_000)
    return { batchItemFailures }
}
