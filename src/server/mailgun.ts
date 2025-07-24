import Mailgun from 'mailgun.js'
import logger from '@/lib/logger'
import { getConfigValue, CI_ENV, APP_BASE_URL, PROD_BUILD } from './config'

const SI_EMAIL = 'Safeinsights <no-reply@safeinsights.org>'

let _mg: null | ReturnType<Mailgun['client']> = null
let _domain = ''

export async function mailGunConfig(): Promise<[null | ReturnType<Mailgun['client']>, string]> {
    if (_mg && _domain) return [_mg, _domain]

    const key = await getConfigValue('MAILGUN_API_KEY', false)
    const domain = await getConfigValue('MAILGUN_DOMAIN', false)
    if (!key || !domain) {
        if (PROD_BUILD && !CI_ENV) throw new Error('Mailgun API key must be defined in production')
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

export async function deliver({
    to,
    bcc,
    from = SI_EMAIL,
    subject,
    template,
    vars,
}: {
    to?: string
    bcc?: string
    from?: string
    subject: string
    template: string
    vars: Record<string, unknown>
}) {
    const tmplVars = JSON.stringify(
        {
            applicationURL: APP_BASE_URL,
            ...vars,
        },
        null,
        2,
    )

    const [mg, domain] = await mailGunConfig()
    if (!mg) {
        logger.info(`Mailgun not configured, skipping sending: ${template} email`)
        logger.info('values that would have been used for email:')
        logger.info(tmplVars)
        return
    }

    try {
        await mg.messages.create(domain, {
            to,
            bcc,
            from,
            subject: `SafeInsights - ${subject}`,
            template,
            'h:X-Mailgun-Variables': tmplVars,
        })
    } catch (error) {
        logger.error(`mailgun send ${template} error:`, error)
    }
}
