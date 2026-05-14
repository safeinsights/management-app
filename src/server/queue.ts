import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import logger from '@/lib/logger'
import { DEPLOYED_ENV } from '@/server/config'

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
        // In a deployed environment a missing queue URL is a misconfiguration.
        // Locally / in CI it's expected — fall back to running the job inline so
        // the dev loop still produces a real review.
        if (DEPLOYED_ENV) {
            logger.error('JOB_QUEUE_URL not configured in deployed env — dropping job', { message })
            return
        }
        logger.warn('JOB_QUEUE_URL not set — running job inline (local/dev fallback)', { message })
        await runInline(message)
        return
    }
    await client.send(
        new SendMessageCommand({
            QueueUrl: url,
            MessageBody: JSON.stringify(message),
        }),
    )
}

// Dynamic import avoids pulling the runner (and its DB + Anthropic deps) into the
// worker bundle's module graph at import time, and avoids a circular load when the
// runner ever needs to enqueue follow-up jobs.
async function runInline(message: JobMessage): Promise<void> {
    switch (message.kind) {
        case 'study-review': {
            const { generateAndStoreStudyReview } = await import('@/server/agents/review-agent/runner')
            await generateAndStoreStudyReview(message.studyJobId)
            return
        }
        default: {
            const _exhaustive: never = message.kind
            logger.warn('Unknown job kind in inline fallback — dropping', { kind: _exhaustive })
        }
    }
}

export async function enqueueStudyReview(studyJobId: string): Promise<void> {
    await enqueueJob({ kind: 'study-review', studyJobId })
}
