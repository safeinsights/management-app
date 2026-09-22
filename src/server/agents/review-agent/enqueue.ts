import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'

export type StudyReviewMessage = { studyJobId: string; round: number }

let client: SQSClient | null = null
const sqsClient = () => (client ??= new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' }))

// Local development, unit tests and PR previews each run against their own database, which the
// shared worker cannot reach, so they generate in process instead.
export const isStudyReviewQueueConfigured = () => Boolean(process.env.REVIEW_QUEUE_URL)

export async function enqueueStudyReview(message: StudyReviewMessage): Promise<void> {
    await sqsClient().send(
        new SendMessageCommand({ QueueUrl: process.env.REVIEW_QUEUE_URL, MessageBody: JSON.stringify(message) }),
    )
}
