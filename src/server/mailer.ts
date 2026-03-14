import { db } from '@/database'
import { getStudyAndOrgDisplayInfo } from '@/server/db/queries'
import dayjs from 'dayjs'
import { APP_BASE_URL } from './config'
import { deliver } from './mailgun'

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
        submittedOn: dayjs(study.createdAt).format('MM/DD/YYYY'),
        orgName: study.orgName,
    }
}

export const sendInviteEmail = async ({ emailTo, inviteId }: { inviteId: string; emailTo: string }) => {
    await deliver({
        to: emailTo,
        subject: 'Get started with SafeInsights',
        template: 'welcome email',
        vars: {
            inviteLink: `${APP_BASE_URL}/account/invitation/${inviteId}`,
        },
    })
}

// Audience: reviewer, Trigger: Status == PENDING-REVIEW (initial)
export const sendStudyProposalEmails = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    const reviewers = await getOrgMembers(study.orgId)
    const emails = reviewers.map((r) => r.email).filter(Boolean)

    await deliver({
        to: study.reviewerEmail ?? emails.join(', '),
        bcc: emails.join(', '),
        subject: 'New study proposal',
        template: 'vb - new research proposal',
        vars: {
            ...baseStudyVars(study),
            dashboardURL: `${APP_BASE_URL}/${study.orgSlug}/dashboard`,
        },
    })
}

// Audience: reviewer, Trigger: Status == Code Needs Review
export const sendStudyCodeSubmittedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    const reviewers = await getOrgMembers(study.orgId)
    const emails = reviewers.map((reviewer) => reviewer.email).filter((email) => email)

    await deliver({
        to: study.reviewerEmail ?? emails.join(', '),
        bcc: emails.join(', '),
        subject: 'Study code submitted for review',
        template: 'vb - new code submission',
        vars: {
            ...baseStudyVars(study),
            fullName: study.reviewerFullName,
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
