import { z } from 'zod'
import { generateAndStoreStudyReview } from '@/server/agents/review-agent/runner'
import * as mailer from '@/server/mailer'

// Method syntax on purpose: it keeps `run` bivariant, so any job fits the general type runJob uses.
type JobDefinition<S extends z.ZodType = z.ZodType> = {
    payload: S
    // A failure answers the worker's SQS event with an error, so the message is delivered once more.
    retry?: boolean
    run(payload: z.infer<S>): Promise<void>
}

const defineJob = <S extends z.ZodType>(definition: JobDefinition<S>) => definition

// The study emails take only the study id, so the worker needs no more than the name of the send.
const studyEmails = [
    'sendStudyProposalEmails',
    'sendStudyAgreementPreparationEmail',
    'sendStudyAgreementReadyEmail',
    'sendStudyCodeSubmittedEmail',
    'sendStudyProposalApprovedEmail',
    'sendStudyProposalRejectedEmail',
    'sendStudyProposalNeedsRevisionEmail',
    'sendStudyCodeApprovedEmail',
    'sendStudyCodeNeedsRevisionEmail',
    'sendDataPartnerCodeErroredEmail',
    'sendDataPartnerOutputsNeedReviewEmail',
    'sendLabCodeErroredEmail',
    'sendLabOutputsNeedReviewEmail',
] as const

// Every job the queue carries is sent as { job, payload } and run by name, so the next background
// job is an entry here rather than another queue and worker.
const jobs = {
    'study-review': defineJob({
        payload: z.object({ studyJobId: z.string(), round: z.number().int().positive() }),
        run: ({ studyJobId, round }) => generateAndStoreStudyReview(studyJobId, round),
    }),
    // Sent from the worker so a Lambda freeze after the response can neither stall nor drop them (OTTER-855).
    'study-email': defineJob({
        payload: z.object({ email: z.enum(studyEmails), studyId: z.string() }),
        // Nothing records a lost email where a user could retry it, so SQS gets one more try.
        retry: true,
        run: ({ email, studyId }) => mailer[email](studyId),
    }),
}

export type JobName = keyof typeof jobs
export type JobPayload<N extends JobName> = z.infer<(typeof jobs)[N]['payload']>
export type JobMessage = { [N in JobName]: { job: N; payload: JobPayload<N> } }[JobName]

const jobMessageSchema = z.object({
    job: z.enum(Object.keys(jobs) as [JobName, ...JobName[]]),
    payload: z.unknown(),
})

export const retriesOnFailure = (message: unknown) => {
    const parsed = jobMessageSchema.safeParse(message)
    return parsed.success && jobs[parsed.data.job].retry === true
}

export async function runJob(message: unknown): Promise<void> {
    const { job, payload } = jobMessageSchema.parse(message)
    const definition: JobDefinition = jobs[job]
    await definition.run(definition.payload.parse(payload))
}
