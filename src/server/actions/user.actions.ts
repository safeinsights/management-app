'use server'

import { db } from '@/database'
import { z } from 'zod'
import { CodeManifest } from '@/lib/types'
import { fetchCodeManifest } from '@/server/aws'
import { currentUser, clerkClient } from '@clerk/nextjs/server'
import { getOrgSlugFromActionContext, getUserIdFromActionContext } from './wrappers'
import { anonAction, userAction } from './wrappers'
import { findOrCreateSiUserId } from '@/server/db/mutations'



export const onUserSignInAction = anonAction(async () => {
    const user = await currentUser()

    if (!user) throw new Error('User not authenticated')

    const siUserId = await findOrCreateSiUserId(user.id, {
        firstName: user.firstName ?? 'Unknown', // unlike clerk, we require users to have some sort of name for showing in reports
        lastName: user.lastName,
        email: user.primaryEmailAddress?.emailAddress,
    })
    const client = await clerkClient()

    await client.users.updateUserMetadata(user.id, {
        publicMetadata: {
            userId: siUserId,
        },
    })
})

export const getMemberIdFromIdentifierAction = userAction(async (identifier) => {
    return await db.selectFrom('member').select('id').where('identifier', '=', identifier).executeTakeFirst()
}, z.string())

export const latestJobForStudyAction = userAction(async (studyId) => {
    const latestJob = await db
        .selectFrom('studyJob')
        .selectAll('studyJob')

        // security, check user has access to record
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('member', (join) =>
            join.on('member.identifier', '=', getOrgSlugFromActionContext()).onRef('member.id', '=', 'study.memberId'),
        )

        .where('studyJob.studyId', '=', studyId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .executeTakeFirst()

    // We should always have a job, something is wrong if we don't
    if (!latestJob) {
        throw new Error(`No job found for study id: ${studyId}`)
    }
    return latestJob
}, z.string())

export const dataForJobAction = userAction(async (studyJobIdentifier) => {
    const jobInfo = await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('member', 'study.memberId', 'member.id')
        .innerJoin('memberUser', (join) =>
            join
                .on('memberUser.userId', '=', getUserIdFromActionContext())
                .onRef('memberUser.memberId', '=', 'study.memberId'),
        )
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
            manifest = await fetchCodeManifest(jobInfo)
        } catch (e) {
            console.error('Failed to fetch code manifest', e)
        }
    }

    return { jobInfo, manifest }
}, z.string())

export const jobStatusForJobAction = userAction(async (jobId) => {
    if (!jobId) return null



    const result = await db
        .selectFrom('jobStatusChange')

        // security, check user has access to record
        .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('member', (join) =>
            join.on('member.identifier', '=', getOrgSlugFromActionContext()).onRef('member.id', '=', 'study.memberId'),
        )

        .select('jobStatusChange.status')
        .where('jobStatusChange.studyJobId', '=', jobId)
        .orderBy('jobStatusChange.createdAt', 'desc')
        .limit(1)
        .executeTakeFirst()

    return result?.status || null
}, z.string())

export const dataForStudyDocumentsAction = userAction(async (studyId: string) => {

    // Fetch study information
    const studyInfo = await db
        .selectFrom('study')
        .innerJoin('member', 'study.memberId', 'member.id')
        .select([
            'study.id as studyId',
            'study.title as studyTitle',
            'study.descriptionDocPath',
            'study.irbDocPath',
            // 'study.agreementsDocPath', //TODO:column does not exist yet
            'member.identifier as memberIdentifier',
        ])
        .where('study.id', '=', studyId)
        .executeTakeFirst()

    if (!studyInfo) {
        return null
    }

    // Prepare document list
    const documents = []

    if (studyInfo.descriptionDocPath) {
        documents.push({
            name: 'Description Document',
            path: studyInfo.descriptionDocPath,
        })
    }

    if (studyInfo.irbDocPath) {
        documents.push({
            name: 'IRB Document',
            path: studyInfo.irbDocPath,
        })
    }

    // TODO:column does not exist yet
    // if (studyInfo.agreementsDocPath) {
    //     documents.push({
    //         name: 'Agreements Document',
    //         path: studyInfo.agreementsDocPath
    //     })
    // }

    return {
        studyInfo,
        documents,
    }
})