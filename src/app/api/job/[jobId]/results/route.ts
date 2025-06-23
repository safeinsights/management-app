import { sendResultsReadyForReviewEmail } from '@/server/mailer'

export const dynamic = 'force-dynamic' // defaults to auto
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
        await storeStudyEncryptedLogFile(info, logs)
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
