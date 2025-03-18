'use server'

import { db } from '@/database'
import { CodeManifest, MinimalJobInfo } from '@/lib/types'
import { fetchCodeFile, fetchCodeManifest } from '@/server/aws'
import { StudyJobStatus } from '@/database/types'
import { revalidatePath } from 'next/cache'
import { USING_S3_STORAGE } from '@/server/config'
import { devReadCodeFile } from '@/server/dev/code-files'
import { siUser } from '@/server/queries'

export const updateStudyJobStatusAction = async (info: MinimalJobInfo, status: StudyJobStatus) => {
    // TODO: check clerk session to ensure researcher can actually update this
    await db
        .insertInto('jobStatusChange')
        .values({
            userId: (await siUser()).id,
            status,
            studyJobId: info.studyJobId,
        })
        .executeTakeFirstOrThrow()

    revalidatePath(`/member/[memberIdentifier]/study/${info.studyId}/job/${info.studyJobId}`)
}

export const fetchFileAction = async (job: MinimalJobInfo, path: string) => {
    if (USING_S3_STORAGE) {
        return await fetchCodeFile(job, path)
    } else {
        return (await devReadCodeFile(job, path)).toString()
    }
}

export const dataForJobAction = async (studyJobIdentifier: string) => {
    const jobInfo = await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('member', 'study.memberId', 'member.id')
        .select([
            'studyJob.id as studyJobId',
            'studyJob.studyId',
            'studyJob.createdAt',
            'study.title as studyTitle',
            'member.identifier as memberIdentifier',
        ])
        .where('studyJob.id', '=', studyJobIdentifier)
        .executeTakeFirst()

    let manifest: CodeManifest = {
        jobId: '',
        language: 'r',
        files: {},
        size: 0,
        tree: { label: '', value: '', size: 0, children: [] },
    }

    if (jobInfo) {
        try {
            if (USING_S3_STORAGE) {
                manifest = await fetchCodeManifest(jobInfo)
            } else {
                const buf = await devReadCodeFile(jobInfo, 'manifest.json')
                manifest = JSON.parse(buf.toString('utf-8'))
            }
        } catch (e) {
            console.error('Failed to fetch code manifest', e)
        }
    }

    return { jobInfo, manifest }
}
