import { sendResultsReadyForReviewEmail } from '@/server/mailer'

import { db } from '@/database'
import { NextResponse } from 'next/server'
import { apiRequestingOrg, wrapApiOrgAction } from '@/server/api-wrappers'
import { roundIsClosed, storeStudyEncryptedLogFile, storeStudyEncryptedResultsFile } from '@/server/storage'
import logger from '@/lib/logger'

export const POST = wrapApiOrgAction(async (req: Request, { params }: { params: Promise<{ jobId: string }> }) => {
    const org = apiRequestingOrg()
    const { jobId } = await params
    if (!jobId || !org) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    const alreadyReceived = await db
        .selectFrom('jobStatusChange')
        .where('jobStatusChange.studyJobId', '=', jobId)
        .where('jobStatusChange.status', 'in', ['RUN-COMPLETE'])
        .executeTakeFirst()

    if (alreadyReceived) return new NextResponse('job is already complete', { status: 422 })

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

    const deliveries: { isNew: boolean; stored: boolean }[] = []

    if (logs instanceof File) {
        deliveries.push(await storeStudyEncryptedLogFile(info, logs, 'ENCRYPTED-CODE-RUN-LOG'))
    }

    if (results instanceof File) {
        deliveries.push(await storeStudyEncryptedResultsFile(info, results))
    }

    const outcome = logs && !results ? 'JOB-ERRORED' : 'RUN-COMPLETE' // TODO: verify this is correct status

    const outcomeRecorded = await db
        .selectFrom('jobStatusChange')
        .select('id')
        .where('studyJobId', '=', info.studyJobId)
        .where('status', '=', outcome)
        .executeTakeFirst()

    // OTTER-642: an errored run ends at JOB-ERRORED and never reaches the RUN-COMPLETE guard above, so
    // a re-delivered error used to append a second JOB-ERRORED and re-send the reviewer email. A
    // delivery is only a repeat when the job already had every artifact it carried AND the outcome was
    // already recorded. Both halves matter: stored artifacts alone are not proof the callback finished,
    // since the status insert can fail (or the process can die) after the upload, and treating that as
    // a repeat would strand the job in a running state with its error log sitting right there. Keying
    // on both means a retry can still finish a half-completed callback, while a true repeat announces
    // the outcome only once.
    const isRepeatDelivery = deliveries.length > 0 && deliveries.every((artifact) => !artifact.isNew)
    if (isRepeatDelivery && outcomeRecorded) {
        // A repeat on a decided round was dropped rather than refreshed (the released copy has to stay
        // decryptable), so say so: "already received" would read as a promise we did not keep, and the
        // warning in storage.ts would be the only trace of the discarded content.
        const wasDropped = deliveries.some((artifact) => !artifact.stored)
        const detail = wasDropped ? 'artifacts dropped, this round is already decided' : 'artifacts already received'

        return NextResponse.json({ status: 'success', detail }, { status: 200 })
    }

    // A decided round takes no further status. storeJobFile still keeps a slot the job has never seen
    // (dropping it would lose data with nothing released to protect), so a late delivery carrying one
    // reaches here as "new" even though its round is over. Recording the outcome now would append
    // RUN-COMPLETE after FILES-APPROVED and email the reviewer about a study they already decided.
    if (await roundIsClosed(info.studyJobId)) {
        logger.warn(
            `not recording ${outcome} for job ${info.studyJobId}: the round is already decided, so this delivery's outcome is stale`,
        )

        return NextResponse.json({ status: 'success', detail: 'round already decided' }, { status: 200 })
    }

    await db.insertInto('jobStatusChange').values({ status: outcome, studyJobId: info.studyJobId }).execute()

    await sendResultsReadyForReviewEmail(info.studyId)

    return NextResponse.json({ status: 'success' }, { status: 200 })
})
