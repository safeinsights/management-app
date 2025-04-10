'use server'

import { codeBuildRepositoryUrl } from '@/server/aws'
import { studyProposalSchema } from './study-proposal-schema'
import { db } from '@/database'
import { v7 as uuidv7 } from 'uuid'
import { getUserIdFromActionContext, researcherAction, z } from '@/server/actions/wrappers'
import { getMemberFromSlugAction } from '@/server/actions/member.actions'

const onCreateStudyActionArgsSchema = z.object({
    memberSlug: z.string(),
    studyInfo: studyProposalSchema,
})

export const onCreateStudyAction = researcherAction(async ({ memberSlug, studyInfo }) => {
    const userId = await getUserIdFromActionContext()

    const member = await getMemberFromSlugAction(memberSlug)

    const studyId = uuidv7()

    const containerLocation = await codeBuildRepositoryUrl({ studyId, memberSlug: member.slug })
    await db
        .insertInto('study')
        .values({
            id: studyId,
            title: studyInfo.title,
            piName: studyInfo.piName,
            descriptionDocPath: studyInfo.descriptionDocument?.name,
            irbDocPath: studyInfo.irbDocument?.name,
            agreementDocPath: studyInfo.agreementDocument?.name,
            // TODO: add study lead
            memberId: member.id,
            researcherId: userId,
            containerLocation,
            status: 'PENDING-REVIEW',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const studyJob = await db
        .insertInto('studyJob')
        .values({
            studyId: studyId,
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    await db
        .insertInto('jobStatusChange')
        .values({
            studyJobId: studyJob.id,
            status: 'INITIATED',
        })
        .executeTakeFirstOrThrow()

    // TODO Store in submit handler now
    // const manifest = new CodeReviewManifest(studyJob.id, 'r')
    //
    // for (const codeFile of studyInfo.codeFiles) {
    //     manifest.files.push(codeFile)
    //     await storeStudyCodeFile(
    //         {
    //             memberIdentifier: member.slug,
    //             studyId,
    //             studyJobId: studyJob.id,
    //         },
    //         codeFile,
    //     )
    // }
    //
    // const manifestFile = new File([manifest.asJSON], 'manifest.json', { type: 'application/json' })
    //
    // await storeStudyCodeFile(
    //     {
    //         memberIdentifier: member.slug,
    //         studyId,
    //         studyJobId: studyJob.id,
    //     },
    //     manifestFile,
    // )

    await db
        .insertInto('jobStatusChange')
        .values({
            userId: userId,
            status: 'CODE-SUBMITTED',
            studyJobId: studyJob.id,
        })
        .execute()

    return {
        studyId: studyId,
        studyJobId: studyJob.id,
    }
}, onCreateStudyActionArgsSchema)
