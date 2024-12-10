'use server'

import { db } from '@/database'
import { MinimalRunInfo, CodeManifest } from '@/lib/types'
import { b64toUUID, uuidToB64 } from '@/lib/uuid'
import { fetchCodeFile, fetchCodeManifest } from '@/server/aws'
import { StudyRunStatus } from '@/database/types'
import { revalidatePath } from 'next/cache'
import { USING_CONTAINER_REGISTRY } from '@/server/config'

export const updateStudyRunStatusAction = async (info: MinimalRunInfo, status: StudyRunStatus) => {
    // TODO: check clerk session to ensure researcher can actually update this
    await db.updateTable('studyRun').set({ status }).where('id', '=', info.studyRunId).executeTakeFirstOrThrow()

    revalidatePath(`/member/[memberIdentifier]/study/${uuidToB64(info.studyId)}/run/${uuidToB64(info.studyRunId)}`)
}

export const dataForRunAction = async (studyRunIdentifier: string) => {
    const runId = b64toUUID(studyRunIdentifier)
    const run = await db
        .selectFrom('studyRun')
        .innerJoin('study', 'study.id', 'studyRun.studyId')
        .innerJoin('member', 'study.memberId', 'member.id')
        .select([
            'studyRun.id',
            'studyRun.studyId',
            'studyRun.createdAt',
            'study.title as studyTitle',
            'member.identifier as memberIdentifier',
        ])
        .where('studyRun.id', '=', runId)
        .executeTakeFirst()

    let manifest: CodeManifest = {
        runId,
        language: 'r',
        files: {},
        size: 0,
        tree: { label: '', value: '', size: 0, children: [] },
    }

    if (run && USING_CONTAINER_REGISTRY) {
        try {
            manifest = await fetchCodeManifest({ ...run, studyRunId: run.id })
        } catch (e) {
            console.error('Failed to fetch code manifest', e) // eslint-disable-line no-console
        }
    }

    return { run, manifest }
}

export const fetchFileAction = async (run: MinimalRunInfo, path: string) => {
    const file = await fetchCodeFile(run, path)
    return file
}
