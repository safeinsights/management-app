'use server'

import { b64toUUID, uuidToB64 } from '@/lib/uuid'
import { db } from '@/database'
import { MinimalRunInfo } from '@/lib/types'
import { urlForStudyRunCodeUpload, type PresignedPost } from '@/server/aws'
import { USING_S3_STORAGE } from '@/server/config'

export const getLatestStudyRunAction = async ({ encodedStudyId }: { encodedStudyId: string }) => {
    return await db
        .selectFrom('study')
        .innerJoin('member', 'member.id', 'study.memberId')
        .select([
            'study.id',
            'study.title',
            'study.containerLocation',
            'member.identifier as memberIdentifier',
            'member.name as memberName',
            ({ selectFrom }) =>
                selectFrom('studyRun')
                    .whereRef('study.id', '=', 'studyRun.studyId')
                    .select('id as runId')
                    .orderBy('study.createdAt desc')
                    .limit(1)
                    .as('pendingRunId'),
        ])
        .where('study.id', '=', b64toUUID(encodedStudyId))
        .executeTakeFirst()
}

export async function getUploadUrlForStudyRunCodeAction(info: MinimalRunInfo): Promise<PresignedPost> {
    if (USING_S3_STORAGE) {
        return urlForStudyRunCodeUpload(info)
    } else {
        return {
            url: `/api/dev/upload-code/${info.studyRunId}`,
            fields: { }
        }
    }
}
