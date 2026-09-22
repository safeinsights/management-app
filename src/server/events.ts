import { db, type DBExecutor } from '@/database'
import { AuditEventType, AuditRecordType, Json } from '@/database/types'
import type { AuditFieldChange } from '@/lib/audit-diff'
import { SUBMIT_CODE_FAQ_SUBJECT } from '@/lib/audit-subjects'
import logger from '@/lib/logger'
import { capturePostHogEvent } from '@/server/posthog'
import { UserOrgRoles } from '@/lib/types'
import * as Sentry from '@sentry/nextjs'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { updateClerkUserMetadata } from './clerk'
import {
    enqueueStudyReview,
    isStudyReviewQueueConfigured,
    type StudyReviewMessage,
} from './agents/review-agent/enqueue'
import {
    generateAndStoreStudyReview,
    markStudyReviewQueued,
    markStudyReviewUnqueued,
} from './agents/review-agent/runner'
import { siUser } from './db/queries'
import * as email from './mailer'

// These run after the calling action has completed; the caller's success must not depend on them.

export function deferred<Args extends unknown[], R>(handler: (...args: Args) => Promise<R>): (...args: Args) => void {
    return (...args: Args) => {
        // captureException only enqueues; without an awaited flush the instance can freeze first.
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

// Pass an executor to enlist the audit row in the caller's transaction.
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

// Not deferred(), unlike the other handlers: after() does not unschedule on error, so a failed
// mutation would still emit an audit row claiming success.
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
    if (args.changes.length === 0 && !args.starterCodeReplaced) return
    await auditCodeEnv('UPDATED', args)
}

export const onCodeEnvDeleted = (args: CodeEnvAuditArgs) => auditCodeEnv('DELETED', args)

type StudyEvent = { studyId: string; userId: string }

export const onStudyCreated = deferred(async ({ studyId, userId }: StudyEvent) => {
    await audit({ userId, eventType: 'CREATED', recordType: 'STUDY', recordId: studyId })
    await email.sendStudyProposalEmails(studyId)

    await capturePostHogEvent({
        distinctId: userId,
        event: 'study_created',
        properties: { study_id: studyId },
    })
})

export const onStudyAgreementPublished = deferred(async ({ studyId }: { studyId: string }) => {
    await email.sendStudyAgreementReadyEmail(studyId)
})

const startStudyReviewInline = deferred(async ({ studyJobId, round }: StudyReviewMessage) => {
    await generateAndStoreStudyReview(studyJobId, round)
})

// Not deferred(), unlike its neighbours: the caller awaits this from afterCommit so the queue is
// handed a round that is already committed. Generation itself takes minutes, which after() cannot
// hold open in a Lambda, so the queue is the real path and the in-process run is the fallback for
// environments that have none (OTTER-799).
export const onStudyReviewRequested = async ({ studyJobId, round }: StudyReviewMessage) => {
    if (!isStudyReviewQueueConfigured()) {
        startStudyReviewInline({ studyJobId, round })
        return
    }

    // Queued first, so the round reads as pending while it waits for a worker. Falling back to an
    // in-process run here would put generation back in the request path this card moved it out of,
    // so a failed send is recorded instead and the reviewer is offered a retry straight away.
    await markStudyReviewQueued(studyJobId, round)
    if (await enqueueStudyReview({ studyJobId, round })) return
    await markStudyReviewUnqueued(studyJobId, round)
}

export const onStudyCodeSubmitted = deferred(async ({ studyId, userId }: StudyEvent) => {
    revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'UPDATED', recordType: 'STUDY', recordId: studyId })
    await email.sendStudyCodeSubmittedEmail(studyId)
})

export const onStudyApproved = deferred(async ({ studyId, userId }: StudyEvent) => {
    revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'APPROVED', recordType: 'STUDY', recordId: studyId })
    await email.sendStudyProposalApprovedEmail(studyId)
    // Approval is the earliest point an agreement can exist, so it is also the earliest it can be asked for.
    await email.sendStudyAgreementPreparationEmail(studyId)
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

/**
 * OTTER-693: `VIEWED` is deliberately generic, so `metadata.subject` is what says which thing was
 * seen. Not deferred, like auditCodeEnv: the page reads this row back on the next visit.
 */
export const onUserViewedSubmitCodeFaq = async ({ db: executor, userId }: { db: DBExecutor; userId: string }) => {
    await audit(
        {
            userId,
            eventType: 'VIEWED',
            recordType: 'USER',
            recordId: userId,
            metadata: { subject: SUBMIT_CODE_FAQ_SUBJECT },
        },
        executor,
    )
}

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
