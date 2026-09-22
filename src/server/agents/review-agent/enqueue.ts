import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import * as Sentry from '@sentry/nextjs'
import logger from '@/lib/logger'

export type StudyReviewMessage = { studyJobId: string; round: number }

let client: SQSClient | null = null
const sqsClient = () => (client ??= new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' }))

// Local development, unit tests and PR previews each run against their own database, which the
// shared worker cannot reach, so they generate in process instead.
export const isStudyReviewQueueConfigured = () => Boolean(process.env.REVIEW_QUEUE_URL)

// requestedAt travels with the message so the worker can tell how long it waited: a message the
// reviewer has already given up on is not worth the model call.
export async function enqueueStudyReview(message: StudyReviewMessage): Promise<boolean> {
    const queueUrl = process.env.REVIEW_QUEUE_URL
    if (!queueUrl) return false

    const body = JSON.stringify({ ...message, requestedAt: new Date().toISOString() })

    try {
        await sqsClient().send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body }))
        return true
    } catch (error: unknown) {
        logger.error(error)
        Sentry.captureException(error)
        return false
    }
}
