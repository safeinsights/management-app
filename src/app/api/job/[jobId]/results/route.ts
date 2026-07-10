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

    const status = logs && !results ? 'JOB-ERRORED' : 'RUN-COMPLETE' // TODO: verify this is correct status

    // Finalize the run exactly once. The run phase is already done if results were stored (RUN-COMPLETE)
    // or a run-error log was stored. The error case is keyed on the ENCRYPTED-CODE-RUN-LOG file, which
    // only this route writes, rather than on a bare JOB-ERRORED status: the scan and packaging steps
    // also record JOB-ERRORED (with their own log types), and keying on the status would let one of
    // those wrongly block a later legitimate results delivery for the same job (OTTER-642). A row lock
    // on the job serializes concurrent re-deliveries; the checks run before anything is stored, so only
    // the first writer stores the file, records the status, and sends the email while a loser is
    // rejected. The lock is held across the (idempotent) file write, acceptable for this per-job,
    // low-frequency webhook.
    const finalized = await db.transaction().execute(async (trx) => {
        await trx.selectFrom('studyJob').where('id', '=', info.studyJobId).select('id').forUpdate().executeTakeFirst()

        const runComplete = await trx
            .selectFrom('jobStatusChange')
            .select('id')
            .where('studyJobId', '=', info.studyJobId)
            .where('status', '=', 'RUN-COMPLETE')
            .executeTakeFirst()

        const runErrored = await trx
            .selectFrom('studyJobFile')
            .select('id')
            .where('studyJobId', '=', info.studyJobId)
            .where('fileType', '=', 'ENCRYPTED-CODE-RUN-LOG')
            .executeTakeFirst()

        if (runComplete || runErrored) return false

        // Pass trx so the row insert shares this transaction's connection; the global db would take a
        // second pool connection and deadlock against the lock held here.
        if (logs instanceof File) {
            await storeStudyEncryptedLogFile(info, logs, 'ENCRYPTED-CODE-RUN-LOG', trx)
        }

        if (results instanceof File) {
            await storeStudyEncryptedResultsFile(info, results, trx)
        }

        await trx.insertInto('jobStatusChange').values({ status, studyJobId: info.studyJobId }).execute()
        return true
    })

    if (!finalized) return new NextResponse('job already finalized', { status: 422 })

    await sendResultsReadyForReviewEmail(info.studyId)

    return NextResponse.json({ status: 'success' }, { status: 200 })
})
