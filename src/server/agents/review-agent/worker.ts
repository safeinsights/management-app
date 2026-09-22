import type { SQSEvent } from 'aws-lambda'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import logger from '@/lib/logger'
import { scrubSentryEvent } from '@/lib/sentry'
import { ENVIRONMENT_ID, getConfigValue } from '@/server/config'
import { generateAndStoreStudyReview } from './runner'

// Entry point of the review worker Lambda, which is where generation runs in a deployed
// environment. The app process cannot host it: it answers an HTTP request and is then frozen,
// which a run measured in minutes does not survive (OTTER-799).

const messageSchema = z.object({
    studyJobId: z.string(),
    round: z.number().int().positive(),
})

let sentryStarted: Promise<void> | null = null

// The worker has no Next instrumentation hook, so it starts Sentry itself, once per cold start.
function startSentry(): Promise<void> {
    return (sentryStarted ??= (async () => {
        const dsn = await getConfigValue('NEXT_PUBLIC_SENTRY_DSN', false)
        if (!dsn) return
        Sentry.init({
            dsn,
            beforeSend: scrubSentryEvent,
            environment: ENVIRONMENT_ID,
            release: process.env.RELEASE_TAG || 'unknown',
        })
    })())
}

// Every outcome is handled here rather than handed back to SQS. The runner records a failure on the
// row, where the reviewer has Retry, and a redelivery would only arrive a full visibility timeout
// later, long after that. Only a crash or a timeout of the Lambda itself leaves the message to SQS.
export async function handler(event: SQSEvent): Promise<void> {
    await startSentry()

    for (const record of event.Records) {
        try {
            const { studyJobId, round } = messageSchema.parse(JSON.parse(record.body))
            await generateAndStoreStudyReview(studyJobId, round)
        } catch (error: unknown) {
            logger.error(error, { messageId: record.messageId })
        }
    }

    await Sentry.flush(2_000)
}
