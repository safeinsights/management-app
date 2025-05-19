import Mailgun from 'mailgun.js'
import logger from '@/lib/logger'
import { getConfigValue, PROD_ENV } from './config'
import { getStudyAndOrgDisplayInfo, getUserById, getUsersByRoleAndOrgId } from '@/server/db/queries'
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

async function deliver({
    to,
    from = SI_EMAIL,
    subject,
    template,
    vars,
}: {
    to: string
    from?: string
    subject: string
    template: string
    vars: Record<string, unknown>
}) {
    const tmplVars = JSON.stringify(vars, null, 2)

    const [mg, domain] = await mailGunConfig()
    if (!mg) {
        logger.info(`Mailgun not configured, skipping sending ${template} email`)
        logger.info('values that would have been used for email:')
        logger.info(tmplVars)
        return
    }

    try {
        await mg.messages.create(domain, {
            to,
            from,
            subject,
            template,
            'h:X-Mailgun-Variables': tmplVars,
        })
    } catch (error) {
        logger.error.log(`mailgun send ${template} error: ${error}`)
    }
}

export const sendInviteEmail = async ({ emailTo, inviteId }: { inviteId: string; emailTo: string }) => {
    await deliver({
        to: emailTo,
        subject: 'Get started with SafeInsights',
        template: 'welcome email',
        vars: {
            inviteLink: `${BASE_URL}/account/invitation/${inviteId}`,
        },
    })
}

export const sendStudyProposalEmails = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    const reviewersToNotify = await getUsersByRoleAndOrgId('reviewer', study.orgId)
    const emails = reviewersToNotify.map((reviewer) => reviewer.email).filter((email) => email !== null)
    await deliver({
        to: emails.join(', '),
        subject: 'SafeInsights - New study proposal',
        template: 'vb - new research proposal',
        vars: {
            studyTitle: study.title,
            submittedBy: study.researcherFullName,
            submittedOn: dayjs(study.createdAt).format('MM/DD/YYYY'),
            studyURL: `${BASE_URL}/organization/${study.orgSlug}/study/${studyId}/review`,
        },
    })
}

export const sendStudyProposalApprovedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    const researcher = await getUserById(study.researcherId)
    if (!researcher.email) return

    await deliver({
        to: researcher.email,
        subject: 'SafeInsights - Study Proposal Approved',
        template: 'vb - research proposal approved',
        vars: {
            fullName: researcher.fullName,
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
        subject: 'SafeInsights - Study Proposal Rejected',
        template: 'vb - research proposal rejected',
        vars: {
            fullName: researcher.fullName,
            studyTitle: study.title,
            submittedBy: study.researcherFullName,
            submittedTo: study.orgName,
            submittedOn: dayjs(study.createdAt).format('MM/DD/YYYY'),
            studyURL: `${BASE_URL}/organization/${study.orgSlug}/study/${studyId}/review`,
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
        subject: 'SafeInsights - New study proposal',
        template: 'vb - encrypted results ready for review',
        vars: {
            userFullName: study.reviewerFullName,
            studyTitle: study.title,
            submittedBy: study.researcherFullName,
            submittedOn: dayjs(study.createdAt).format('MM/DD/YYYY'),
            studyURL: `${BASE_URL}/organization/${study.orgSlug}/study/${studyId}/review`,
        },
    })
}

export const sendStudyResultsApprovedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    const researcher = await getUserById(study.researcherId)

    if (!researcher.email) return

    await deliver({
        to: researcher.email,
        subject: 'SafeInsights - Study Results',
        template: 'vb - study results approved',
        vars: {
            fullName: researcher.fullName,
            studyTitle: study.title,
            submittedBy: study.researcherFullName,
            submittedTo: study.orgName,
            submittedOn: dayjs(study.createdAt).format('MM/DD/YYYY'),
            studyURL: `${BASE_URL}/organization/${study.orgSlug}/study/${studyId}/review`,
        },
    })
}

export const sendStudyResultsRejectedEmail = async (studyId: string) => {
    const study = await getStudyAndOrgDisplayInfo(studyId)
    const researcher = await getUserById(study.researcherId)

    if (!researcher.email) return

    await deliver({
        to: researcher.email,
        subject: 'SafeInsights - Study Results',
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
