import Mailgun from 'mailgun.js'
import logger from '@/lib/logger'
import { getConfigValue, PROD_ENV } from './config'
import { getUsersByRoleAndMemberId } from '@/server/db/queries'
import dayjs from 'dayjs'
import { getStudyAction } from '@/server/actions/study.actions'
import { getMemberFromIdentifierAction } from '@/server/actions/member.actions'

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

export const sendWelcomeEmail = async (emailTo: string, fullName: string) => {
    const [mg, domain] = await mailGunConfig()
    if (!mg) {
        return
    }

    try {
        await mg.messages.create(domain, {
            from: SI_EMAIL,
            to: [emailTo],
            subject: 'Get started with SafeInsights',
            template: 'welcome email',
            'h:X-Mailgun-Variables': JSON.stringify({
                fullName,
                resetPasswordLink: `${BASE_URL}/account/reset-password`,
            }),
        })
    } catch (error) {
        logger.error.log('Welcome email error: ', error)
    }
}

export const sendStudyProposalEmails = async (
    memberId: string,
    studyName: string,
    researcherFullName: string,
    studyId: string,
) => {
    const [mg, domain] = await mailGunConfig()
    if (!mg) return

    const reviewersToNotify = await getUsersByRoleAndMemberId('reviewer', memberId)
    const member = await getMemberFromIdentifierAction(memberId)

    for (const reviewer of reviewersToNotify) {
        const email = reviewer.email
        if (!email) continue

        try {
            await mg.messages.create(domain, {
                from: SI_EMAIL,
                to: email,
                subject: 'SafeInsights - New study proposal',
                template: 'new research proposal',
                'h:X-Mailgun-Variables': JSON.stringify({
                    userFullName: reviewer.fullName,
                    studyName,
                    researcherFullName,
                    submittedOn: dayjs().format('MM/DD/YYYY'),
                    studyURL: `${BASE_URL}/member/${member?.identifier}/study/${studyId}/review`,
                }),
            })
        } catch (error) {
            logger.error.log('Study proposal email error: ', error)
        }
    }
}

export const sendStudyProposalApprovedEmail = async (memberId: string, studyId: string) => {
    const [mg, domain] = await mailGunConfig()
    if (!mg) return

    const studyDetails = await getStudyAction(studyId)
    const member = await getMemberFromIdentifierAction(memberId)

    const researchersToNotify = await getUsersByRoleAndMemberId('researcher', memberId)

    for (const researcher of researchersToNotify) {
        const email = researcher.email
        if (!email) continue

        try {
            await mg.messages.create(domain, {
                from: SI_EMAIL,
                to: email,
                subject: 'SafeInsights - Study Proposal Approved',
                template: 'research proposal approved',
                'h:X-Mailgun-Variables': JSON.stringify({
                    userFullName: researcher.fullName,
                    studyName: studyDetails?.title,
                    researcherFullName: studyDetails?.researcherName,
                    submittedTo: member?.name,
                    studyURL: `${BASE_URL}/member/${member?.identifier}/study/${studyId}/review`,
                }),
            })
        } catch (error) {
            logger.error.log('Study proposal email error: ', error)
        }
    }
}

export const sendStudyProposalRejectedEmail = async (memberId: string, studyId: string) => {
    const [mg, domain] = await mailGunConfig()
    if (!mg) return

    const studyDetails = await getStudyAction(studyId)
    const member = await getMemberFromIdentifierAction(memberId)

    const researchersToNotify = await getUsersByRoleAndMemberId('researcher', memberId)

    for (const researcher of researchersToNotify) {
        const email = researcher.email
        if (!email) continue

        try {
            await mg.messages.create(domain, {
                from: SI_EMAIL,
                to: email,
                subject: 'SafeInsights - Study Proposal Approved',
                template: 'research proposal rejected',
                'h:X-Mailgun-Variables': JSON.stringify({
                    userFullName: researcher.fullName,
                    studyName: studyDetails?.title,
                    researcherFullName: studyDetails?.researcherName,
                    submittedTo: member?.name,
                    studyURL: `${BASE_URL}/member/${member?.identifier}/study/${studyId}/review`,
                }),
            })
        } catch (error) {
            logger.error.log('Study proposal email error: ', error)
        }
    }
}
