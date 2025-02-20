'use server'

import { b64toUUID } from '@/lib/uuid'
import { db } from '@/database'
import { MinimalJobInfo } from '@/lib/types'
import { urlForStudyJobCodeUpload, type PresignedPost } from '@/server/aws'
import { USING_S3_STORAGE } from '@/server/config'

export const getLatestStudyJobAction = async ({ encodedStudyId }: { encodedStudyId: string }) => {
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
                selectFrom('studyJob')
                    .whereRef('study.id', '=', 'studyJob.studyId')
                    .select('id as jobId')
                    .orderBy('study.createdAt desc')
                    .limit(1)
                    .as('pendingJobId'),
        ])
        .where('study.id', '=', b64toUUID(encodedStudyId))
        .executeTakeFirst()
}

export async function getUploadUrlForStudyJobCodeAction(info: MinimalJobInfo): Promise<PresignedPost> {
    if (USING_S3_STORAGE) {
        return urlForStudyJobCodeUpload(info)
    } else {
        return {
            url: `/api/dev/upload-code/${info.studyJobId}`,
            fields: {},
        }
    }
}
