import Mailgun from 'mailgun.js'
import logger from '@/lib/logger'
import { getConfigValue, PROD_ENV } from './config'
import { getStudyAndOrg, getUserById, getUsersByRoleAndOrgId } from '@/server/db/queries'
import dayjs from 'dayjs'

const SI_EMAIL = 'Safeinsights <no-reply@safeinsights.org>'
const BASE_URL = `https://${process.env.DOMAIN_NAME}`

let _mg: null | ReturnType<Mailgun['client']> = null
let _domain = ''

export async function mailGunConfig(): Promise<[null | ReturnType<Mailgun['client']>, string]> {
    if (_mg && _domain) return [_mg, _domain]

    const key = await getConfigValue('MAILGUN_API_KEY', false)
    const domain = await getConfigValue('MAILGUN_DOMAIN', false)
    if (!key || !domain) {
        if (PROD_ENV) throw new Error('Mailgun API key must be defined')
        logger.warn('Mailgun client is not initialized. Skipping email sending.')
        return [null, '']
    }

    _domain = domain
    const mailgun = new Mailgun(FormData)

    _mg = mailgun.client({
        username: 'api',
        key: key,
    })

    return [_mg, domain]
}

export const sendInviteEmail = async ({ emailTo, inviteId }: { inviteId: string; emailTo: string }) => {
    const [mg, domain] = await mailGunConfig()
    if (!mg) {
        logger.warn('Mailgun not configured, skipping invite email')
        return
    }

    logger.info('Attempting to send invite email', { emailTo, domain })

    try {
        await mg.messages.create(domain, {
            from: SI_EMAIL,
            to: [emailTo],
            subject: 'Get started with SafeInsights',
            template: 'welcome email',
            'h:X-Mailgun-Variables': JSON.stringify({
                inviteLink: `${BASE_URL}/account/invitation/${inviteId}`,
            }),
        })
        logger.info('Successfully sent invite email')
    } catch (error) {
        logger.error('Failed to send invite email', { error: error })
    }
}

export const sendStudyProposalEmails = async (studyId: string) => {
    const [mg, domain] = await mailGunConfig()
    if (!mg) return

    const study = await getStudyAndOrg(studyId)
    const reviewersToNotify = await getUsersByRoleAndOrgId('reviewer', study.orgId)
    const emails = reviewersToNotify.map((reviewer) => reviewer.email).filter((email) => email !== null)

    try {
        await mg.messages.create(domain, {
            from: SI_EMAIL,
            bcc: emails,
            subject: 'SafeInsights - New study proposal',
            template: 'vb - new research proposal',
            'h:X-Mailgun-Variables': JSON.stringify({
                studyTitle: study.title,
                submittedBy: study.researcherName,
                submittedOn: dayjs(study.createdAt).format('MM/DD/YYYY'),
                studyURL: `${BASE_URL}/organization/${study?.orgSlug}/study/${studyId}/review`,
            }),
        })
    } catch (error) {
        logger.error.log('sendStudyProposalEmails error: ', error)
    }
}

export const sendStudyProposalApprovedEmail = async (studyId: string) => {
    const [mg, domain] = await mailGunConfig()
    if (!mg) return

    const study = await getStudyAndOrg(studyId)
    const researcher = await getUserById(study.researcherId)

    if (!researcher.email) return

    try {
        await mg.messages.create(domain, {
            from: SI_EMAIL,
            to: researcher.email,
            subject: 'SafeInsights - Study Proposal Approved',
            template: 'vb - research proposal approved',
            'h:X-Mailgun-Variables': JSON.stringify({
                fullName: researcher.fullName,
                studyTitle: study.title,
                submittedBy: study.researcherName,
                submittedTo: study.orgName,
                submittedOn: dayjs(study.createdAt).format('MM/DD/YYYY'),
            }),
        })
    } catch (error) {
        logger.error.log('sendStudyProposalApprovedEmail error: ', error)
    }
}

export const sendStudyProposalRejectedEmail = async (studyId: string) => {
    const [mg, domain] = await mailGunConfig()
    if (!mg) return

    const study = await getStudyAndOrg(studyId)

    const researcher = await getUserById(study.researcherId)

    if (!researcher.email) return

    try {
        await mg.messages.create(domain, {
            from: SI_EMAIL,
            to: researcher.email,
            subject: 'SafeInsights - Study Proposal Rejected',
            template: 'vb - research proposal rejected',
            'h:X-Mailgun-Variables': JSON.stringify({
                fullName: researcher.fullName,
                studyTitle: study.title,
                submittedBy: study.researcherName,
                submittedTo: study.orgName,
                submittedOn: dayjs(study.createdAt).format('MM/DD/YYYY'),
                studyURL: `${BASE_URL}/organization/${study.orgSlug}/study/${studyId}/review`,
            }),
        })
    } catch (error) {
        logger.error.log('sendStudyProposalRejectedEmail error: ', error)
    }
}

export const sendResultsReadyForReviewEmail = async (studyId: string) => {
    const [mg, domain] = await mailGunConfig()
    if (!mg) return

    const study = await getStudyAndOrg(studyId)

    if (!study.reviewerId) {
        throw new Error('Missing study reviewer ID')
    }

    const reviewer = await getUserById(study.reviewerId)
    if (!reviewer.email) return

    try {
        await mg.messages.create(domain, {
            from: SI_EMAIL,
            to: reviewer.email,
            subject: 'SafeInsights - New study proposal',
            template: 'vb - encrypted results ready for review',
            'h:X-Mailgun-Variables': JSON.stringify({
                userFullName: reviewer.fullName,
                studyTitle: study.title,
                submittedBy: study.researcherName,
                submittedOn: dayjs(study.createdAt).format('MM/DD/YYYY'),
                studyURL: `${BASE_URL}/organization/${study.orgSlug}/study/${studyId}/review`,
            }),
        })
    } catch (error) {
        logger.error.log('sendResultsReadyForReviewEmail error: ', error)
    }
}

export const sendStudyResultsApprovedEmail = async (studyId: string) => {
    const [mg, domain] = await mailGunConfig()
    if (!mg) return

    const study = await getStudyAndOrg(studyId)
    const researcher = await getUserById(study.researcherId)

    if (!researcher.email) return

    try {
        await mg.messages.create(domain, {
            from: SI_EMAIL,
            to: researcher.email,
            subject: 'SafeInsights - Study Results',
            template: 'vb - study results approved',
            'h:X-Mailgun-Variables': JSON.stringify({
                fullName: researcher.fullName,
                studyTitle: study.title,
                submittedBy: study.researcherName,
                submittedTo: study.orgName,
                submittedOn: dayjs(study.createdAt).format('MM/DD/YYYY'),
                studyURL: `${BASE_URL}/organization/${study.orgSlug}/study/${studyId}/review`,
            }),
        })
    } catch (error) {
        logger.error.log('sendStudyResultsApprovedEmail error: ', error)
    }
}

export const sendStudyResultsRejectedEmail = async (studyId: string) => {
    const [mg, domain] = await mailGunConfig()
    if (!mg) return

    const study = await getStudyAndOrg(studyId)
    const researcher = await getUserById(study.researcherId)

    if (!researcher.email) return

    try {
        await mg.messages.create(domain, {
            from: SI_EMAIL,
            to: researcher.email,
            subject: 'SafeInsights - Study Results',
            template: 'vb - study results rejected',
            'h:X-Mailgun-Variables': JSON.stringify({
                fullName: researcher.fullName,
                studyTitle: study.title,
                submittedBy: study.researcherName,
                submittedTo: study.orgName,
                submittedOn: dayjs(study.createdAt).format('MM/DD/YYYY'),
            }),
        })
    } catch (error) {
        logger.error.log('sendStudyResultsRejectedEmail error: ', error)
    }
}
