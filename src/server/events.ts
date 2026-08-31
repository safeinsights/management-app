import { db, type DBExecutor } from '@/database'
import { AuditEventType, AuditRecordType, Json } from '@/database/types'
import type { AuditFieldChange } from '@/lib/audit-diff'
import logger from '@/lib/logger'
import { capturePostHogEvent } from '@/server/posthog'
import { UserOrgRoles } from '@/lib/types'
import * as Sentry from '@sentry/nextjs'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { updateClerkUserMetadata } from './clerk'
import { generateAndStoreStudyReview } from './agents/review-agent/runner'
import { siUser } from './db/queries'
import * as email from './mailer'

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Functions in this file are intended to be contain non-essential code that should run after the calling action has completed.    //
// They cannot return values and the success of the caller should not depend on their state                                        //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function deferred<Args extends unknown[], R>(handler: (...args: Args) => Promise<R>): (...args: Args) => void {
    return (...args: Args) => {
        // after() runs post-response. captureException only enqueues an event;
        // without an awaited flush the serverless instance can freeze before it
        // transmits, silently dropping the report. Pass the real Error (not a
        // string) so the logger/Sentry keep the stack trace, then flush.
        after(async () => {
            try {
                await handler(...args)
            } catch (error: unknown) {
                logger.error(error)
                Sentry.captureException(error)
                await Sentry.flush(2_000)
            }
        })
    }
}

type AuditEntry = {
    eventType: AuditEventType
    userId: string
    recordType: AuditRecordType
    recordId: string
    metadata?: Json
}

// Defaults to the module-level connection so existing callers are unaffected; pass an
// executor to enlist the audit row in the caller's transaction (see auditCodeEnv below).
export const audit = async (entry: AuditEntry, executor: DBExecutor = db): Promise<void> => {
    logger.info(`${entry.eventType}: ${entry.recordType}/${entry.recordId}`)
    await executor.insertInto('audit').values(entry).execute()
}

type CodeEnvAuditArgs = {
    db: DBExecutor
    codeEnvId: string
    userId: string
    changes: AuditFieldChange[]
    starterCodeReplaced?: boolean
    name?: string
}

/**
 * Unlike every other handler in this file these are NOT wrapped in deferred(): a
 * deferred callback runs after the response, by which point the action's transaction
 * has already committed *or rolled back*, and after() does not unschedule on error. A
 * mutation that failed partway (an AWS call after the update, say) would still emit an
 * audit row claiming the change succeeded. Writing inline on the caller's executor
 * makes the audit row commit and roll back atomically with the change it describes.
 */
const auditCodeEnv = async (
    eventType: Extract<AuditEventType, 'CREATED' | 'UPDATED' | 'DELETED'>,
    { db: executor, codeEnvId, userId, changes, starterCodeReplaced, name }: CodeEnvAuditArgs,
): Promise<void> => {
    await audit(
        {
            userId,
            eventType,
            recordType: 'CODE_ENV',
            recordId: codeEnvId,
            metadata: {
                changes,
                ...(starterCodeReplaced ? { starterCodeReplaced: true } : {}),
                ...(name ? { name } : {}),
            },
        },
        executor,
    )
}

export const onCodeEnvCreated = (args: CodeEnvAuditArgs) => auditCodeEnv('CREATED', args)

export const onCodeEnvUpdated = async (args: CodeEnvAuditArgs) => {
    // A save that changed nothing and replaced nothing is not history worth keeping.
    if (args.changes.length === 0 && !args.starterCodeReplaced) return
    await auditCodeEnv('UPDATED', args)
}

export const onCodeEnvDeleted = (args: CodeEnvAuditArgs) => auditCodeEnv('DELETED', args)

type StudyEvent = { studyId: string; userId: string }

export const onStudyCreated = deferred(async ({ studyId, userId }: StudyEvent) => {
    await audit({ userId, eventType: 'CREATED', recordType: 'STUDY', recordId: studyId })
    await email.sendStudyProposalEmails(studyId)
    // TODO(SHRMP-277, Iris): call sendSlaPreparationEmail once it exists in mailer.ts

    await capturePostHogEvent({
        distinctId: userId,
        event: 'study_created',
        properties: { study_id: studyId },
    })
})

export const onStudyReviewRequested = deferred(async ({ studyJobId }: { studyJobId: string }) => {
    await generateAndStoreStudyReview(studyJobId)
})

export const onStudyCodeSubmitted = deferred(async ({ studyId, userId }: StudyEvent) => {
    revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'UPDATED', recordType: 'STUDY', recordId: studyId })
    await email.sendStudyCodeSubmittedEmail(studyId)
})

export const onStudyApproved = deferred(async ({ studyId, userId }: StudyEvent) => {
    revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'APPROVED', recordType: 'STUDY', recordId: studyId })
    await email.sendStudyProposalApprovedEmail(studyId)
})

export const onStudyRejected = deferred(async ({ studyId, userId }: StudyEvent) => {
    revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'REJECTED', recordType: 'STUDY', recordId: studyId })
    await email.sendStudyProposalRejectedEmail(studyId)
})

export const onStudyNeedsClarification = deferred(async ({ studyId, userId }: StudyEvent) => {
    revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'CLARIFICATION_REQUESTED', recordType: 'STUDY', recordId: studyId })
})

export const onStudyCodeApproved = deferred(async ({ studyId, userId }: StudyEvent) => {
    revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'APPROVED', recordType: 'STUDY', recordId: studyId })
    await email.sendStudyCodeApprovedEmail(studyId)
})

export const onStudyCodeRejected = deferred(async ({ studyId, userId }: StudyEvent) => {
    revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'REJECTED', recordType: 'STUDY', recordId: studyId })
    await email.sendStudyCodeRejectedEmail(studyId)
})

export const onStudyCodeChangesRequested = deferred(async ({ studyId, userId }: StudyEvent) => {
    revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'CLARIFICATION_REQUESTED', recordType: 'STUDY', recordId: studyId })
})

export const onStudyResultsApproved = deferred(async ({ studyId, userId }: StudyEvent) => {
    revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'APPROVED', recordType: 'STUDY', recordId: studyId })
    await email.sendStudyResultsApprovedEmail(studyId)
})

export const onStudyResultsRejected = deferred(async ({ studyId, userId }: StudyEvent) => {
    revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'REJECTED', recordType: 'STUDY', recordId: studyId })
    await email.sendStudyResultsRejectedEmail(studyId)
})

export const onUserLogIn = deferred(async ({ userId }: { userId: string }) => {
    await audit({ userId, eventType: 'LOGGED_IN', recordType: 'USER', recordId: userId })
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

export const onUserPublicKeyCreated = deferred(async ({ userId }: { userId: string }) => {
    await audit({ userId, eventType: 'CREATED', recordType: 'USER', recordId: userId })
})

export const onUserPublicKeyUpdated = deferred(async ({ userId }: { userId: string }) => {
    await audit({ userId, eventType: 'UPDATED', recordType: 'USER', recordId: userId })
})
