import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import logger from '@/lib/logger'
import { DEPLOYED_ENV } from '@/server/config'
import { generateAndStoreStudyReview } from './runner'

const client = new SQSClient({})

export async function enqueueStudyReview(studyJobId: string): Promise<void> {
    const url = process.env.JOB_QUEUE_URL
    if (!url) {
        // Deployed: misconfig, drop loudly. Local: expected, run inline so dev loop works.
        if (DEPLOYED_ENV) {
            logger.error('JOB_QUEUE_URL not configured in deployed env — dropping study review', { studyJobId })
            return
        }
        logger.warn('JOB_QUEUE_URL not set — running study review inline (local/dev fallback)', { studyJobId })
        await generateAndStoreStudyReview(studyJobId)
        return
    }
    await client.send(
        new SendMessageCommand({
            QueueUrl: url,
            MessageBody: JSON.stringify({ studyJobId }),
        }),
    )
}
