import { db } from '@/database'
import { getStudyAndOrgDisplayInfo, getUserById, getUsersForOrgId } from '@/server/db/queries'
import dayjs from 'dayjs'
import { APP_BASE_URL } from './config'
import { deliver } from './mailgun'

// These queries use the global db directly (not Action.db) because email
// sending runs in after() callbacks where the action transaction is already committed.

async function getStudyDisplayInfo(studyId: string) {
    return await db
        .selectFrom('study')
        .innerJoin('user as researcher', 'study.researcherId', 'researcher.id')
        .leftJoin('user as reviewer', 'study.reviewerId', 'reviewer.id')
        .innerJoin('org', 'org.id', 'study.orgId')
        .select([
            'study.orgId',
            'study.researcherId',
            'study.title',
            'reviewer.email as reviewerEmail',
            'reviewer.fullName as reviewerFullName',
            'researcher.email as researcherEmail',
            'researcher.fullName as researcherFullName',
            'org.slug as orgSlug',
            'org.name as orgName',
            'study.createdAt',
        ])
        .where('study.id', '=', studyId)
        .executeTakeFirstOrThrow(() => new Error('Study & Org not found'))
}

async function getOrgMembers(orgId: string) {
    return db
        .selectFrom('user')
        .innerJoin('orgUser', 'user.id', 'orgUser.userId')
        .distinctOn('user.id')
        .select(['user.id', 'user.email', 'user.fullName'])
        .where('orgUser.orgId', '=', orgId)
        .execute()
}

type StudyInfo = Awaited<ReturnType<typeof getStudyDisplayInfo>>

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
    const study = await getStudyDisplayInfo(studyId)
    const reviewers = await getOrgMembers(study.orgId)
    const emails = reviewers.map((r) => r.email).filter(Boolean)

    // For local testing, send to a fixed 'to' email address that is authorized to
    // receive emails from Mailgun, and remove the 'vb -' prefix from the template name.
    await deliver({
        // to: 'stella.tetradis@gmail.com',
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

export const sendStudyCodeSubmittedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    const reviewersToNotify = await getUsersForOrgId(study.orgId)

    const emails = reviewersToNotify.map((reviewer) => reviewer.email).filter((email) => email)

    // TODO: reusing 'vb - new research proposal' template until a dedicated code-submission template is created in Mailgun
    await deliver({
        to: study.reviewerEmail ?? emails.join(', '),
        bcc: emails.join(', '),
        subject: 'Study code submitted for review',
        template: 'vb - new research proposal',
        vars: {
            studyTitle: study.title,
            submittedBy: study.researcherFullName,
            submittedOn: dayjs().format('MM/DD/YYYY'),
            studyURL: `${APP_BASE_URL}/${study.orgSlug}/study/${studyId}/review`,
        },
    })
}

// Audience: researcher, Trigger: Status == Proposal Approved
export const sendStudyProposalApprovedEmail = async (studyId: string) => {
    const study = await getStudyDisplayInfo(studyId)

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
    const study = await getStudyDisplayInfo(studyId)
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
            fullName: study.reviewerFullName,
            studyTitle: study.title,
            submittedBy: study.researcherFullName,
            submittedOn: dayjs(study.createdAt).format('MM/DD/YYYY'),
            studyURL: `${APP_BASE_URL}/${study.orgSlug}/study/${studyId}/review`,
        },
    })
}

export const sendStudyResultsApprovedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    const researcher = await getUserById(study.researcherId)

    if (!researcher.email) return

    await deliver({
        to: researcher.email,
        subject: 'Study Results',
        template: 'vb - study results approved',
        vars: {
            fullName: researcher.fullName,
            studyTitle: study.title,
            submittedBy: study.researcherFullName,
            submittedTo: study.orgName,
            submittedOn: dayjs(study.createdAt).format('MM/DD/YYYY'),
            studyURL: `${APP_BASE_URL}/researcher/study/${studyId}/review`,
        },
    })
}

export const sendStudyResultsRejectedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    const researcher = await getUserById(study.researcherId)

    if (!researcher.email) return

    await deliver({
        to: researcher.email,
        subject: 'Study Results',
        template: 'vb - study results rejected',
        vars: {
            fullName: researcher.fullName,
            studyTitle: study.title,
            submittedBy: study.researcherFullName,
            submittedTo: study.orgName,
            submittedOn: dayjs(study.createdAt).format('MM/DD/YYYY'),
        },
    })
}
