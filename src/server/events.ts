import { type DBExecutor } from '@/database'
import { AuditEventType, AuditRecordType, Json } from '@/database/types'
import type { AuditFieldChange } from '@/lib/audit-diff'
import { SUBMIT_CODE_FAQ_SUBJECT } from '@/lib/audit-subjects'
import logger from '@/lib/logger'
import { localStorageContext, currentDb } from '@/server/request-context'
import { capturePostHogEvent, type PostHogEventName } from '@/server/posthog'
import { CLERK_ADMIN_ORG_SLUG, isLabOrg, UserOrgRoles } from '@/lib/types'
import * as Sentry from '@sentry/nextjs'
import dayjs from 'dayjs'
import { after } from 'next/server'
import { enqueueJob, isJobQueueConfigured } from './jobs/queue'
import { runJob, type JobMessage, type JobPayload } from './jobs/registry'
import { getOrgInfoForUserId, siUser } from './db/queries'

// These run after the calling action has completed, and inside a performsMutations action only once
// its transaction commits; the caller's success must not depend on them.

// captureException only enqueues; without an awaited flush the instance can freeze first.
const reported = async (work: () => Promise<unknown>) => {
    try {
        await work()
    } catch (error: unknown) {
        logger.error(error)
        await Sentry.flush(2_000)
    }
}

// Inside a transaction, waits for the commit of the action or withTransaction() that opened it; a
// rollback drops afterCommit hooks (OTTER-841). Anywhere else runs at once.
const onCommit = async (work: () => Promise<unknown>) => {
    const ctx = localStorageContext.getStore()
    if (ctx?.afterCommit && ctx.db?.isTransaction) {
        ctx.afterCommit(work)
    } else {
        await work()
    }
}

export function deferred<Args extends unknown[], R>(handler: (...args: Args) => Promise<R>): (...args: Args) => void {
    return (...args: Args) => {
        // after() cannot be unscheduled, so it is only entered once the commit is in.
        onCommit(async () => after(() => reported(() => handler(...args))))
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
export const audit = async (entry: AuditEntry, executor: DBExecutor): Promise<void> => {
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

// Not deferred(), unlike the other handlers: the audit row joins the caller's transaction, so it
// commits or rolls back with the change it records.
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
    currentDb()
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
    captureStudyEvent('study_created', {
        studyId,
        userId,
        side: 'lab',
        extra: (study) => ({ programming_language: study.language }),
    })
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

// Queued on the commit path, never from after(): once the response is sent a Lambda freezes, so a
// send scheduled there waits for the instance's next request or is lost (OTTER-855). Outside a
// transaction the caller awaits it, so the message is out before the route answers.
const sendStudyEmail = (email: JobPayload<'study-email'>['email'], studyId: string) =>
    onCommit(() => reported(() => startJob({ job: 'study-email', payload: { email, studyId } })))

const recordStudyProposalSubmitted = deferred(
    async ({ studyId, userId, isResubmission }: StudyEvent & { isResubmission: boolean }) => {
        await audit({ userId, eventType: 'CREATED', recordType: 'STUDY', recordId: studyId }, currentDb())
        captureStudyEvent('study_proposal_submitted', { studyId, userId, side: 'lab', isResubmission })
    },
)

export const onStudyProposalSubmitted = async (event: StudyEvent & { isResubmission: boolean }) => {
    recordStudyProposalSubmitted(event)
    await sendStudyEmail('sendStudyProposalEmails', event.studyId)
    await sendStudyEmail('sendStudyAgreementPreparationEmail', event.studyId)
}

const recordStudyProposalResubmitted = deferred(async ({ studyId, userId }: StudyEvent) => {
    await audit({ userId, eventType: 'UPDATED', recordType: 'STUDY', recordId: studyId }, currentDb())
    captureStudyEvent('study_proposal_submitted', { studyId, userId, side: 'lab', isResubmission: true })
})

// Its own handler: the CREATED/STUDY row and the agreement request are for the first submission only.
export const onStudyProposalResubmitted = (event: StudyEvent) => {
    recordStudyProposalResubmitted(event)
    return sendStudyEmail('sendStudyProposalEmails', event.studyId)
}

export const onStudyAgreementPublished = ({ studyId }: { studyId: string }) =>
    sendStudyEmail('sendStudyAgreementReadyEmail', studyId)

const recordStudyCodeSubmitted = deferred(
    async ({ studyId, userId, studyJobId, isResubmission }: StudyJobEvent & { isResubmission: boolean }) => {
        await audit({ userId, eventType: 'UPDATED', recordType: 'STUDY', recordId: studyId }, currentDb())
        captureStudyEvent('study_code_submitted', { studyId, userId, side: 'lab', studyJobId, isResubmission })
    },
)

export const onStudyCodeSubmitted = (event: StudyJobEvent & { isResubmission: boolean }) => {
    recordStudyCodeSubmitted(event)
    return sendStudyEmail('sendStudyCodeSubmittedEmail', event.studyId)
}

const recordStudyApproved = deferred(async ({ studyId, userId }: StudyEvent) => {
    await audit({ userId, eventType: 'APPROVED', recordType: 'STUDY', recordId: studyId }, currentDb())
    captureStudyEvent('study_proposal_approved', {
        studyId,
        userId,
        side: 'data-partner',
        // From the first submission, so the lab's revision time counts. Read from the earliest CREATED
        // row: finalizing a CHANGE-REQUESTED study moves submittedAt, resubmitProposalAction does not.
        extra: async (study, role) => {
            const firstSubmission = await currentDb()
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
})

export const onStudyApproved = (event: StudyEvent) => {
    recordStudyApproved(event)
    return sendStudyEmail('sendStudyProposalApprovedEmail', event.studyId)
}

const recordStudyRejected = deferred(async ({ studyId, userId }: StudyEvent) => {
    await audit({ userId, eventType: 'REJECTED', recordType: 'STUDY', recordId: studyId }, currentDb())
    captureStudyEvent('study_proposal_declined', { studyId, userId, side: 'data-partner' })
})

export const onStudyRejected = (event: StudyEvent) => {
    recordStudyRejected(event)
    return sendStudyEmail('sendStudyProposalRejectedEmail', event.studyId)
}

const recordStudyNeedsClarification = deferred(async ({ studyId, userId }: StudyEvent) => {
    await audit({ userId, eventType: 'CLARIFICATION_REQUESTED', recordType: 'STUDY', recordId: studyId }, currentDb())
    captureStudyEvent('study_proposal_clarification_requested', { studyId, userId, side: 'data-partner' })
})

export const onStudyNeedsClarification = (event: StudyEvent) => {
    recordStudyNeedsClarification(event)
    return sendStudyEmail('sendStudyProposalNeedsRevisionEmail', event.studyId)
}

const recordStudyCodeApproved = deferred(async ({ studyId, userId, studyJobId }: StudyJobEvent) => {
    await audit({ userId, eventType: 'APPROVED', recordType: 'STUDY', recordId: studyId }, currentDb())
    captureStudyEvent('study_code_approved', { studyId, userId, side: 'data-partner', studyJobId })
})

export const onStudyCodeApproved = (event: StudyJobEvent) => {
    recordStudyCodeApproved(event)
    return sendStudyEmail('sendStudyCodeApprovedEmail', event.studyId)
}

const recordStudyCodeChangesRequested = deferred(async ({ studyId, userId, studyJobId }: StudyJobEvent) => {
    await audit({ userId, eventType: 'CLARIFICATION_REQUESTED', recordType: 'STUDY', recordId: studyId }, currentDb())
    captureStudyEvent('study_code_clarification_requested', { studyId, userId, side: 'data-partner', studyJobId })
})

export const onStudyCodeChangesRequested = (event: StudyJobEvent) => {
    recordStudyCodeChangesRequested(event)
    return sendStudyEmail('sendStudyCodeNeedsRevisionEmail', event.studyId)
}

export const onJobErrored = ({ studyId }: { studyId: string }) =>
    sendStudyEmail('sendDataPartnerCodeErroredEmail', studyId)

export const onRunCompleted = ({ studyId }: { studyId: string }) =>
    sendStudyEmail('sendDataPartnerOutputsNeedReviewEmail', studyId)

type OutputsDecisionEvent = StudyJobEvent & { errored?: boolean }

// The lab gets the same email whether the Data Partner shared the outputs or only feedback: code errored
// when the run errored, otherwise outputs need review.
const emailLabOutputsDecision = (studyId: string, errored = false) =>
    sendStudyEmail(errored ? 'sendLabCodeErroredEmail' : 'sendLabOutputsNeedReviewEmail', studyId)

const recordStudyResultsApproved = deferred(async ({ studyId, userId, studyJobId }: StudyJobEvent) => {
    await audit({ userId, eventType: 'APPROVED', recordType: 'STUDY', recordId: studyId }, currentDb())
    captureStudyEvent('study_results_outputs_shared', { studyId, userId, side: 'data-partner', studyJobId })
})

export const onStudyResultsApproved = (event: OutputsDecisionEvent) => {
    recordStudyResultsApproved(event)
    return emailLabOutputsDecision(event.studyId, event.errored)
}

const recordStudyResultsRejected = deferred(async ({ studyId, userId, studyJobId }: StudyJobEvent) => {
    await audit({ userId, eventType: 'REJECTED', recordType: 'STUDY', recordId: studyId }, currentDb())
    captureStudyEvent('study_results_outputs_not_shared', { studyId, userId, side: 'data-partner', studyJobId })
})

export const onStudyResultsRejected = (event: OutputsDecisionEvent) => {
    recordStudyResultsRejected(event)
    return emailLabOutputsDecision(event.studyId, event.errored)
}

export const onUserLogIn = deferred(async ({ userId }: { userId: string }) => {
    await audit({ userId, eventType: 'LOGGED_IN', recordType: 'USER', recordId: userId }, currentDb())
    capturePostHogEvent({ distinctId: userId, event: 'user_logged_in' })
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
    await audit({ userId, eventType: 'RESET_PASSWORD', recordType: 'USER', recordId: userId }, currentDb())
})

type Invite = { pendingId: string; isResend: boolean }

// Takes only the invite id and reads the rest from its row, so the audit and capture can't
// disagree with the invite. Callers send the email themselves and await it, so a failed send
// reaches the admin.
export const onUserInvited = deferred(async ({ pendingId, isResend }: Invite) => {
    const user = await siUser()
    const invite = await currentDb()
        .selectFrom('pendingUser')
        .select(['email', 'orgId', 'isAdmin'])
        .where('id', '=', pendingId)
        .executeTakeFirstOrThrow()

    await audit(
        {
            userId: user.id,
            eventType: 'INVITED',
            recordType: 'USER',
            recordId: pendingId,
            metadata: { invitedEmail: invite.email, isResend },
        },
        currentDb(),
    )
    capturePostHogEvent({
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
    await audit(
        { userId, eventType: 'ACCEPTED_INVITE', recordType: 'USER', recordId: userId, metadata: { inviteId } },
        currentDb(),
    )
    capturePostHogEvent({
        distinctId: userId,
        event: 'accepted_invite',
        properties: async () => {
            // The membership's role, not the invite's: accepting never demotes an existing admin.
            const membership = await currentDb()
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
    await audit(
        {
            userId: actorId,
            eventType: 'UPDATED',
            recordType: 'USER',
            recordId: userId,
            metadata: { roles: { before, after } },
        },
        currentDb(),
    )
    capturePostHogEvent({
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
})

export const onUserPublicKeyCreated = deferred(async ({ userId }: { userId: string }) => {
    await audit({ userId, eventType: 'CREATED', recordType: 'USER', recordId: userId }, currentDb())
})

export const onUserPublicKeyUpdated = deferred(async ({ userId }: { userId: string }) => {
    await audit({ userId, eventType: 'UPDATED', recordType: 'USER', recordId: userId }, currentDb())
})
