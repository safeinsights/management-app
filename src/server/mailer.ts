import { db } from '@/database'
import { getStudyAndOrgDisplayInfo } from '@/server/db/queries'
import { findLegalDocument } from '@/server/db/legal-document'
import dayjs from 'dayjs'
import { APP_BASE_URL } from './config'
import { pathForInvitation } from '@/lib/paths'
import { Routes } from '@/lib/routes'
import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import logger from '@/lib/logger'
import { deliver, SI_AGREEMENTS_EMAIL } from './mailgun'

async function getOrgMembers(orgId: string) {
    return (
        db
            .selectFrom('user')
            .innerJoin('orgUser', 'user.id', 'orgUser.userId')
            .distinctOn('user.id')
            .select(['user.id', 'user.email', 'user.fullName'])
            .where('orgUser.orgId', '=', orgId)
            .where('user.email', 'is not', null)
            // Kysely doesn't narrow types from a where; keep this paired with the null filter above.
            .$narrowType<{ email: string }>()
            .execute()
    )
}

// SI admin is org_user.is_admin on the safe-insights org, the same row Clerk's metadata is built from.
async function getSiAdmins() {
    return db
        .selectFrom('user')
        .innerJoin('orgUser', 'user.id', 'orgUser.userId')
        .innerJoin('org', 'org.id', 'orgUser.orgId')
        .distinctOn('user.id')
        .select(['user.email'])
        .where('org.slug', '=', CLERK_ADMIN_ORG_SLUG)
        .where('orgUser.isAdmin', '=', true)
        .execute()
}

type StudyInfo = Awaited<ReturnType<typeof getStudyAndOrgDisplayInfo>>

function baseStudyVars(study: StudyInfo) {
    return {
        studyTitle: study.title,
        // Pre-header var on the agreement emails. Same value, because the templates disagree on the name.
        studyName: study.title,
        submittedBy: study.researcherFullName,
        submittedOn: dayjs(study.submittedAt ?? study.createdAt).format('MM/DD/YYYY'),
        submittedTo: study.orgName,
        researchLab: study.labName,
        dataPartner: study.orgName,
    }
}

export const sendInviteEmail = async ({ emailTo, inviteId }: { inviteId: string; emailTo: string }) => {
    await deliver({
        to: emailTo,
        subject: 'Get started with SafeInsights',
        template: 'welcome email',
        vars: {
            inviteLink: `${APP_BASE_URL}${pathForInvitation(inviteId)}`,
        },
    })
}

// submittedAt stays at the first submission; each revision is recorded only by its resubmission note.
async function latestProposalSubmittedOn(studyId: string, study: StudyInfo) {
    const latest = await db
        .selectFrom('studyProposalComment')
        .select('createdAt')
        .where('studyId', '=', studyId)
        .where('entryType', '=', 'RESUBMISSION-NOTE')
        .orderBy('createdAt', 'desc')
        .executeTakeFirst()

    return dayjs(latest?.createdAt ?? study.submittedAt ?? study.createdAt).format('MM/DD/YYYY')
}

// actionURL is deliberately generic, so a template need not change when its button's destination does.
// /view shows the lab the screen for the study's current state, so the link stays correct if it is opened later.
async function labDecisionVars(studyId: string, study: StudyInfo) {
    return {
        ...baseStudyVars(study),
        submittedOn: await latestProposalSubmittedOn(studyId, study),
        actionURL: `${APP_BASE_URL}${Routes.studyView({ orgSlug: study.labSlug, studyId })}`,
    }
}

// Variables for emails to the Data Partner. /review is the reviewer's equivalent of /view.
async function dataPartnerReviewVars(studyId: string, study: StudyInfo) {
    return {
        ...baseStudyVars(study),
        submittedOn: await latestProposalSubmittedOn(studyId, study),
        actionURL: `${APP_BASE_URL}${Routes.studyReview({ orgSlug: study.orgSlug, studyId })}`,
    }
}

// Everyone who decided on any version of the proposal, plus the code when withCodeDeciders is set.
// People who have since left the Data Partner are still included.
async function getStudyDeciders(studyId: string, { withCodeDeciders = false } = {}) {
    const proposalDeciders = db
        .selectFrom('studyProposalComment')
        .select('authorId')
        .where('studyId', '=', studyId)
        .where('entryType', '=', 'REVIEWER-FEEDBACK')
        .where('decision', 'is not', null)

    const codeDeciders = db
        .selectFrom('studyReviewComment')
        .select('authorId')
        .where('studyId', '=', studyId)
        .where('reviewKind', '=', 'CODE')
        .where('entryType', '=', 'DECISION')
        .where('decision', 'is not', null)

    return db
        .selectFrom('user')
        .select(['email', 'fullName'])
        .where('id', 'in', withCodeDeciders ? proposalDeciders.union(codeDeciders) : proposalDeciders)
        .where('email', 'is not', null)
        .$narrowType<{ email: string }>()
        .execute()
}

// Every version of the code is recorded by markCodeSubmitted as a CODE-SUBMITTED row naming its submitter.
async function getCodeSubmitterIds(studyId: string) {
    const rows = await db
        .selectFrom('jobStatusChange')
        .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
        .select('jobStatusChange.userId')
        .distinct()
        .where('studyJob.studyId', '=', studyId)
        .where('jobStatusChange.status', '=', 'CODE-SUBMITTED')
        .execute()

    return rows.map((row) => row.userId)
}

// The researcher, the PI, and any lab member who submitted a version of the proposal, plus code
// submitters when withCodeSubmitters is set. A PI without an account is left out.
async function getStudyLabAudience(studyId: string, study: StudyInfo, { withCodeSubmitters = false } = {}) {
    // researcherId is only the draft's creator. Any lab member can submit or re-finalize it, recorded only
    // by onStudyCreated's CREATED audit row; an edit-and-resubmit is recorded only by its note's author.
    const submitters = await db
        .selectFrom('audit')
        .select('userId')
        .distinct()
        .where('recordType', '=', 'STUDY')
        .where('recordId', '=', studyId)
        .where('eventType', '=', 'CREATED')
        .execute()

    const resubmitters = await db
        .selectFrom('studyProposalComment')
        .select('authorId')
        .distinct()
        .where('studyId', '=', studyId)
        .where('entryType', '=', 'RESUBMISSION-NOTE')
        .execute()

    const codeSubmitters = withCodeSubmitters ? await getCodeSubmitterIds(studyId) : []

    const userIds = [
        ...new Set([
            study.researcherId,
            study.piUserId,
            ...submitters.map((s) => s.userId),
            ...resubmitters.map((r) => r.authorId),
            ...codeSubmitters,
        ]),
    ].filter((id): id is string => Boolean(id))

    return db
        .selectFrom('user')
        .select(['email', 'fullName'])
        .where('id', 'in', userIds)
        .where('email', 'is not', null)
        .$narrowType<{ email: string }>()
        .execute()
}

type Recipient = { email: string; fullName: string }
type StudyMessage = { subject: string; template: string; vars: Record<string, unknown> }

// One send each rather than a Bcc, because the templates greet their reader by name.
async function deliverToEach(studyId: string, recipients: Recipient[], { vars, ...message }: StudyMessage) {
    if (recipients.length === 0) {
        logger.warn(`No recipients for ${message.template} email, studyId: ${studyId}`)
        return
    }

    await Promise.all(
        recipients.map((recipient) =>
            deliver({ ...message, to: recipient.email, vars: { ...vars, fullName: recipient.fullName } }),
        ),
    )
}

// Audience: the whole Data Partner org, Trigger: a lab submits a new or revised proposal.
export const sendStudyProposalEmails = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)

    await deliverToEach(studyId, await getOrgMembers(study.orgId), {
        subject: 'Proposal needs review',
        template: 'vb - new research proposal',
        vars: await dataPartnerReviewVars(studyId, study),
    })
}

// onStudyCreated is the only writer of CREATED/STUDY and audits before it mails, so the row for
// this submission is already there: a second one means the lab has submitted before.
const isResubmission = async (studyId: string) => {
    const { submissions } = await db
        .selectFrom('audit')
        .select((eb) => eb.fn.countAll().as('submissions'))
        .where('recordType', '=', 'STUDY')
        .where('recordId', '=', studyId)
        .where('eventType', '=', 'CREATED')
        .executeTakeFirstOrThrow()

    return Number(submissions) > 1
}

// Audience: SafeInsights admins, Trigger: a proposal is submitted to a Data Partner. Only they can
// draw the agreement up, and the study sits behind the gate until one of them publishes it.
export const sendStudyAgreementPreparationEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)

    // A test study is exempt from the agreement, so there is nothing to prepare.
    if (study.isTestStudy) return

    // An agreement already under way needs no second ask. A draft counts: submitStudyCodeAction
    // reaches here too, and its gate only passes once one is acknowledged.
    if (await findLegalDocument(db, { type: 'SLA', studyId })) return

    // The same proposal coming back is already on the admins' list.
    if (await isResubmission(studyId)) return

    const admins = await getSiAdmins()
    const emails = admins.map((admin) => admin.email).filter((email) => email)

    if (emails.length === 0) {
        logger.warn(`No SafeInsights admins to prepare a study agreement, studyId: ${studyId}`)
        return
    }

    // See OTTER-651: never put multiple recipient addresses in "To".
    await deliver({
        to: SI_AGREEMENTS_EMAIL,
        bcc: emails.join(', '),
        subject: `New ${legalDocumentTypeLabels.SLA} required`,
        template: 'vb - sla notice',
        vars: {
            ...baseStudyVars(study),
            studyURL: `${APP_BASE_URL}${Routes.studyReview({ orgSlug: study.orgSlug, studyId })}`,
            legalURL: `${APP_BASE_URL}${Routes.adminSafeinsightsLegal}`,
        },
    })
}

// Audience: the proposal's deciders, Trigger: a lab submits new or revised code.
export const sendStudyCodeSubmittedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)

    await deliverToEach(studyId, await getStudyDeciders(studyId), {
        subject: 'Code needs review',
        template: 'vb - new code submission',
        vars: await dataPartnerReviewVars(studyId, study),
    })
}

// Audience: research lab, Trigger: a Data Partner approves the proposal.
export const sendStudyProposalApprovedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)

    await deliverToEach(studyId, await getStudyLabAudience(studyId, study), {
        subject: 'Proposal approved',
        template: 'vb - research proposal approved',
        vars: await labDecisionVars(studyId, study),
    })
}

// Audience: research lab, Trigger: a Data Partner declines the proposal.
export const sendStudyProposalRejectedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)

    await deliverToEach(studyId, await getStudyLabAudience(studyId, study), {
        subject: 'Proposal declined',
        template: 'vb - research proposal rejected',
        vars: await labDecisionVars(studyId, study),
    })
}

// Audience: research lab, Trigger: a Data Partner requests changes to the proposal.
export const sendStudyProposalNeedsRevisionEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)

    await deliverToEach(studyId, await getStudyLabAudience(studyId, study), {
        subject: 'Proposal needs revision',
        template: 'vb - research proposal needs revision',
        vars: await labDecisionVars(studyId, study),
    })
}

// Audience: the Data Partner's deciders on the proposal or code, Trigger: a run completes with outputs
// to review, unless the job has already errored.
export const sendDataPartnerOutputsNeedReviewEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)

    await deliverToEach(studyId, await getStudyDeciders(studyId, { withCodeDeciders: true }), {
        subject: 'Outputs need review',
        template: 'vb - dp - outputs need review',
        vars: await dataPartnerReviewVars(studyId, study),
    })
}

// Audience: research lab, including anyone who submitted a version of the code, Trigger: a Data
// Partner approves the code.
export const sendStudyCodeApprovedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)

    await deliverToEach(studyId, await getStudyLabAudience(studyId, study, { withCodeSubmitters: true }), {
        subject: 'Study code approved',
        template: 'vb - code approved',
        vars: await labDecisionVars(studyId, study),
    })
}

// Audience: research lab, including anyone who submitted a version of the code, Trigger: a Data
// Partner requests changes to the code.
export const sendStudyCodeNeedsRevisionEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)

    await deliverToEach(studyId, await getStudyLabAudience(studyId, study, { withCodeSubmitters: true }), {
        subject: 'Code needs revision',
        template: 'vb - code needs revision',
        vars: await labDecisionVars(studyId, study),
    })
}

// Audience: the Data Partner's deciders on the proposal or code, Trigger: the job records JOB-ERRORED.
export const sendDataPartnerCodeErroredEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)

    await deliverToEach(studyId, await getStudyDeciders(studyId, { withCodeDeciders: true }), {
        subject: 'Code errored',
        template: 'vb - dp - code errored',
        vars: await dataPartnerReviewVars(studyId, study),
    })
}

// Audience: research lab, including anyone who submitted a version of the code, Trigger: a Data
// Partner submits their decision on an errored run's outputs.
export const sendLabCodeErroredEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)

    await deliverToEach(studyId, await getStudyLabAudience(studyId, study, { withCodeSubmitters: true }), {
        subject: 'Code errored',
        template: 'vb - rl - code errored',
        vars: await labDecisionVars(studyId, study),
    })
}

// Audience: research lab, including anyone who submitted a version of the code, Trigger: a Data
// Partner submits their decision on a completed run's outputs.
export const sendLabOutputsNeedReviewEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)

    await deliverToEach(studyId, await getStudyLabAudience(studyId, study, { withCodeSubmitters: true }), {
        subject: 'Outputs need review',
        template: 'vb - rl - outputs need review',
        vars: await labDecisionVars(studyId, study),
    })
}

// Audience: research lab, Trigger: SI admin publishes a signed Study Agreement.
export const sendStudyAgreementReadyEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)

    await deliverToEach(studyId, await getStudyLabAudience(studyId, study), {
        subject: `Acknowledge ${legalDocumentTypeLabels.SLA}`,
        template: 'vb - sla ready for acknowledgment',
        vars: {
            ...baseStudyVars(study),
            studyURL: `${APP_BASE_URL}${Routes.studySubmitted({ orgSlug: study.labSlug, studyId })}`,
        },
    })
}
