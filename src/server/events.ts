import { db } from '@/database'
import { AuditEventType, AuditRecordType } from '@/database/types'
import * as email from './mailgun'
import logger from '@/lib/logger'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import * as Sentry from '@sentry/nextjs'

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Functions in this file are intended to be contain non-essential code that should run after the calling action has completed.    //
// They cannot return values and the success of the caller should not depend on their state                                        //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function deferred<Args extends unknown[], R>(handler: (...args: Args) => Promise<R>): (...args: Args) => void {
    return (...args: Args) => {
        after(() =>
            handler(...args).catch((error: unknown) => {
                logger.warn(String(error))
                Sentry.captureException(error)
            }),
        )
    }
}

type AuditEntry = {
    eventType: AuditEventType
    userId: string
    recordType: AuditRecordType
    recordId: string
}

export const audit = async (entry: AuditEntry): Promise<void> => {
    logger.info(`${entry.eventType}: ${entry.recordType}/${entry.recordId}`)
    await db
        .insertInto('audit')
        .values({
            userId: entry.userId,
            eventType: entry.eventType,
            recordType: entry.recordType,
            recordId: entry.recordId,
        })
        .execute()
}

type StudyEvent = { studyId: string; userId: string }

export const onStudyCreated = deferred(async ({ studyId, userId }: StudyEvent) => {
    await audit({ userId, eventType: 'CREATED', recordType: 'STUDY', recordId: studyId })
    await email.sendStudyProposalEmails(studyId)
})

export const onStudyApproved = ({ studyId, userId }: StudyEvent) =>
    deferred(async () => {
        revalidatePath(`/reviewer/[orgSlug]/study/${studyId}`, 'page')
        await audit({ userId, eventType: 'APPROVED', recordType: 'STUDY', recordId: studyId })
        await email.sendStudyProposalApprovedEmail(studyId)
    })

export const onStudyRejected = ({ studyId, userId }: StudyEvent) =>
    deferred(async () => {
        revalidatePath(`/reviewer/[orgSlug]/study/${studyId}`, 'page')
        await audit({ userId, eventType: 'REJECTED', recordType: 'STUDY', recordId: studyId })
        await email.sendStudyProposalRejectedEmail(studyId)
    })

export const onUserLogIn = (userId: string) =>
    deferred(async () => {
        await audit({ userId, eventType: 'LOGIN', recordType: 'USER', recordId: userId })
    })

export const onUserResetPW = (userId: string) =>
    deferred(async () => {
        await audit({ userId, eventType: 'RESET_PASSWORD', recordType: 'USER', recordId: userId })
    })

export const onUserInvited = ({ invitedUserId, adminUserId }: { invitedUserId: string; adminUserId: string }) =>
    deferred(async () => {
        await audit({ userId: adminUserId, eventType: 'INVITED', recordType: 'USER', recordId: invitedUserId })
    })

export const onUserAcceptInvite = (userId: string) =>
    deferred(async () => {
        await audit({ userId, eventType: 'ACCEPT_INVITE', recordType: 'USER', recordId: userId })
    })
