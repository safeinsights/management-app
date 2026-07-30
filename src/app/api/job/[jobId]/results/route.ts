import { sendResultsReadyForReviewEmail } from '@/server/mailer'

import { db } from '@/database'
import { NextResponse } from 'next/server'
import { apiRequestingOrg, wrapApiOrgAction } from '@/server/api-wrappers'
import { storeStudyEncryptedLogFile, storeStudyEncryptedResultsFile } from '@/server/storage'

/**
 * Has this route already finished a delivery for the job?
 *
 * RUN-COMPLETE answers that directly: only this route writes it, and only after both artifacts are
 * stored. An errored run instead ends at JOB-ERRORED, which is NOT this route's alone (the
 * containerizer, the scanner and the TOA status endpoint all write it), so before OTTER-642 a retried
 * error delivery sailed through: a second JOB-ERRORED row and a second reviewer email.
 *
 * Identifying an errored delivery therefore takes both of this route's writes, in order: the run log
 * it stores first, and a JOB-ERRORED recorded no earlier than that log. Neither test works alone.
 * Without the log row, a packaging or scan JOB-ERRORED blocks the legitimate results delivery that
 * follows it. Without the ordering, the same earlier JOB-ERRORED combines with a half-finished
 * delivery's log row to reject the retry that would complete it, and the run's results are lost for
 * good. The log row's createdAt survives a retry (storeJobFile only updates the name), so it stays a
 * stable marker of when this route first wrote for the job.
 */
async function completedDelivery(jobId: string): Promise<'complete' | 'errored' | null> {
    const runComplete = await db
        .selectFrom('jobStatusChange')
        .select('id')
        .where('studyJobId', '=', jobId)
        .where('status', '=', 'RUN-COMPLETE')
        .executeTakeFirst()
    if (runComplete) return 'complete'

    const runLog = await db
        .selectFrom('studyJobFile')
        .select('createdAt')
        .where('studyJobId', '=', jobId)
        .where('fileType', '=', 'ENCRYPTED-CODE-RUN-LOG')
        .orderBy('createdAt', 'asc')
        .executeTakeFirst()
    if (!runLog) return null

    const erroredAfterRunLog = await db
        .selectFrom('jobStatusChange')
        .select('id')
        .where('studyJobId', '=', jobId)
        .where('status', '=', 'JOB-ERRORED')
        .where('createdAt', '>=', runLog.createdAt)
        .executeTakeFirst()

    return erroredAfterRunLog ? 'errored' : null
}

export const POST = wrapApiOrgAction(async (req: Request, { params }: { params: Promise<{ jobId: string }> }) => {
    const org = apiRequestingOrg()
    const { jobId } = await params
    if (!jobId || !org) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    // Distinct bodies so a sender can tell a plain duplicate apart from a delivery blocked by an
    // error this job already reported, which are different things to investigate.
    const completed = await completedDelivery(jobId)
    if (completed === 'complete') return new NextResponse('job is already complete', { status: 422 })
    if (completed === 'errored') return new NextResponse('job already reported an errored run', { status: 422 })

    const formData = await req.formData()
    const logs = formData.get('log')
    let results = formData.get('result')
    const file = formData.get('file')

    // TODO: remove this once TOA no longer sends 'file' property
    //  reference PR: https://github.com/safeinsights/trusted-output-app/pull/35/files
    if (!results && file) {
        results = file
    }

    // join is a security check to ensure the job is owned by the org
    const info = await db
        .selectFrom('studyJob')
        .innerJoin('study', (join) => join.onRef('study.id', '=', 'studyJob.studyId').on('study.orgId', '=', org.id))
        .innerJoin('org', 'org.id', 'study.orgId')
        .select(['studyJob.id as studyJobId', 'studyId', 'org.slug as orgSlug', 'studyJob.id as studyJobId'])
        .where('studyJob.id', '=', jobId)
        .executeTakeFirst()

    if (!info) {
        return NextResponse.json({ status: 'fail', error: 'job not found' }, { status: 404 })
    }

    if (logs instanceof File) {
        await storeStudyEncryptedLogFile(info, logs, 'ENCRYPTED-CODE-RUN-LOG')
    }

    if (results instanceof File) {
        await storeStudyEncryptedResultsFile(info, results)
    }

    await db
        .insertInto('jobStatusChange')
        .values({
            status: logs && !results ? 'JOB-ERRORED' : 'RUN-COMPLETE', // TODO: verify this is correct status,
            studyJobId: info.studyJobId,
        })
        .execute()

    await sendResultsReadyForReviewEmail(info.studyId)

    return NextResponse.json({ status: 'success' }, { status: 200 })
})
