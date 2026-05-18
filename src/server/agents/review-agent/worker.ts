import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda'
import logger from '@/lib/logger'
import { generateAndStoreStudyReview } from './runner'

type StudyReviewMessage = { studyJobId: string }

function parseMessage(record: SQSRecord): StudyReviewMessage | null {
    try {
        const parsed = JSON.parse(record.body) as Partial<StudyReviewMessage>
        if (typeof parsed.studyJobId !== 'string') {
            logger.warn('SQS message missing studyJobId — dropping', { messageId: record.messageId })
            return null
        }
        return { studyJobId: parsed.studyJobId }
    } catch (err) {
        logger.warn('Invalid SQS message body — dropping', { messageId: record.messageId }, err)
        return null
    }
}

// Failing records are reported via batchItemFailures so SQS only redrives those.
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
    const batchItemFailures: { itemIdentifier: string }[] = []

    for (const record of event.Records) {
        const message = parseMessage(record)
        if (!message) continue
        try {
            await generateAndStoreStudyReview(message.studyJobId)
        } catch (err) {
            logger.error('Worker record failed — will redrive', { messageId: record.messageId }, err)
            batchItemFailures.push({ itemIdentifier: record.messageId })
        }
    }

    return { batchItemFailures }
}
