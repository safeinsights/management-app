import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda'
import logger from '@/lib/logger'
import { generateAndStoreStudyReview } from '@/server/agents/review-agent/runner'
import type { JobMessage } from '@/server/queue'

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
