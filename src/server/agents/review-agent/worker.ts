import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import logger from '@/lib/logger'
import { ENVIRONMENT_ID, getConfigValue } from '@/server/config'
import { generateAndStoreStudyReview, StudyReviewGenerationFailed } from './runner'

// Entry point of the review worker Lambda, which is where generation runs in a deployed
// environment. The app process cannot host it: it answers an HTTP request and is then frozen,
// which a run measured in minutes does not survive (OTTER-799).

const messageSchema = z.object({ studyJobId: z.string(), round: z.number().int().positive() })

let sentryStarted: Promise<void> | null = null

// The worker has no Next instrumentation hook, so it starts Sentry itself, once per cold start.
function startSentry(): Promise<void> {
    return (sentryStarted ??= (async () => {
        const dsn = await getConfigValue('NEXT_PUBLIC_SENTRY_DSN', false)
        if (!dsn) return
        Sentry.init({ dsn, environment: ENVIRONMENT_ID, release: process.env.RELEASE_TAG || 'unknown' })
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

        try {
            await generateAndStoreStudyReview(message.studyJobId, message.round)
        } catch (error: unknown) {
            logger.error(error)
            Sentry.captureException(error)
            // A recorded failure is already on the reviewer's screen beside a Retry control, so
            // running the same generation again when the queue redelivers helps nobody. Anything
            // else got no further than the claim, and the round is worth another attempt.
            if (!(error instanceof StudyReviewGenerationFailed)) {
                batchItemFailures.push({ itemIdentifier: record.messageId })
            }
        }
    }

    await Sentry.flush(2_000)
    return { batchItemFailures }
}
