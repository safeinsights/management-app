import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda'
import * as Sentry from '@sentry/node'
import logger from '@/lib/logger'
import { generateAndStoreStudyReview } from '@/server/agents/review-agent/runner'
import { getConfigValue } from '@/server/config'
import type { JobMessage } from '@/server/queue'

let sentryReady = false
async function ensureSentryInit(): Promise<void> {
    if (sentryReady) return
    sentryReady = true
    const dsn = await getConfigValue('NEXT_PUBLIC_SENTRY_DSN', false)
    if (!dsn) return
    Sentry.init({
        dsn,
        environment: process.env.ENVIRONMENT_ID,
        release: process.env.RELEASE_SHA,
        tracesSampleRate: 0,
    })
}

function parseMessage(record: SQSRecord): JobMessage | null {
    try {
        return JSON.parse(record.body) as JobMessage
    } catch (err) {
        logger.warn('Invalid SQS message body — dropping (will not be redriven)', {
            messageId: record.messageId,
            err: String(err),
        })
        return null
    }
}

async function processRecord(record: SQSRecord): Promise<void> {
    const message = parseMessage(record)
    if (!message) return

    switch (message.kind) {
        case 'study-review':
            await generateAndStoreStudyReview(message.studyJobId)
            return
        default: {
            const _exhaustive: never = message.kind
            logger.warn('Unknown job kind — dropping', { kind: _exhaustive, messageId: record.messageId })
        }
    }
}

// Returns batchItemFailures for any record that threw. SQS will redrive only those,
// not the whole batch. With batchSize=1 in CDK, this effectively redrives the single record.
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
    await ensureSentryInit()
    const batchItemFailures: { itemIdentifier: string }[] = []

    for (const record of event.Records) {
        try {
            await processRecord(record)
        } catch (err) {
            logger.warn('Worker record failed — will redrive', {
                messageId: record.messageId,
                err: String(err),
            })
            batchItemFailures.push({ itemIdentifier: record.messageId })
        }
    }

    return { batchItemFailures }
}
