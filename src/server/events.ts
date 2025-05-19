import { db } from '@/database'
import { AuditEventType, AuditRecordType, Json } from '@/database/types'
import * as email from './mailer'
import logger from '@/lib/logger'
import { UserOrgRoles } from '@/lib/types'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { updateClerkUserMetadata } from './clerk'
import { siUser } from './db/queries'

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
    metadata?: Json
}

export const audit = async (entry: AuditEntry): Promise<void> => {
    logger.info(`${entry.eventType}: ${entry.recordType}/${entry.recordId}`)
    await db.insertInto('audit').values(entry).execute()
}

type StudyEvent = { studyId: string; userId: string }

export const onStudyCreated = deferred(async ({ studyId, userId }: StudyEvent) => {
    await audit({ userId, eventType: 'CREATED', recordType: 'STUDY', recordId: studyId })
    await email.sendStudyProposalEmails(studyId)
})

export const onStudyApproved = deferred(async ({ studyId, userId }: StudyEvent) => {
    revalidatePath(`/reviewer/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'APPROVED', recordType: 'STUDY', recordId: studyId })
    await email.sendStudyProposalApprovedEmail(studyId)
})

export const onStudyRejected = deferred(async ({ studyId, userId }: StudyEvent) => {
    revalidatePath(`/reviewer/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'REJECTED', recordType: 'STUDY', recordId: studyId })
    await email.sendStudyProposalRejectedEmail(studyId)
})

export const onUserLogIn = deferred(async ({ userId }: { userId: string }) => {
    await audit({ userId, eventType: 'LOGGED_IN', recordType: 'USER', recordId: userId })
    await updateClerkUserMetadata(userId)
})

export const onUserResetPW = deferred(async (userId: string) => {
    await audit({ userId, eventType: 'RESET_PASSWORD', recordType: 'USER', recordId: userId })
})

export const onUserInvited = deferred(
    async ({ pendingId, invitedEmail }: { invitedEmail: string; pendingId: string }) => {
        const user = await siUser()

        await audit({
            userId: user.id,
            eventType: 'INVITED',
            recordType: 'USER',
            recordId: pendingId,
            metadata: { invitedEmail },
        })
        await email.sendInviteEmail({ emailTo: invitedEmail, inviteId: pendingId })
    },
)

export const onUserAcceptInvite = deferred(async (userId: string) => {
    await audit({ userId, eventType: 'ACCEPTED_INVITE', recordType: 'USER', recordId: userId })
})

export const onUserRoleUpdate = deferred(
    async ({ userId, before, after }: { userId: string; before: UserOrgRoles; after: UserOrgRoles }) => {
        await audit({
            userId,
            eventType: 'UPDATED',
            recordType: 'USER',
            recordId: userId,
            metadata: { roles: { before, after } },
        })
        await updateClerkUserMetadata(userId)
    },
)
