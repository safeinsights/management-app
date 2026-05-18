import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import logger from '@/lib/logger'
import { DEPLOYED_ENV } from '@/server/config'
import { generateAndStoreStudyReview } from '@/server/agents/review-agent/runner'

export type JobMessage = { kind: 'study-review'; studyJobId: string }

const client = new SQSClient({})

export async function enqueueJob(message: JobMessage): Promise<void> {
    const url = process.env.JOB_QUEUE_URL
    if (!url) {
        // Deployed: misconfig, drop loudly. Local: expected, run inline so dev loop works.
        if (DEPLOYED_ENV) {
            logger.error('JOB_QUEUE_URL not configured in deployed env — dropping job', { message })
            return
        }
        logger.warn('JOB_QUEUE_URL not set — running job inline (local/dev fallback)', { message })
        await generateAndStoreStudyReview(message.studyJobId)
        return
    }
    await client.send(
        new SendMessageCommand({
            QueueUrl: url,
            MessageBody: JSON.stringify(message),
        }),
    )
}

export async function enqueueStudyReview(studyJobId: string): Promise<void> {
    await enqueueJob({ kind: 'study-review', studyJobId })
}
