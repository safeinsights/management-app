import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda'
import logger from '@/lib/logger'
import { generateAndStoreStudyReview } from '@/server/agents/review-agent/runner'
import type { JobMessage } from '@/server/queue'

function parseMessage(record: SQSRecord): JobMessage | null {
    try {
        return JSON.parse(record.body) as JobMessage
    } catch (err) {
        logger.warn('Invalid SQS message body — dropping (will not be redriven)', { messageId: record.messageId }, err)
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

// Failing records are reported via batchItemFailures so SQS only redrives those.
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
    const batchItemFailures: { itemIdentifier: string }[] = []

    for (const record of event.Records) {
        try {
            await processRecord(record)
        } catch (err) {
            logger.error('Worker record failed — will redrive', { messageId: record.messageId }, err)
            batchItemFailures.push({ itemIdentifier: record.messageId })
        }
    }

    return { batchItemFailures }
}
