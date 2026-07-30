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

    const stored: { isNew: boolean }[] = []

    if (logs instanceof File) {
        stored.push(await storeStudyEncryptedLogFile(info, logs, 'ENCRYPTED-CODE-RUN-LOG'))
    }

    if (results instanceof File) {
        stored.push(await storeStudyEncryptedResultsFile(info, results))
    }

    // OTTER-642: an errored run ends at JOB-ERRORED and never reaches the RUN-COMPLETE guard above, so
    // a re-delivered error used to append a second JOB-ERRORED and re-send the reviewer email. When
    // every artifact this delivery carried was already on file it is a repeat: the artifacts were
    // refreshed in place above, and the run's outcome is announced only once. A delivery carrying
    // anything the job did not have (including the retry that completes a half-stored one) is not a
    // repeat and still records its status and email, so no delivery is ever permanently rejected.
    const isRepeatDelivery = stored.length > 0 && stored.every((artifact) => !artifact.isNew)
    if (isRepeatDelivery) {
        return NextResponse.json({ status: 'success', detail: 'artifacts already received' }, { status: 200 })
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
