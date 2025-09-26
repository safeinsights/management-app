import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import log from '@/lib/logger'
import { marshalSession } from './server/session'
import { type UserSession, BLANK_SESSION, isLabOrg, isEnclaveOrg, isOrgAdmin, type Org } from './lib/types'
import { omit } from 'remeda'
import { setSentryFromSession } from '@/lib/sentry'
import { extractOrgSlugFromPath } from '@/lib/paths'
const isSIAdminRoute = createRouteMatcher(['/admin/safeinsights(.*)'])
const isOrgAdminRoute = createRouteMatcher(['/admin/team(.*)/admin(.*)'])
const isReviewerRoute = createRouteMatcher(['/reviewer(.*)'])
const isResearcherRoute = createRouteMatcher(['/researcher(.*)'])

const ANON_ROUTES: Array<string> = [
    '/account/reset-password',
    '/account/signup',
    '/account/signin',
    '/account/invitation',
]

function getOrgFromSlug(session: UserSession, orgSlug: string): Org | null {
    return Object.values(session.orgs).find((org) => org.slug === orgSlug) || null
}

function redirectToDashboard(request: NextRequest, route: string, session: UserSession) {
    log.warn(
        `Blocking unauthorized ${route} route access. session: %s`,
        request.url,
        JSON.stringify(omit(session as any, ['ability']), null, 2), // eslint-disable-line @typescript-eslint/no-explicit-any
    )
    return NextResponse.redirect(new URL('/dashboard', request.url))
}

export default clerkMiddleware(async (auth, req) => {
    const { userId: clerkUserId, sessionClaims } = await auth()

    let session: UserSession | null = await marshalSession(clerkUserId, sessionClaims)

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
            signInUrl.searchParams.set('redirect_url', req.nextUrl.pathname + req.nextUrl.search)
            log.warn(`attempted to load ${req.nextUrl.pathname} while not logged in, redirecting to ${signInUrl}`)
            return NextResponse.redirect(signInUrl)
        }
    }

    const currentOrgSlug = extractOrgSlugFromPath(req.nextUrl.pathname)
    const currentOrg = currentOrgSlug ? getOrgFromSlug(session, currentOrgSlug) : null

    const isAdmin = currentOrg ? isOrgAdmin(currentOrg) : false
    const isResearcher = currentOrg ? isLabOrg(currentOrg) : false
    const isReviewer = currentOrg ? isEnclaveOrg(currentOrg) : false

    if (isSIAdminRoute(req) && !session.user.isSiAdmin) {
        return redirectToDashboard(req, 'si admin', session)
    }

    if (isOrgAdminRoute(req) && !isAdmin && currentOrgSlug) {
        return redirectToDashboard(req, 'org-admin', session)
    }

    if (isReviewerRoute(req) && !(isReviewer || isAdmin)) {
        return redirectToDashboard(req, 'reviewer', session)
    }

    if (isResearcherRoute(req) && !(isResearcher || isAdmin)) {
        return redirectToDashboard(req, 'researcher', session)
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
