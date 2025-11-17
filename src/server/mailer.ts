import { getStudyAndOrgDisplayInfo, getUserById, getUsersForOrgId } from '@/server/db/queries'
import dayjs from 'dayjs'
import { APP_BASE_URL } from './config'
import { deliver } from './mailgun'

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

export const sendStudyProposalEmails = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    const reviewersToNotify = await getUsersForOrgId(study.orgId)

    const emails = reviewersToNotify.map((reviewer) => reviewer.email).filter((email) => email)

    if (!study.reviewerEmail) throw new Error(`no reviewer is set for studyId: ${studyId}`)

    await deliver({
        to: study.reviewerEmail,
        bcc: emails.join(', '),
        subject: 'New study proposal',
        template: 'vb - new research proposal',
        vars: {
            studyTitle: study.title,
            submittedBy: study.researcherFullName,
            submittedOn: dayjs(study.createdAt).format('MM/DD/YYYY'),
            studyURL: `${APP_BASE_URL}/${study.orgSlug}/study/${studyId}/review`,
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
            fullName: study.researcherFullName,
            studyTitle: study.title,
            submittedBy: study.researcherFullName,
            submittedTo: study.orgName,
            submittedOn: dayjs(study.createdAt).format('MM/DD/YYYY'),
        },
    })
}

export const sendStudyProposalRejectedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)

    const researcher = await getUserById(study.researcherId)

    if (!researcher.email) return

    await deliver({
        to: researcher.email,
        subject: 'Study Proposal Rejected',
        template: 'vb - research proposal rejected',
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
