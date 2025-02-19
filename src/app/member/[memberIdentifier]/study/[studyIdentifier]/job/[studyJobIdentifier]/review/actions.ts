'use server'

import { db } from '@/database'
import { MinimalJobInfo } from '@/lib/types'
import { uuidToB64 } from '@/lib/uuid'
import { fetchCodeFile } from '@/server/aws'
import { StudyJobStatus } from '@/database/types'
import { revalidatePath } from 'next/cache'
import { CodeManifest } from '@/lib/types'
import { b64toUUID } from '@/lib/uuid'
import { fetchCodeManifest } from '@/server/aws'
import { USING_S3_STORAGE } from '@/server/config'
import { devReadCodeFile } from '@/server/dev/code-files'

export const updateStudyJobStatusAction = async (info: MinimalJobInfo, status: StudyJobStatus) => {
    // TODO: check clerk session to ensure researcher can actually update this
    db.insertInto('jobStatusChange').values({ status, studyJobId: info.studyJobId }).executeTakeFirstOrThrow()

    revalidatePath(`/member/[memberIdentifier]/study/${uuidToB64(info.studyId)}/job/${uuidToB64(info.studyJobId)}`)
}

export const fetchFileAction = async (job: MinimalJobInfo, path: string) => {
    if (USING_S3_STORAGE) {
        return await fetchCodeFile(job, path)
    } else {
        return (await devReadCodeFile(job, path)).toString()
    }
}

export const dataForJobAction = async (studyJobIdentifier: string) => {
    const jobId = b64toUUID(studyJobIdentifier)
    const jobInfo = await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('member', 'study.memberId', 'member.id')
        .select([
            'studyJob.id as studyJobId',
            'studyJob.studyId',
            //'studyJob.createdAt',
            'study.title as studyTitle',
            'member.identifier as memberIdentifier',
        ])
        .where('studyJob.id', '=', jobId)
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
