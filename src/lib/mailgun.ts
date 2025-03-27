import FormData from 'form-data'
import Mailgun from 'mailgun.js'
import logger from '@/lib/logger'
import { DEV_ENV, TEST_ENV } from '@/server/config'

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || ''
if (!MAILGUN_API_KEY) {
    if (DEV_ENV || TEST_ENV) {
        console.warn('Mailgun API key not defined. Emails will not be sent in this environment.')
    } else {
        throw new Error('Mailgun API key must be defined')
    }
}

const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || ''

const SI_EMAIL = 'Safeinsights <no-reply@safeinsights.org>'
const mailgun = new Mailgun(FormData)

export const mg = MAILGUN_API_KEY
    ? mailgun.client({
          username: 'api',
          key: MAILGUN_API_KEY,
      })
    : null

export const sendWelcomeEmail = async (emailTo: string, fullName: string) => {
    if (!mg) {
        console.warn('Mailgun client is not initialized. Skipping email sending.')
        return
    }

    try {
        await mg.messages.create(MAILGUN_DOMAIN, {
            from: SI_EMAIL,
            to: [emailTo],
            subject: 'Get started with SafeInsights',
            template: 'welcome email',
            'h:X-Mailgun-Variables': JSON.stringify({
                fullName,
                resetPasswordLink: `https://${process.env.DOMAIN_NAME}/account/reset-password`,
            }),
        })
    } catch (error) {
        logger.error.log('Welcome email error: ', error)
    }
}
