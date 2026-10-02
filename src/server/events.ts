import { db, type DBExecutor } from '@/database'
import { AuditEventType, AuditRecordType, Json } from '@/database/types'
import type { AuditFieldChange } from '@/lib/audit-diff'
import { SUBMIT_CODE_FAQ_SUBJECT } from '@/lib/audit-subjects'
import logger from '@/lib/logger'
import { capturePostHogEvent, type PostHogEventName } from '@/server/posthog'
import { CLERK_ADMIN_ORG_SLUG, isLabOrg, UserOrgRoles } from '@/lib/types'
import * as Sentry from '@sentry/nextjs'
import dayjs from 'dayjs'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { updateClerkUserMetadata } from './clerk'
import { enqueueJob, isJobQueueConfigured } from './jobs/queue'
import { runJob, type JobMessage, type JobPayload } from './jobs/registry'
import { getOrgInfoForUserId, siUser } from './db/queries'
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
type StudyJobEvent = StudyEvent & { studyJobId: string }

const permissionLabel = (isAdmin: boolean) => (isAdmin ? 'admin' : 'contributor')

// Relative to the event's org: one user can be a researcher in a lab and a reviewer in an enclave.
const roleInOrg = (memberships: Awaited<ReturnType<typeof getOrgInfoForUserId>>, orgId: string) => {
    const member = memberships.find((org) => org.id === orgId)
    if (member) return { user_role: isLabOrg(member) ? 'researcher' : 'reviewer', is_org_admin: member.isAdmin }

    const isSiAdmin = memberships.some((org) => org.slug === CLERK_ADMIN_ORG_SLUG && org.isAdmin)
    return isSiAdmin ? { user_role: 'si_staff_admin', is_org_admin: false } : {}
}

const actorRoleProps = async (userId: string, orgId: string) => roleInOrg(await getOrgInfoForUserId(userId), orgId)

const selectStudyForCapture = (studyId: string) =>
    db
        .selectFrom('study')
        .select(['orgId', 'submittedByOrgId', 'isTestStudy', 'language', 'submittedAt', 'approvedAt'])
        .where('id', '=', studyId)
        .executeTakeFirstOrThrow()

type StudyCapture = StudyEvent & {
    // The lab submits and the data partner reviews, which decides the org user_role is read from.
    side: 'lab' | 'data-partner'
    studyJobId?: string
    isResubmission?: boolean
    extra?: (
        study: Awaited<ReturnType<typeof selectStudyForCapture>>,
        role: { user_role?: string },
    ) => Record<string, unknown> | Promise<Record<string, unknown>>
}

const captureStudyEvent = (
    event: PostHogEventName,
    { studyId, userId, side, studyJobId, isResubmission, extra }: StudyCapture,
) =>
    capturePostHogEvent({
        distinctId: userId,
        event,
        properties: async () => {
            const [study, memberships] = await Promise.all([
                selectStudyForCapture(studyId),
                getOrgInfoForUserId(userId),
            ])
            const role = roleInOrg(memberships, side === 'lab' ? study.submittedByOrgId : study.orgId)

            return {
                study_id: studyId,
                do_id: study.orgId,
                lab_id: study.submittedByOrgId,
                is_test_study: study.isTestStudy,
                study_job_id: studyJobId,
                is_resubmission: isResubmission,
                ...role,
                ...(await extra?.(study, role)),
            }
        },
    })

export const onStudyDraftCreated = deferred(async ({ studyId, userId }: StudyEvent) => {
    await captureStudyEvent('study_created', {
        studyId,
        userId,
        side: 'lab',
        extra: (study) => ({ programming_language: study.language }),
    })
})

export const onStudyProposalSubmitted = deferred(
    async ({ studyId, userId, isResubmission }: StudyEvent & { isResubmission: boolean }) => {
        await audit({ userId, eventType: 'CREATED', recordType: 'STUDY', recordId: studyId })
        await captureStudyEvent('study_proposal_submitted', { studyId, userId, side: 'lab', isResubmission })
        await email.sendStudyProposalEmails(studyId)
        await email.sendStudyAgreementPreparationEmail(studyId)
    },
)

// Its own handler: this path has never written CREATED/STUDY or sent the submission emails.
export const onStudyProposalResubmitted = deferred(async ({ studyId, userId }: StudyEvent) => {
    await audit({ userId, eventType: 'UPDATED', recordType: 'STUDY', recordId: studyId })
    await captureStudyEvent('study_proposal_submitted', { studyId, userId, side: 'lab', isResubmission: true })
})

export const onStudyAgreementPublished = deferred(async ({ studyId }: { studyId: string }) => {
    await email.sendStudyAgreementReadyEmail(studyId)
})

const runJobInProcess = deferred(runJob)

// Awaited from afterCommit, so the message is sent before the response and names committed rows.
// A job can take minutes, which after() cannot hold open in a Lambda, so the queue is the real path
// and the in-process run is the fallback for environments that have none (OTTER-799).
const startJob = async (message: JobMessage) => {
    if (isJobQueueConfigured()) {
        await enqueueJob(message)
    } else {
        runJobInProcess(message)
    }
}

export const onStudyReviewRequested = (payload: JobPayload<'study-review'>) =>
    startJob({ job: 'study-review', payload })

export const onStudyCodeSubmitted = deferred(
    async ({ studyId, userId, studyJobId, isResubmission }: StudyJobEvent & { isResubmission: boolean }) => {
        revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
        await audit({ userId, eventType: 'UPDATED', recordType: 'STUDY', recordId: studyId })
        await captureStudyEvent('study_code_submitted', { studyId, userId, side: 'lab', studyJobId, isResubmission })
        await email.sendStudyCodeSubmittedEmail(studyId)
    },
)

export const onStudyApproved = deferred(async ({ studyId, userId }: StudyEvent) => {
    revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'APPROVED', recordType: 'STUDY', recordId: studyId })
    await captureStudyEvent('study_proposal_approved', {
        studyId,
        userId,
        side: 'data-partner',
        // From the first submission, so the lab's revision time counts. Read from the earliest CREATED
        // row: finalizing a CHANGE-REQUESTED study moves submittedAt, resubmitProposalAction does not.
        extra: async (study, role) => {
            const firstSubmission = await db
                .selectFrom('audit')
                .select((eb) => eb.fn.min('createdAt').as('at'))
                .where('recordType', '=', 'STUDY')
                .where('recordId', '=', studyId)
                .where('eventType', '=', 'CREATED')
                .executeTakeFirst()
            const submittedAt = firstSubmission?.at ?? study.submittedAt
            return {
                approval_duration_days:
                    study.approvedAt && submittedAt
                        ? Math.round(dayjs(study.approvedAt).diff(submittedAt, 'day', true) * 100) / 100
                        : undefined,
                approver_role: role.user_role,
            }
        },
    })
    await email.sendStudyProposalApprovedEmail(studyId)
})

export const onStudyRejected = deferred(async ({ studyId, userId }: StudyEvent) => {
    revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'REJECTED', recordType: 'STUDY', recordId: studyId })
    await captureStudyEvent('study_proposal_declined', { studyId, userId, side: 'data-partner' })
    await email.sendStudyProposalRejectedEmail(studyId)
})

export const onStudyNeedsClarification = deferred(async ({ studyId, userId }: StudyEvent) => {
    revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'CLARIFICATION_REQUESTED', recordType: 'STUDY', recordId: studyId })
    await captureStudyEvent('study_proposal_clarification_requested', { studyId, userId, side: 'data-partner' })
})

export const onStudyCodeApproved = deferred(async ({ studyId, userId, studyJobId }: StudyJobEvent) => {
    revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'APPROVED', recordType: 'STUDY', recordId: studyId })
    await captureStudyEvent('study_code_approved', { studyId, userId, side: 'data-partner', studyJobId })
    await email.sendStudyCodeApprovedEmail(studyId)
})

export const onStudyCodeChangesRequested = deferred(async ({ studyId, userId, studyJobId }: StudyJobEvent) => {
    revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'CLARIFICATION_REQUESTED', recordType: 'STUDY', recordId: studyId })
    await captureStudyEvent('study_code_clarification_requested', { studyId, userId, side: 'data-partner', studyJobId })
})

export const onStudyResultsApproved = deferred(async ({ studyId, userId, studyJobId }: StudyJobEvent) => {
    revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'APPROVED', recordType: 'STUDY', recordId: studyId })
    await captureStudyEvent('study_results_outputs_shared', { studyId, userId, side: 'data-partner', studyJobId })
    await email.sendStudyResultsApprovedEmail(studyId)
})

export const onStudyResultsRejected = deferred(async ({ studyId, userId, studyJobId }: StudyJobEvent) => {
    revalidatePath(`/[orgSlug]/study/${studyId}`, 'page')
    await audit({ userId, eventType: 'REJECTED', recordType: 'STUDY', recordId: studyId })
    await captureStudyEvent('study_results_outputs_not_shared', { studyId, userId, side: 'data-partner', studyJobId })
    await email.sendStudyResultsRejectedEmail(studyId)
})

export const onUserLogIn = deferred(async ({ userId }: { userId: string }) => {
    await audit({ userId, eventType: 'LOGGED_IN', recordType: 'USER', recordId: userId })
    await capturePostHogEvent({ distinctId: userId, event: 'user_logged_in' })
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

type Invite = { pendingId: string; isResend: boolean }

// Takes only the invite id and reads the rest from its row, so the audit and capture can't
// disagree with the invite. Callers send the email themselves and await it, so a failed send
// reaches the admin.
export const onUserInvited = deferred(async ({ pendingId, isResend }: Invite) => {
    const user = await siUser()
    const invite = await db
        .selectFrom('pendingUser')
        .select(['email', 'orgId', 'isAdmin'])
        .where('id', '=', pendingId)
        .executeTakeFirstOrThrow()

    await audit({
        userId: user.id,
        eventType: 'INVITED',
        recordType: 'USER',
        recordId: pendingId,
        metadata: { invitedEmail: invite.email, isResend },
    })
    await capturePostHogEvent({
        distinctId: user.id,
        event: 'invited',
        properties: async () => ({
            org_id: invite.orgId,
            role: permissionLabel(invite.isAdmin),
            is_resend: isResend,
            ...(await actorRoleProps(user.id, invite.orgId)),
        }),
    })
})

type AcceptedInvite = { userId: string; inviteId: string; isNewAccount: boolean }

export const onUserAcceptInvite = deferred(async ({ userId, inviteId, isNewAccount }: AcceptedInvite) => {
    await audit({ userId, eventType: 'ACCEPTED_INVITE', recordType: 'USER', recordId: userId, metadata: { inviteId } })
    await capturePostHogEvent({
        distinctId: userId,
        event: 'accepted_invite',
        properties: async () => {
            // The membership's role, not the invite's: accepting never demotes an existing admin.
            const membership = await db
                .selectFrom('pendingUser')
                .innerJoin('orgUser', (join) =>
                    join.onRef('orgUser.orgId', '=', 'pendingUser.orgId').on('orgUser.userId', '=', userId),
                )
                .select(['orgUser.orgId', 'orgUser.isAdmin'])
                .where('pendingUser.id', '=', inviteId)
                .executeTakeFirstOrThrow()

            return {
                org_id: membership.orgId,
                role: permissionLabel(membership.isAdmin),
                is_new_account: isNewAccount,
                ...(await actorRoleProps(userId, membership.orgId)),
            }
        },
    })
})

type RoleUpdate = { userId: string; actorId: string; orgId: string; before: UserOrgRoles; after: UserOrgRoles }

// userId is the actor, as on every other audit row, so the team list's last-activity date stays
// the admin's rather than moving for the user they changed.
export const onUserRoleUpdate = deferred(async ({ userId, actorId, orgId, before, after }: RoleUpdate) => {
    await audit({
        userId: actorId,
        eventType: 'UPDATED',
        recordType: 'USER',
        recordId: userId,
        metadata: { roles: { before, after } },
    })
    await capturePostHogEvent({
        distinctId: actorId,
        event: 'role_updated',
        properties: async () => ({
            target_user_id: userId,
            org_id: orgId,
            role_before: permissionLabel(before.isAdmin),
            role_after: permissionLabel(after.isAdmin),
            ...(await actorRoleProps(actorId, orgId)),
        }),
    })
    await updateClerkUserMetadata(userId)
})

export const onUserPublicKeyCreated = deferred(async ({ userId }: { userId: string }) => {
    await audit({ userId, eventType: 'CREATED', recordType: 'USER', recordId: userId })
})

export const onUserPublicKeyUpdated = deferred(async ({ userId }: { userId: string }) => {
    await audit({ userId, eventType: 'UPDATED', recordType: 'USER', recordId: userId })
})
