import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { env } from '@/server/config'
import type { JobMessage } from './registry'

let client: SQSClient | null = null
const sqsClient = () => (client ??= new SQSClient({ region: env.AWS_REGION || 'us-east-1' }))

// Local development, unit tests and PR previews each run against their own database, which the
// shared worker cannot reach, so they run jobs in process instead.
export const isJobQueueConfigured = () => Boolean(env.JOB_QUEUE_URL)

export async function enqueueJob(message: JobMessage): Promise<void> {
    await sqsClient().send(
        new SendMessageCommand({ QueueUrl: env.JOB_QUEUE_URL, MessageBody: JSON.stringify(message) }),
    )
}
