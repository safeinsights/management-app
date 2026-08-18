import { db } from '@/database'
import { getStudyAndOrgDisplayInfo } from '@/server/db/queries'
import dayjs from 'dayjs'
import { APP_BASE_URL } from './config'
import { pathForInvitation } from '@/lib/paths'
import logger from '@/lib/logger'
import { deliver, SI_EMAIL } from './mailgun'

// For local testing, send to a fixed 'to' email address that is authorized to
// receive emails from Mailgun, and remove the 'vb -' prefix from the template name.

async function getOrgMembers(orgId: string) {
    return db
        .selectFrom('user')
        .innerJoin('orgUser', 'user.id', 'orgUser.userId')
        .distinctOn('user.id')
        .select(['user.id', 'user.email', 'user.fullName'])
        .where('orgUser.orgId', '=', orgId)
        .execute()
}

type StudyInfo = Awaited<ReturnType<typeof getStudyAndOrgDisplayInfo>>

function baseStudyVars(study: StudyInfo) {
    return {
        studyTitle: study.title,
        submittedBy: study.researcherFullName,
        submittedOn: dayjs().format('MM/DD/YYYY'),
        submittedTo: study.orgName,
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

// Audience: reviewer, Trigger: Status == PENDING-REVIEW (initial)
export const sendStudyProposalEmails = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    const reviewers = await getOrgMembers(study.orgId)
    const emails = reviewers.map((r) => r.email).filter(Boolean)

    if (emails.length === 0) {
        logger.warn(`No recipients for study proposal email, studyId: ${studyId}`)
        return
    }

    // All recipients go in Bcc so no one sees another's address (OTTER-651).
    // Mailgun requires at least one "To", so we use the no-reply sender.
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

// TODO(SHRMP-277, Iris): sendStudyAgreementPreparationEmail — SI admin needs the study id and proposal URL to
// draw the agreement up by hand in Zoho Sign.

// Audience: reviewer, Trigger: Status == Code Needs Review
export const sendStudyCodeSubmittedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    const reviewers = await getOrgMembers(study.orgId)
    const emails = reviewers.map((reviewer) => reviewer.email).filter((email) => email)

    if (emails.length === 0) {
        logger.warn(`No recipients for study code submitted email, studyId: ${studyId}`)
        return
    }

    // See OTTER-651: never put multiple recipient addresses in "To".
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

// Audience: researcher, Trigger: Status == Proposal Approved
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

// Audience: researcher, Trigger: Status == Proposal Rejected
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

// Audience: reviewer, Trigger: Status == Results Needs Review
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

// Audience: researcher, Trigger: Status == Code Approved
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

// Audience: researcher, Trigger: Status == Code Rejected
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

// Audience: researcher, Trigger: Status == Results Approved
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

// Audience: researcher, Trigger: Status == Results Rejected
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

// Audience: research lab, Trigger: SI admin publishes a signed Study Agreement
export const sendStudyAgreementReadyEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)

    // piUserId is null until the PI holds an account, and until then there is no address for them.
    const pi = study.piUserId
        ? await db.selectFrom('user').select(['email', 'fullName']).where('id', '=', study.piUserId).executeTakeFirst()
        : undefined

    const emails = [...new Set([study.researcherEmail, pi?.email].filter(Boolean))] as string[]

    if (emails.length === 0) {
        logger.warn(`No recipients for study agreement email, studyId: ${studyId}`)
        return
    }

    // See OTTER-651: never put multiple recipient addresses in "To".
    await deliver({
        to: SI_EMAIL,
        bcc: emails.join(', '),
        subject: 'Study Agreement ready to acknowledge',
        // TODO(Iris): replace with the real Mailgun template once it exists.
        template: 'vb - study agreement ready',
        vars: {
            ...baseStudyVars(study),
            studyURL: `${APP_BASE_URL}/${study.orgSlug}/study/${studyId}/submitted`,
        },
    })
}
