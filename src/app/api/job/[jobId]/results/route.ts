import { sendResultsReadyForReviewEmail } from '@/server/mailer'

import { db } from '@/database'
import { NextResponse } from 'next/server'
import { apiRequestingOrg, wrapApiOrgAction } from '@/server/api-wrappers'
import { storeStudyEncryptedLogFile, storeStudyEncryptedResultsFile } from '@/server/storage'

export const POST = wrapApiOrgAction(async (req: Request, { params }: { params: Promise<{ jobId: string }> }) => {
    const org = apiRequestingOrg()
    const { jobId } = await params
    if (!jobId || !org) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    // A job is finalized once it reports either outcome. RUN-COMPLETE freezes shared results under
    // already-wrapped keys; JOB-ERRORED must be terminal too, otherwise a retried error post (which
    // never reaches RUN-COMPLETE) re-stores the log and appends another JOB-ERRORED (OTTER-642).
    // Re-runs use a NEW job. This is a fast path for the common sequential retry (avoids redundant S3
    // work); the authoritative, race-safe finalize check runs under a row lock below.
    const alreadyReceived = await db
        .selectFrom('jobStatusChange')
        .where('jobStatusChange.studyJobId', '=', jobId)
        .where('jobStatusChange.status', 'in', ['RUN-COMPLETE', 'JOB-ERRORED'])
        .executeTakeFirst()

    if (alreadyReceived) return new NextResponse('job already finalized', { status: 422 })

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

    const status = logs && !results ? 'JOB-ERRORED' : 'RUN-COMPLETE' // TODO: verify this is correct status

    // The guard above catches a sequential retry, but two deliveries arriving at the same instant both
    // pass it and would each append a terminal status row and send a duplicate results-ready email (the
    // stored files are already deduped by storeJobFile's unique index). Serialize the finalize decision
    // per job with a row lock: only the first writer records the status and notifies; a concurrent loser
    // sees the committed terminal status and is rejected. Files are stored before the lock (they are
    // idempotent), so the lock is held only briefly.
    const finalized = await db.transaction().execute(async (trx) => {
        await trx.selectFrom('studyJob').where('id', '=', info.studyJobId).select('id').forUpdate().executeTakeFirst()

        const terminal = await trx
            .selectFrom('jobStatusChange')
            .where('studyJobId', '=', info.studyJobId)
            .where('status', 'in', ['RUN-COMPLETE', 'JOB-ERRORED'])
            .executeTakeFirst()

        if (terminal) return false

        await trx.insertInto('jobStatusChange').values({ status, studyJobId: info.studyJobId }).execute()
        return true
    })

    if (!finalized) return new NextResponse('job already finalized', { status: 422 })

    await sendResultsReadyForReviewEmail(info.studyId)

    return NextResponse.json({ status: 'success' }, { status: 200 })
})
