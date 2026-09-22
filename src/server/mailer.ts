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
import { deliver, SI_EMAIL } from './mailgun'

async function getOrgMembers(orgId: string) {
    return db
        .selectFrom('user')
        .innerJoin('orgUser', 'user.id', 'orgUser.userId')
        .distinctOn('user.id')
        .select(['user.id', 'user.email', 'user.fullName'])
        .where('orgUser.orgId', '=', orgId)
        .execute()
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

export const sendStudyProposalEmails = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    const reviewers = await getOrgMembers(study.orgId)
    const emails = reviewers.map((r) => r.email).filter(Boolean)

    if (emails.length === 0) {
        logger.warn(`No recipients for study proposal email, studyId: ${studyId}`)
        return
    }

    // Bcc so no one sees another's address; Mailgun requires at least one "To" (OTTER-651).
    await deliver({
        to: SI_EMAIL,
        bcc: emails.join(', '),
        subject: 'New study proposal',
        template: 'vb - new research proposal',
        vars: {
            ...baseStudyVars(study),
            dashboardURL: `${APP_BASE_URL}/${study.orgSlug}/dashboard`,
        },
    })
}

// Audience: SafeInsights admins, Trigger: a proposal is submitted to a Data Partner. Only they can
// draw the agreement up, and the study sits behind the gate until one of them publishes it.
export const sendStudyAgreementPreparationEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)

    // A test study is exempt from the agreement, so there is nothing to prepare.
    if (study.isTestStudy) return

    // Resubmission after CHANGE-REQUESTED runs the same submit path, so without this an admin who
    // has already started the agreement is asked for it again. A draft counts as started.
    if (await findLegalDocument(db, { type: 'SLA', studyId })) return

    const admins = await getSiAdmins()
    const emails = admins.map((admin) => admin.email).filter((email) => email)

    if (emails.length === 0) {
        logger.warn(`No SafeInsights admins to prepare a study agreement, studyId: ${studyId}`)
        return
    }

    // See OTTER-651: never put multiple recipient addresses in "To".
    await deliver({
        to: SI_EMAIL,
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

export const sendStudyCodeSubmittedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    const reviewers = await getOrgMembers(study.orgId)
    const emails = reviewers.map((reviewer) => reviewer.email).filter((email) => email)

    if (emails.length === 0) {
        logger.warn(`No recipients for study code submitted email, studyId: ${studyId}`)
        return
    }

    await deliver({
        to: SI_EMAIL,
        bcc: emails.join(', '),
        subject: 'Study code submitted for review',
        template: 'vb - new code submission',
        vars: {
            ...baseStudyVars(study),
            fullName: study.reviewerFullName ?? '',
            dashboardURL: `${APP_BASE_URL}/dashboard?audience=reviewer`,
        },
    })
}

export const sendStudyProposalApprovedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)

    if (!study.researcherEmail) throw new Error(`no researcher is set for studyId: ${studyId}`)

    await deliver({
        to: study.researcherEmail,
        subject: 'Study Proposal Approved',
        template: 'vb - research proposal approved',
        vars: {
            ...baseStudyVars(study),
            fullName: study.researcherFullName,
            dashboardURL: `${APP_BASE_URL}/dashboard?audience=researcher`,
        },
    })
}

export const sendStudyProposalRejectedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    if (!study.researcherEmail) return

    await deliver({
        to: study.researcherEmail,
        subject: 'Study Proposal Rejected',
        template: 'vb - research proposal rejected',
        vars: {
            ...baseStudyVars(study),
            fullName: study.researcherFullName,
            dashboardURL: `${APP_BASE_URL}/dashboard?audience=researcher`,
        },
    })
}

export const sendResultsReadyForReviewEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)

    if (!study.reviewerEmail || !study.reviewerFullName) {
        throw new Error('Missing study reviewer')
    }

    await deliver({
        to: study.reviewerEmail,
        subject: 'Results ready for review',
        template: 'vb - encrypted results ready for review',
        vars: {
            ...baseStudyVars(study),
            fullName: study.reviewerFullName,
            dashboardURL: `${APP_BASE_URL}/dashboard?audience=reviewer`,
        },
    })
}

export const sendStudyCodeApprovedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    if (!study.researcherEmail) return

    await deliver({
        to: study.researcherEmail,
        subject: 'Study Code Approved',
        template: 'vb - code approved',
        vars: {
            ...baseStudyVars(study),
            fullName: study.researcherFullName,
            dashboardURL: `${APP_BASE_URL}/dashboard?audience=researcher`,
        },
    })
}

export const sendStudyCodeRejectedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    if (!study.researcherEmail) return

    await deliver({
        to: study.researcherEmail,
        subject: 'Study Code Rejected',
        template: 'vb - code rejected',
        vars: {
            ...baseStudyVars(study),
            fullName: study.researcherFullName,
            dashboardURL: `${APP_BASE_URL}/dashboard?audience=researcher`,
        },
    })
}

export const sendStudyResultsApprovedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    if (!study.researcherEmail) return

    await deliver({
        to: study.researcherEmail,
        subject: 'Study Results',
        template: 'vb - study results approved',
        vars: {
            ...baseStudyVars(study),
            fullName: study.researcherFullName,
            dashboardURL: `${APP_BASE_URL}/dashboard?audience=researcher`,
        },
    })
}

export const sendStudyResultsRejectedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    if (!study.researcherEmail) return

    await deliver({
        to: study.researcherEmail,
        subject: 'Study Results',
        template: 'vb - study results rejected',
        vars: {
            ...baseStudyVars(study),
            fullName: study.researcherFullName,
            dashboardURL: `${APP_BASE_URL}/dashboard?audience=researcher`,
        },
    })
}

// The lab side of the agreement. researcherId is the original submitter, and a later version can be
// submitted by any lab member, who is recorded only as the author of its resubmission note. A PI
// holding no account has no address and drops out.
async function getStudyAgreementAudience(studyId: string, study: StudyInfo) {
    const resubmitters = await db
        .selectFrom('studyProposalComment')
        .select('authorId')
        .distinct()
        .where('studyId', '=', studyId)
        .where('entryType', '=', 'RESUBMISSION-NOTE')
        .execute()

    const userIds = [...new Set([study.researcherId, study.piUserId, ...resubmitters.map((r) => r.authorId)])].filter(
        (id): id is string => Boolean(id),
    )

    return db
        .selectFrom('user')
        .select(['email', 'fullName'])
        .where('id', 'in', userIds)
        .where('email', 'is not', null)
        .$narrowType<{ email: string }>()
        .execute()
}

// Audience: research lab, Trigger: SI admin publishes a signed Study Agreement. One send each rather
// than a Bcc, because the template greets its reader by name.
export const sendStudyAgreementReadyEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    const recipients = await getStudyAgreementAudience(studyId, study)

    if (recipients.length === 0) {
        logger.warn(`No recipients for study agreement email, studyId: ${studyId}`)
        return
    }

    const studyURL = `${APP_BASE_URL}${Routes.studySubmitted({ orgSlug: study.labSlug, studyId })}`

    await Promise.all(
        recipients.map((recipient) =>
            deliver({
                to: recipient.email,
                subject: `Acknowledge ${legalDocumentTypeLabels.SLA}`,
                template: 'vb - sla ready for acknowledgment',
                vars: {
                    ...baseStudyVars(study),
                    fullName: recipient.fullName,
                    studyURL,
                },
            }),
        ),
    )
}
