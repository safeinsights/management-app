'use server'

import { db } from '@/database'
import { CodeFileMinimalRun } from '@/lib/types'
import { b64toUUID, uuidToB64 } from '@/lib/uuid'
import { fetchCodeFile, fetchCodeManifest } from '@/server/aws'
import { StudyRunStatus } from '@/database/types'
import { revalidatePath } from 'next/cache'

export const updateStudyRunStatusAction = async (run: CodeFileMinimalRun, status: StudyRunStatus) => {
    // TODO: check clerk session to ensure researcher can actually update this
    await db.updateTable('studyRun').set({ status }).where('id', '=', run.id).executeTakeFirstOrThrow()

    revalidatePath(`/member/[memberIdentifier]/study/${uuidToB64(run.studyId)}/run/${uuidToB64(run.id)}`)
}

export const dataForRun = async (studyRunIdentifier: string) => {
    const run = await db
        .selectFrom('studyRun')
        .innerJoin('study', 'study.id', 'studyRun.studyId')
        .select(['studyRun.id', 'studyRun.studyId', 'studyRun.createdAt', 'study.title as studyTitle'])
        .where('studyRun.id', '=', b64toUUID(studyRunIdentifier))
        .executeTakeFirst()

    if (run) {
        const manifest = await fetchCodeManifest(run)
        return { run, manifest }
    }

    return {
        run,
    }
}

export const fetchFile = async (run: CodeFileMinimalRun, path: string) => {
    const file = await fetchCodeFile(run, path)
    return file
}
