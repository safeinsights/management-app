import FormData from 'form-data'
import Mailgun from 'mailgun.js'
import logger from '@/lib/logger'

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || ''
if (!MAILGUN_API_KEY) console.warn('Mailgun API key not defined')

const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || ''

const SI_EMAIL = 'Safeinsights <no-reply@safeinsights.org>'
const mailgun = new Mailgun(FormData)
export const mg = mailgun.client({
    username: 'api',
    key: MAILGUN_API_KEY,
})

export const sendWelcomeEmail = async (emailTo: string, fullName: string) => {
    try {
        await mg.messages.create(MAILGUN_DOMAIN, {
            from: SI_EMAIL,
            to: [emailTo],
            subject: 'Get started with SafeInsights',
            template: 'welcome email',
            'h:X-Mailgun-Variables': JSON.stringify({
                fullName,
            }),
        })
    } catch (error) {
        logger.error.log('Welcome email error: ', error)
    }
}
