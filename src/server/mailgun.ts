import Mailgun from 'mailgun.js'
import logger from '@/lib/logger'
import { getConfigValue, PROD_ENV } from './config'
import { getUsersByRoleAndMemberId } from '@/server/db/queries'
import dayjs from 'dayjs'
import { getStudyAction } from '@/server/actions/study.actions'
import { getMemberFromIdAction } from '@/server/actions/member.actions'

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

const getStudyAndMember = async (studyId: string) => {
    const study = await getStudyAction(studyId)
    // TODO DISCUSS in general, do we want to throw? or return undefined if no study found inside getStudyAction?
    if (!study) throw new Error('Study not found')
    const member = await getMemberFromIdAction(study.memberId)
    if (!member) throw new Error('Member not found')

    return { study, member }
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
        logger.error.log('sendWelcomeEmail error: ', error)
    }
}

export const sendStudyProposalEmails = async (studyId: string) => {
    const [mg, domain] = await mailGunConfig()
    if (!mg) return

    const { study, member } = await getStudyAndMember(studyId)
    const reviewersToNotify = await getUsersByRoleAndMemberId('reviewer', member.id)

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
                    studyName: study.title,
                    researcherFullName: study.researcherName,
                    submittedOn: dayjs().format('MM/DD/YYYY'),
                    studyURL: `${BASE_URL}/member/${member?.slug}/study/${studyId}/review`,
                }),
            })
        } catch (error) {
            logger.error.log('sendStudyProposalEmails error: ', error)
        }
    }
}

export const sendStudyProposalApprovedEmail = async (studyId: string) => {
    const [mg, domain] = await mailGunConfig()
    if (!mg) return

    const { study, member } = await getStudyAndMember(studyId)

    const researchersToNotify = await getUsersByRoleAndMemberId('researcher', member.id)

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
                    studyName: study.title,
                    researcherFullName: study.researcherName,
                    submittedTo: member.name,
                    studyURL: `${BASE_URL}/member/${member?.slug}/study/${studyId}/review`,
                }),
            })
        } catch (error) {
            logger.error.log('sendStudyProposalApprovedEmail error: ', error)
        }
    }
}

export const sendStudyProposalRejectedEmail = async (studyId: string) => {
    const [mg, domain] = await mailGunConfig()
    if (!mg) return

    const { study, member } = await getStudyAndMember(studyId)

    const researchersToNotify = await getUsersByRoleAndMemberId('researcher', member.id)

    for (const researcher of researchersToNotify) {
        const email = researcher.email
        if (!email) continue

        try {
            await mg.messages.create(domain, {
                from: SI_EMAIL,
                to: email,
                subject: 'SafeInsights - Study Proposal Rejected',
                template: 'research proposal rejected',
                'h:X-Mailgun-Variables': JSON.stringify({
                    userFullName: researcher.fullName,
                    studyName: study.title,
                    researcherFullName: study.researcherName,
                    submittedTo: member.name,
                    studyURL: `${BASE_URL}/member/${member.slug}/study/${studyId}/review`,
                }),
            })
        } catch (error) {
            logger.error.log('sendStudyProposalRejectedEmail error: ', error)
        }
    }
}

export const sendResultsReadyForReviewEmail = async (studyId: string) => {
    const [mg, domain] = await mailGunConfig()
    if (!mg) return

    const { study, member } = await getStudyAndMember(studyId)
    const reviewersToNotify = await getUsersByRoleAndMemberId('reviewer', member.id)

    for (const reviewer of reviewersToNotify) {
        const email = reviewer.email
        if (!email) continue

        try {
            await mg.messages.create(domain, {
                from: SI_EMAIL,
                to: email,
                subject: 'SafeInsights - New study proposal',
                template: 'vb - encrypted results ready for review',
                'h:X-Mailgun-Variables': JSON.stringify({
                    userFullName: reviewer.fullName,
                    studyName: study.title,
                    submittedOn: dayjs().format('MM/DD/YYYY'),
                    studyURL: `${BASE_URL}/member/${member?.slug}/study/${studyId}/review`,
                }),
            })
        } catch (error) {
            logger.error.log('sendResultsReadyForReviewEmail error: ', error)
        }
    }
}

export const sendStudyResultsApprovedEmail = async (studyId: string) => {
    const [mg, domain] = await mailGunConfig()
    if (!mg) return

    const { study, member } = await getStudyAndMember(studyId)

    const researchersToNotify = await getUsersByRoleAndMemberId('researcher', member.id)

    for (const researcher of researchersToNotify) {
        const email = researcher.email
        if (!email) continue

        try {
            await mg.messages.create(domain, {
                from: SI_EMAIL,
                to: email,
                subject: 'SafeInsights - Study Results',
                template: 'study results approved',
                'h:X-Mailgun-Variables': JSON.stringify({
                    userFullName: researcher.fullName,
                    studyName: study.title,
                    researcherFullName: study.researcherName,
                    submittedTo: member.name,
                    studyURL: `${BASE_URL}/member/${member?.slug}/study/${studyId}/review`,
                }),
            })
        } catch (error) {
            logger.error.log('sendStudyResultsApprovedEmail error: ', error)
        }
    }
}

export const sendStudyResultsRejectedEmail = async (studyId: string) => {
    const [mg, domain] = await mailGunConfig()
    if (!mg) return

    const { study, member } = await getStudyAndMember(studyId)

    const researchersToNotify = await getUsersByRoleAndMemberId('researcher', member.id)

    for (const researcher of researchersToNotify) {
        const email = researcher.email
        if (!email) continue

        try {
            await mg.messages.create(domain, {
                from: SI_EMAIL,
                to: email,
                subject: 'SafeInsights - Study Results',
                template: 'study results rejected',
                'h:X-Mailgun-Variables': JSON.stringify({
                    userFullName: researcher.fullName,
                    studyName: study.title,
                    researcherFullName: study.researcherName,
                    submittedTo: member.name,
                    dashboardURL: `${BASE_URL}/researcher/dashboard`,
                }),
            })
        } catch (error) {
            logger.error.log('sendStudyResultsRejectedEmail error: ', error)
        }
    }
}
