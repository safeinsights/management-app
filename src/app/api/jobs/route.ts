import { z } from 'zod'
import logger from '@/lib/logger'
import { retriesOnFailure, runJob } from '@/server/jobs/registry'
import * as Sentry from '@sentry/nextjs'

// The job worker Lambda runs this same app behind the Lambda Web Adapter, which POSTs each SQS
// event here (AWS_LWA_PASS_THROUGH_PATH). Only the worker sets JOB_WORKER: the app Lambda serves
// this route to the internet too, and must not run jobs for whoever calls it.
const sqsEventSchema = z.object({
    Records: z.array(z.object({ messageId: z.string(), body: z.string() })),
})

const parseMessage = (body: string): unknown => {
    try {
        return JSON.parse(body)
    } catch {
        return undefined
    }
}

// Answers 200 whatever most jobs did, so the adapter reports success and SQS deletes the message: such
// a job records its own failure where the user can retry it, and a redelivery would only land a full
// visibility timeout later (OTTER-799). A job marked `retry` answers 500 instead, which the adapter
// reports as an error (AWS_LWA_ERROR_STATUS_CODES) so SQS delivers the message once more (OTTER-855).
export async function POST(request: Request) {
    if (process.env.JOB_WORKER !== 't') return new Response(null, { status: 404 })

    let redeliver = false
    const { Records } = sqsEventSchema.parse(await request.json())
    for (const record of Records) {
        const message = parseMessage(record.body)
        try {
            await runJob(message)
        } catch (error: unknown) {
            logger.error(error, { messageId: record.messageId })
            redeliver ||= retriesOnFailure(message)
            // The worker freezes once it answers; captureException only enqueues.
            await Sentry.flush(2_000)
        }
    }
    return new Response(null, { status: redeliver ? 500 : 200 })
}
