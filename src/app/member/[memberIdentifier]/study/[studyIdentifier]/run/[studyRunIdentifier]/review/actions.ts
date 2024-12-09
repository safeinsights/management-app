'use server'

import { db } from '@/database'
import { MinimalRunInfo } from '@/lib/types'
import { uuidToB64 } from '@/lib/uuid'
import { fetchCodeFile } from '@/server/aws'
import { StudyRunStatus } from '@/database/types'
import { revalidatePath } from 'next/cache'
import { USING_S3_STORAGE } from '@/server/config'
import { devReadCodeFile } from '@/server/dev/code-files'

export const updateStudyRunStatusAction = async (info: MinimalRunInfo, status: StudyRunStatus) => {
    // TODO: check clerk session to ensure researcher can actually update this
    await db.updateTable('studyRun').set({ status }).where('id', '=', info.studyRunId).executeTakeFirstOrThrow()

    revalidatePath(`/member/[memberIdentifier]/study/${uuidToB64(info.studyId)}/run/${uuidToB64(info.studyRunId)}`)
}

export const fetchFileAction = async (run: MinimalRunInfo, path: string) => {
    if (USING_S3_STORAGE) {
        return await fetchCodeFile(run, path)
    } else {
        return (await devReadCodeFile(run, path)).toString()
    }
}
