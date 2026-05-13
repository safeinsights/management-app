import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import logger from '@/lib/logger'

export type JobMessage = { kind: 'study-review'; studyJobId: string }

const client = new SQSClient({})

function queueUrl(): string | null {
    const url = process.env.JOB_QUEUE_URL
    if (!url) return null
    return url
}

export async function enqueueJob(message: JobMessage): Promise<void> {
    const url = queueUrl()
    if (!url) {
        logger.warn('JOB_QUEUE_URL not configured — dropping job', { message })
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
