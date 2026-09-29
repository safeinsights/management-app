import { z } from 'zod'
import { generateAndStoreStudyReview } from '@/server/agents/review-agent/runner'

// Method syntax on purpose: it keeps `run` bivariant, so any job fits the general type runJob uses.
type JobDefinition<S extends z.ZodType = z.ZodType> = {
    payload: S
    run(payload: z.infer<S>): Promise<void>
}

const defineJob = <S extends z.ZodType>(definition: JobDefinition<S>) => definition

// Every job the queue carries is sent as { job, payload } and run by name, so the next background
// job is an entry here rather than another queue and worker.
const jobs = {
    'study-review': defineJob({
        payload: z.object({ studyJobId: z.string(), round: z.number().int().positive() }),
        run: ({ studyJobId, round }) => generateAndStoreStudyReview(studyJobId, round),
    }),
}

export type JobName = keyof typeof jobs
export type JobPayload<N extends JobName> = z.infer<(typeof jobs)[N]['payload']>
export type JobMessage = { [N in JobName]: { job: N; payload: JobPayload<N> } }[JobName]

const jobMessageSchema = z.object({
    job: z.enum(Object.keys(jobs) as [JobName, ...JobName[]]),
    payload: z.unknown(),
})

export async function runJob(message: unknown): Promise<void> {
    const { job, payload } = jobMessageSchema.parse(message)
    const definition: JobDefinition = jobs[job]
    await definition.run(definition.payload.parse(payload))
}
