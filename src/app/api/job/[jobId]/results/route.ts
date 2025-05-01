export const dynamic = 'force-dynamic' // defaults to auto
import { db } from '@/database'
import { NextResponse } from 'next/server'
import { apiRequestingOrg, wrapApiOrgAction } from '@/server/api-wrappers'
import { storeStudyResultsFile } from '@/server/storage'

export const POST = wrapApiOrgAction(async (req: Request, { params }: { params: Promise<{ jobId: string }> }) => {
    const org = apiRequestingOrg()
    const { jobId } = await params
    if (!jobId || !org) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    try {
        const formData = await req.formData()
        const contents = formData.get('file') as File

        if (!contents) {
            return NextResponse.json({ status: 'fail', error: 'no "file" entry in post data' }, { status: 500 })
        }

        // join is a security check to ensure the job is owned by the org
        const info = await db
            .selectFrom('studyJob')
            .innerJoin('study', (join) =>
                join.onRef('study.id', '=', 'studyJob.studyId').on('study.orgId', '=', org.id),
            )
            .select(['studyJob.id as studyJobId', 'studyId'])
            .where('studyJob.id', '=', jobId)
            .executeTakeFirst()

        if (!info) {
            return NextResponse.json({ status: 'fail', error: 'job not found' }, { status: 404 })
        }

        await storeStudyResultsFile(
            {
                ...info,
                orgSlug: org.slug,
                resultsType: 'ENCRYPTED',
            },
            contents,
        )

        await db
            .insertInto('jobStatusChange')
            .values({
                status: 'RUN-COMPLETE',
                studyJobId: info.studyJobId,
            })
            .execute()

        return NextResponse.json({ status: 'success' }, { status: 200 })
    } catch (e) {
        console.error(e)
        return NextResponse.json({ status: 'fail', error: e }, { status: 500 })
    }
})
