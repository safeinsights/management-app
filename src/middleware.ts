import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import debug from 'debug'
import * as Sentry from '@sentry/nextjs'
import { marshalSession } from './server/session'
import { type UserSession } from './lib/types'
const middlewareDebug = debug('app:middleware')

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

function redirectToRole(request: NextRequest, route: string, session: UserSession) {
    middlewareDebug(
        `Blocking unauthorized ${route} route access. session: %s`,
        request.url,
        JSON.stringify(session, null, 2),
    )
    if (session.team.isResearcher) {
        return NextResponse.redirect(new URL('/researcher/dashboard', request.url))
    }
    if (session.team.isReviewer) {
        return NextResponse.redirect(new URL(`/reviewer/${session.team.slug}/dashboard`, request.url))
    }
    return NextResponse.redirect(new URL('/', request.url))
}

export default clerkMiddleware(async (auth, req) => {
    const { userId: clerkUserId, sessionClaims } = await auth()

    const session = await marshalSession(clerkUserId, sessionClaims)

    if (session) {
        Sentry.setUser({
            id: session.user.id,
        })
        Sentry.setTag('org', session.team.slug)
    } else {
        if (ANON_ROUTES.find((r) => req.nextUrl.pathname.startsWith(r))) {
            return NextResponse.next()
        }
        const signInUrl = new URL('/account/signin', req.url)
        signInUrl.searchParams.set('redirect_url', req.nextUrl.pathname + req.nextUrl.search)
        return NextResponse.redirect(signInUrl)
    }

    if (isSIAdminRoute(req) && !session.user.isSiAdmin) {
        return redirectToRole(req, 'si admin', session)
    }

    if (isOrgAdminRoute(req) && !session.team.isAdmin && session.team.slug == req.nextUrl.pathname.split('/')[2]) {
        return redirectToRole(req, 'org-admin', session)
    }

    if (isReviewerRoute(req) && !session.team.isReviewer) {
        return redirectToRole(req, 'reviewer', session)
    }

    if (isResearcherRoute(req) && !session.team.isResearcher) {
        return redirectToRole(req, 'researcher', session)
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
