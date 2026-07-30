import { sendResultsReadyForReviewEmail } from '@/server/mailer'

import { db } from '@/database'
import { NextResponse } from 'next/server'
import { apiRequestingOrg, wrapApiOrgAction } from '@/server/api-wrappers'
import { storeStudyEncryptedLogFile, storeStudyEncryptedResultsFile } from '@/server/storage'

async function hasEncryptedRunLog(jobId: string) {
    const runLog = await db
        .selectFrom('studyJobFile')
        .select('id')
        .where('studyJobId', '=', jobId)
        .where('fileType', '=', 'ENCRYPTED-CODE-RUN-LOG')
        .executeTakeFirst()

    return Boolean(runLog)
}

export const POST = wrapApiOrgAction(async (req: Request, { params }: { params: Promise<{ jobId: string }> }) => {
    const org = apiRequestingOrg()
    const { jobId } = await params
    if (!jobId || !org) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    const decisiveStatuses = await db
        .selectFrom('jobStatusChange')
        .select('status')
        .where('jobStatusChange.studyJobId', '=', jobId)
        .where('jobStatusChange.status', 'in', ['RUN-COMPLETE', 'JOB-ERRORED'])
        .execute()

    // An errored run is recorded as JOB-ERRORED and never reaches RUN-COMPLETE, so a completion check
    // alone never tripped for it: a retried error delivery appended a second JOB-ERRORED and re-sent
    // the reviewer email (OTTER-642). Closing that off needs BOTH signals, because either one on its
    // own rejects a delivery that should go through:
    //   - JOB-ERRORED alone: the scan and packaging steps record it too (with their own log types), so
    //     one of those would wrongly block a legitimate results delivery for the same job.
    //   - the run-log row alone: it is this route's FIRST write, so a delivery that stored the log and
    //     then failed on the results upload or the status insert could never be retried, losing the
    //     run's results outright. It also collides with a run log QA staged on the job, since
    //     setQaStudyState reuses the study's open round job rather than minting its own.
    // Retrying past this guard is safe: storeJobFile updates the existing row rather than duplicating.
    const isComplete = decisiveStatuses.some(({ status }) => status === 'RUN-COMPLETE')
    const isErroredDeliveryRetry =
        decisiveStatuses.some(({ status }) => status === 'JOB-ERRORED') && (await hasEncryptedRunLog(jobId))

    if (isComplete || isErroredDeliveryRetry) return new NextResponse('job is already complete', { status: 422 })

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
