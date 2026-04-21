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
import * as Sentry from '@sentry/nextjs'

const isSIAdminRoute = createRouteMatcher(['/admin/safeinsights(.*)'])
const isOrgAdminRoute = createRouteMatcher(['/[orgSlug]/admin/(.*)'])
const isOrgRoute = createRouteMatcher(['/[orgSlug]'])
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
        // Don't redirect if already on signin page to avoid redirect loop
        if (isAnonRoute) {
            return NextResponse.next()
        }
        return NextResponse.redirect(new URL('/account/signin?error=session', req.url))
    }

    if (session) {
        setSentryFromSession(session)
    } else {
        if (ANON_ROUTES.find((r) => req.nextUrl.pathname.startsWith(r))) {
            return NextResponse.next()
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

    if (isOrgAdminRoute(req) && !isAdmin && currentOrgSlug) {
        return redirectToDashboard(req, 'org-admin', session)
    }

    if (isOrgRoute(req) && (!currentOrgSlug || !session.orgs[currentOrgSlug])) {
        return redirectToDashboard(req, 'org-member', session)
    }

    return NextResponse.next()
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
