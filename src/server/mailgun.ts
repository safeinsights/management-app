import Mailgun from 'mailgun.js'
import logger from '@/lib/logger'
import { getConfigValue, PROD_ENV  } from './config'


const SI_EMAIL = 'Safeinsights <no-reply@safeinsights.org>'


let _mg: null | ReturnType<Mailgun['client']> = null
let _domain = ''

export async function mailGunConfig(): Promise<[null | ReturnType<Mailgun['client']>, string]> {
    if (_mg && _domain) return [_mg, _domain]

    const key = await getConfigValue('MAILGUN_API_KEY', false)
    const domain = await getConfigValue('MAILGUN_DOMAIN', false)
    if (!key || !domain){
        if (PROD_ENV) throw new Error('Mailgun API key must be defined')
        logger.warn('Mailgun client is not initialized. Skipping email sending.')
        return [null, '']
    }

    _domain = domain
    const mailgun = new Mailgun(FormData)

    _mg = mailgun.client({
        username: 'api',
        key: key
    })

    return [_mg, domain]
}

export const sendWelcomeEmail = async (emailTo: string, fullName: string) => {
    const [mg, domain ] = await mailGunConfig()
    if (!mg) { return }

    try {
        await mg.messages.create(domain, {
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
