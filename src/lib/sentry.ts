import * as Sentry from '@sentry/nextjs'
import { UserSession } from './types'

export function setSentryFromSession(session: UserSession) {
    Sentry.setUser({ id: session.user.id })
    Sentry.setTag('orgs', Object.keys(session.orgs).join(','))
}
