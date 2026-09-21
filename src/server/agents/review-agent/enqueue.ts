import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import * as Sentry from '@sentry/nextjs'
import logger from '@/lib/logger'

export type StudyReviewMessage = { studyJobId: string; round: number }

let client: SQSClient | null = null
const sqsClient = () => (client ??= new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' }))

// False means nothing is queued and the caller has to generate in process: either no queue is
// configured (local development, unit tests, PR previews, which each run against their own
// database) or the send failed, and a reviewer waiting on a summary is better served by a run that
// starts now than by one that never starts at all.
export async function enqueueStudyReview(message: StudyReviewMessage): Promise<boolean> {
    const queueUrl = process.env.REVIEW_QUEUE_URL
    if (!queueUrl) return false

    try {
        await sqsClient().send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(message) }))
        return true
    } catch (error: unknown) {
        logger.error(error)
        Sentry.captureException(error)
        return false
    }
}
