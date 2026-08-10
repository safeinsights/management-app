import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import log from '@/lib/logger'
import { Routes } from '@/lib/routes'
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

const isSIAdminRoute = createRouteMatcher(['/admin/safeinsights(.*)'])
// createRouteMatcher compiles with path-to-regexp, NOT the Next.js filesystem convention.
// `/[orgSlug]/admin/(.*)` looks right but treats the brackets as literal characters, so it
// matched nothing and failed silently — Clerk's bundled path-to-regexp fork does not throw
// where the standalone v8 does. The colon form is the one that actually captures a segment.
// `admin(.*)` rather than `admin/(.*)` so a bare `/:orgSlug/admin` is also gated.
const isOrgAdminRoute = createRouteMatcher(['/:orgSlug/admin(.*)'])
const isResearcherRoute = createRouteMatcher(['/researcher(.*)'])

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

// Returns a redirect response if the redirect_url is not safe, otherwise returns null (no change needed)
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

// Every matched path that renders a document goes through here rather than NextResponse.next()
// directly, so the nonce cannot be missed on one branch. The anon-route return is the easy one to
// overlook, and it serves /account/signin — the Clerk page that must not break. Not literally every
// document, though: the matcher below excludes `.html` paths, so e.g. /missing.html renders the App
// Router 404 with no CSP header at all — harmless, since no header means nothing to violate.
export function continueWithNonce(req: NextRequest): NextResponse {
    if (!isCspEnabled()) return NextResponse.next()

    const nonce = generateNonce()
    const reportUrl = cspReportUrl()
    const policy = cspHeaderValue(nonce, reportUrl)

    // Two request headers doing two different jobs — do not collapse them into one. Next only
    // learns the nonce by parsing it back out of a `content-security-policy` request header
    // (parseRequestHeaders in next/dist/server/app-render/app-render.js); that is what stamps its
    // inline hydration scripts. The enforcing name is deliberate even though the response ships
    // report-only: request headers never reach the browser, so nothing is enforced by this line.
    // x-csp-nonce is unrelated plumbing — the sanctioned way for our own server components to read
    // the raw nonce without re-parsing the policy string.
    const headers = new Headers(req.headers)
    headers.set(CSP_NONCE_HEADER, nonce)
    headers.set('content-security-policy', policy)

    const res = NextResponse.next({ request: { headers } })
    res.headers.set(CSP_HEADER, policy)
    if (reportUrl) res.headers.set(REPORTING_ENDPOINTS_HEADER, reportingEndpointsValue(reportUrl))
    return res
}

export const proxy = clerkMiddleware(async (auth, req) => {
    const redirectSanitized = sanitizeRedirectParam(req)
    if (redirectSanitized) return redirectSanitized

    const { userId: clerkUserId, sessionClaims } = await auth()

    // Check if this is an anonymous route before doing session work
    const isAnonRoute = ANON_ROUTES.some((r) => req.nextUrl.pathname.startsWith(r))

    let session: UserSession | null = null
    try {
        session = await marshalSession(clerkUserId, sessionClaims)
    } catch (error) {
        Sentry.captureException(error)
        log.error('Failed to marshal session:', error)
        // marshalSession only throws for a user Clerk still considers authenticated, so
        // treat stale/broken metadata as recoverable: regenerate it from the live Clerk
        // user instead of bouncing an authenticated user to signin.
        try {
            session = await marshalSession(clerkUserId, sessionClaims, { forceUpdate: true })
        } catch (retryError) {
            Sentry.captureException(retryError)
            log.error('Failed to marshal session after forced metadata re-sync:', retryError)
            // session stays null; the branch below keeps authenticated users signed in
            // with BLANK_SESSION rather than redirecting them to signin
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
            const intended = safeRedirectUrl(req.nextUrl.pathname + req.nextUrl.search, Routes.home)
            signInUrl.searchParams.set('redirect_url', intended)
            log.warn(`attempted to load ${req.nextUrl.pathname} while not logged in, redirecting to ${signInUrl}`)
            return NextResponse.redirect(signInUrl)
        }
    }

    const currentOrgSlug = extractOrgSlugFromPath(req.nextUrl.pathname)
    const currentOrg = currentOrgSlug ? getOrgFromSlug(session, currentOrgSlug) : null

    const isAdmin = currentOrg ? isOrgAdmin(currentOrg) : false

    if (isSIAdminRoute(req) && !session.user.isSiAdmin) {
        return redirectToDashboard(req, 'si admin', session)
    }

    if (isResearcherRoute(req) && !getLabOrg(session)) {
        return redirectToDashboard(req, 'researcher', session)
    }

    // extractOrgSlugFromPath already returns null for every non-org top-level prefix, so it —
    // not a route matcher — is what distinguishes `/acme/...` from `/dashboard`. A `/:orgSlug/(.*)`
    // matcher would match those too and is therefore not a usable guard on its own.
    if (currentOrgSlug) {
        if (!session.orgs[currentOrgSlug] && !session.user.isSiAdmin) {
            return redirectToDashboard(req, 'org-member', session)
        }

        if (isOrgAdminRoute(req) && !isAdmin && !session.user.isSiAdmin) {
            return redirectToDashboard(req, 'org-admin', session)
        }
    }

    return continueWithNonce(req)
})

export const config = {
    matcher: [
        // as optimziation and for clarity, we always run for routes below:
        '/(admin|dl|reviewer|researcher|organization)(.*)',
        // This regex should also match the above urls, but it's hard to read
        // We want to run on everything except:
        //   Next.js internals
        //   api requests: the api access wrapper accesses DB, but nextjs middleware doesn't support a full node env
        //   and all static files, unless found in search params
        '/((?!_next|api|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    ],
}
