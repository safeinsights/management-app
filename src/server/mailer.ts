import { getStudyAndOrgDisplayInfo, getUserById, getUsersByRoleAndOrgId } from '@/server/db/queries'
import dayjs from 'dayjs'
import logger from '@/lib/logger'

const BASE_URL = `https://${process.env.DOMAIN_NAME}`

import { deliver } from './mailgun'

export const sendInviteEmail = async ({ emailTo, inviteId }: { inviteId: string; emailTo: string }) => {
    try {
        await deliver({
            to: emailTo,
            subject: 'Get started with SafeInsights',
            template: 'welcome email',
            vars: {
                inviteLink: `${BASE_URL}/account/invitation/${inviteId}`,
            },
        })
    } catch (e) {
        logger.error('Failed to send invite email', e)
    }
}

export const sendStudyProposalEmails = async (studyId: string) => {
    try {
        const study = await getStudyAndOrgDisplayInfo(studyId)
        const reviewersToNotify = await getUsersByRoleAndOrgId('reviewer', study.orgId)

        const emails = reviewersToNotify.map((reviewer) => reviewer.email).filter((email) => email)

        await deliver({
            bcc: emails.join(', '),
            subject: 'New study proposal',
            template: 'vb - new research proposal',
            vars: {
                studyTitle: study.title,
                submittedBy: study.researcherFullName,
                submittedOn: dayjs(study.createdAt).format('MM/DD/YYYY'),
                studyURL: `${BASE_URL}/reviewer/${study.orgSlug}/study/${studyId}/review`,
            },
        })
    } catch (e) {
        logger.error('Failed to send study proposal emails', e)
    }
}

export const sendStudyProposalApprovedEmail = async (studyId: string) => {
    try {
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
    } catch (e) {
        logger.error('Failed to send study proposal approved email', e)
    }
}

export const sendStudyProposalRejectedEmail = async (studyId: string) => {
    try {
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
                studyURL: `${BASE_URL}/researcher/study/${studyId}/review`,
            },
        })
    } catch (e) {
        logger.error('Failed to send study proposal rejected email', e)
    }
}

export const sendResultsReadyForReviewEmail = async (studyId: string) => {
    try {
        const study = await getStudyAndOrgDisplayInfo(studyId)

        if (!study.reviewerEmail || !study.reviewerFullName) {
            throw new Error('Missing study reviewer')
        }

        await deliver({
            to: study.reviewerEmail,
            subject: 'Results ready for review',
            template: 'vb - encrypted results ready for review',
            vars: {
                userFullName: study.reviewerFullName,
                studyTitle: study.title,
                submittedBy: study.researcherFullName,
                submittedOn: dayjs(study.createdAt).format('MM/DD/YYYY'),
                studyURL: `${BASE_URL}/organization/${study.orgSlug}/study/${studyId}/review`,
            },
        })
    } catch (e) {
        logger.error('Failed to send results ready for review email', e)
    }
}

export const sendStudyResultsApprovedEmail = async (studyId: string) => {
    try {
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
                studyURL: `${BASE_URL}/researcher/study/${studyId}/review`,
            },
        })
    } catch (e) {
        logger.error('Failed to send study results approved email', e)
    }
}

export const sendStudyResultsRejectedEmail = async (studyId: string) => {
    try {
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
    } catch (e) {
        logger.error('Failed to send study results rejected email', e)
    }
}
