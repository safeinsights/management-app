import { z } from 'zod'
import logger from '@/lib/logger'
import { runJob } from '@/server/jobs/registry'

// The job worker Lambda runs this same app behind the Lambda Web Adapter, which POSTs each SQS
// event here (AWS_LWA_PASS_THROUGH_PATH). Only the worker sets JOB_WORKER: the app Lambda serves
// this route to the internet too, and must not run jobs for whoever calls it.
const sqsEventSchema = z.object({
    Records: z.array(z.object({ messageId: z.string(), body: z.string() })),
})

// Answers 200 whatever a job did, so the adapter reports success and SQS deletes the message. A job
// records its own failure where the user can retry it, and a redelivery would only land a full
// visibility timeout later. Only a crash or a timeout of the Lambda leaves the message to SQS (OTTER-799).
export async function POST(request: Request) {
    if (process.env.JOB_WORKER !== 't') return new Response(null, { status: 404 })

    const { Records } = sqsEventSchema.parse(await request.json())
    for (const record of Records) {
        try {
            await runJob(JSON.parse(record.body))
        } catch (error: unknown) {
            logger.error(error, { messageId: record.messageId })
        }
    }
    return new Response(null, { status: 200 })
}
