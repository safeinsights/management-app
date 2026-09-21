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

    // The join is a security check: the job must be owned by the requesting org.
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

    const deliveries: { stored: boolean; createdAt: Date }[] = []

    if (logs instanceof File) {
        deliveries.push(await storeStudyEncryptedLogFile(info, logs, 'ENCRYPTED-CODE-RUN-LOG'))
    }

    if (results instanceof File) {
        deliveries.push(await storeStudyEncryptedResultsFile(info, results))
    }

    const outcome = logs && !results ? 'JOB-ERRORED' : 'RUN-COMPLETE'

    // The earliest moment our own outcome could have been recorded, since the status insert always
    // follows the artifact writes. Epoch when the delivery carried nothing.
    const artifactsHeldSince = deliveries.reduce(
        (newest, artifact) => (artifact.createdAt > newest ? artifact.createdAt : newest),
        new Date(0),
    )

    // OTTER-642: a re-delivered error used to append a second JOB-ERRORED and re-send the reviewer
    // email. Serialized on the job row; the lock is taken after the uploads and released before the
    // email, so no S3 or SMTP call runs inside the transaction.
    const announcement = await db.transaction().execute(async (trx) => {
        await trx.selectFrom('studyJob').select('id').where('id', '=', info.studyJobId).forUpdate().execute()

        // JOB-ERRORED is shared with the scanner, the containerizer and PUT /api/job/[jobId], so a
        // bare lookup would read one of theirs as proof this callback finished. Ordering is a
        // heuristic: jobStatusChange records no producer.
        const alreadyAnnounced = await trx
            .selectFrom('jobStatusChange')
            .select('id')
            .where('studyJobId', '=', info.studyJobId)
            .where('status', '=', outcome)
            .where('createdAt', '>=', artifactsHeldSince)
            .executeTakeFirst()

        if (alreadyAnnounced) return 'already-announced' as const

        // storeJobFile keeps a never-seen slot, so a late delivery reaches here looking like a
        // first one. Recording the outcome would append RUN-COMPLETE after FILES-APPROVED.
        if (await roundIsClosed(info.studyJobId, trx)) return 'round-decided' as const

        await trx.insertInto('jobStatusChange').values({ status: outcome, studyJobId: info.studyJobId }).execute()

        return 'announced' as const
    })

    if (announcement === 'round-decided') {
        logger.warn(
            `not recording ${outcome} for job ${info.studyJobId}: the round is already decided, so this delivery's outcome is stale`,
        )

        return NextResponse.json({ status: 'success', detail: 'round already decided' }, { status: 200 })
    }

    if (announcement === 'already-announced') {
        // Dropped artifacts were not refreshed, so "already received" would promise what we did
        // not do.
        const wasDropped = deliveries.some((artifact) => !artifact.stored)
        const detail = wasDropped ? 'artifacts dropped, this round is already decided' : 'artifacts already received'

        return NextResponse.json({ status: 'success', detail }, { status: 200 })
    }

    await sendResultsReadyForReviewEmail(info.studyId)

    return NextResponse.json({ status: 'success' }, { status: 200 })
})
