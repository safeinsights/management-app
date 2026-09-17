import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import log from '@/lib/logger'
import { Routes } from '@/lib/routes'
import { isOrgAdminPath, isResearcherPath, isSiAdminPath } from '@/lib/routes/access'
import { BOUNCE_PARAM, BOUNCE_VALUE } from '@/lib/signin-bounce'
import { safeRedirectUrl } from '@/lib/utils'
import { marshalSession } from './server/session'
import { type UserSession, BLANK_SESSION, isOrgAdmin, getLabOrg, type Org } from './lib/types'
import { omit } from 'remeda'
import { setSentryFromSession } from '@/lib/sentry'
import { extractOrgSlugFromPath } from '@/lib/paths'
import {
    CSP_HEADER,
    CSP_NONCE_HEADER,
    REPORTING_ENDPOINTS_HEADER,
    cspHeaderValue,
    cspReportUrl,
    generateNonce,
    isCspEnabled,
    reportingEndpointsValue,
} from '@/lib/csp'
import * as Sentry from '@sentry/nextjs'

const ANON_ROUTES: Array<string> = [
    '/about',
    '/account/reset-password',
    '/account/signin',
    '/account/invitation',
    '/editor-demo',
]

function getOrgFromSlug(session: UserSession, orgSlug: string): Org | null {
    return Object.values(session.orgs).find((org) => org.slug === orgSlug) || null
}

function redirectToDashboard(request: NextRequest, route: string, session: UserSession) {
    log.warn(
        `Blocking unauthorized ${route} route access to: `,
        request.url,
        JSON.stringify(omit(session as any, ['ability']), null, 2), // eslint-disable-line @typescript-eslint/no-explicit-any
    )
    return NextResponse.redirect(new URL('/dashboard', request.url))
}

function sanitizeRedirectParam(req: NextRequest): NextResponse | null {
    const redirectUrl = req.nextUrl.searchParams.get('redirect_url')
    if (!redirectUrl) return null

    const sanitized = safeRedirectUrl(redirectUrl, Routes.home)
    if (sanitized === redirectUrl) return null

    const cleanUrl = req.nextUrl.clone()
    if (sanitized === Routes.home) {
        cleanUrl.searchParams.delete('redirect_url')
    } else {
        cleanUrl.searchParams.set('redirect_url', sanitized)
    }
    return NextResponse.redirect(cleanUrl)
}

// Every document-rendering path goes through here rather than NextResponse.next() directly, so no
// branch can miss the nonce.
export function continueWithNonce(req: NextRequest): NextResponse {
    if (!isCspEnabled()) return NextResponse.next()

    const nonce = generateNonce()
    const reportUrl = cspReportUrl()
    const policy = cspHeaderValue(nonce, reportUrl)

    // Do not collapse these two. Next learns the nonce only by parsing a `content-security-policy`
    // request header; x-csp-nonce is how our own server components read the raw value.
    const headers = new Headers(req.headers)
    headers.set(CSP_NONCE_HEADER, nonce)
    headers.set('content-security-policy', policy)

    const res = NextResponse.next({ request: { headers } })
    res.headers.set(CSP_HEADER, policy)
    if (reportUrl) res.headers.set(REPORTING_ENDPOINTS_HEADER, reportingEndpointsValue(reportUrl))
    return res
}

export const proxy = clerkMiddleware(async (auth, req) => {
    const pathname = req.nextUrl.pathname

    const redirectSanitized = sanitizeRedirectParam(req)
    if (redirectSanitized) return redirectSanitized

    const { userId: clerkUserId, sessionClaims } = await auth()

    const isAnonRoute = ANON_ROUTES.some((r) => pathname.startsWith(r))

    let session: UserSession | null = null
    try {
        session = await marshalSession(clerkUserId, sessionClaims)
    } catch (error) {
        Sentry.captureException(error)
        log.error('Failed to marshal session:', error)
        // marshalSession only throws for a user Clerk still considers authenticated, so stale
        // metadata is recoverable: regenerate rather than bouncing them to signin.
        try {
            session = await marshalSession(clerkUserId, sessionClaims, { forceUpdate: true })
        } catch (retryError) {
            Sentry.captureException(retryError)
            log.error('Failed to marshal session after forced metadata re-sync:', retryError)
            // session stays null; the branch below falls back to BLANK_SESSION
        }
    }

    if (session) {
        setSentryFromSession(session)
    } else {
        if (isAnonRoute) {
            return continueWithNonce(req)
        }
        if (clerkUserId) {
            session = BLANK_SESSION
        } else {
            const signInUrl = new URL('/account/signin', req.url)
            const intended = safeRedirectUrl(pathname + req.nextUrl.search, Routes.home)
            signInUrl.searchParams.set('redirect_url', intended)
            // This branch is the only place that refuses a session, so the mark tells the signin page
            // that the server said no. Without it the page can only infer that from its own client
            // state, which is exactly the state that goes stale and stranded the prompt (OTTER-745).
            signInUrl.searchParams.set(BOUNCE_PARAM, BOUNCE_VALUE)
            log.warn(`attempted to load ${pathname} while not logged in, redirecting to ${signInUrl}`)
            return NextResponse.redirect(signInUrl)
        }
    }

    const currentOrgSlug = extractOrgSlugFromPath(pathname)
    const currentOrg = currentOrgSlug ? getOrgFromSlug(session, currentOrgSlug) : null

    const isAdmin = currentOrg ? isOrgAdmin(currentOrg) : false

    if (isSiAdminPath(pathname) && !session.user.isSiAdmin) {
        return redirectToDashboard(req, 'si admin', session)
    }

    if (isResearcherPath(pathname) && !getLabOrg(session)) {
        return redirectToDashboard(req, 'researcher', session)
    }

    // Membership hangs off extractOrgSlugFromPath, which is what tells `/acme/...` apart from
    // `/dashboard`: any `/:orgSlug/...` pattern matches both.
    if (currentOrgSlug) {
        if (!session.orgs[currentOrgSlug] && !session.user.isSiAdmin) {
            return redirectToDashboard(req, 'org-member', session)
        }

        if (isOrgAdminPath(pathname) && !isAdmin && !session.user.isSiAdmin) {
            return redirectToDashboard(req, 'org-admin', session)
        }
    }

    return continueWithNonce(req)
})

export const config = {
    matcher: [
        '/(admin|dl|reviewer|researcher|organization)(.*)',
        // Excludes api requests: the api access wrapper hits the DB and middleware has no full
        // node env.
        '/((?!_next|api|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    ],
}
