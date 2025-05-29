import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import debug from 'debug'
import { CLERK_ADMIN_ORG_SLUG } from './lib/types'

const middlewareDebug = debug('app:middleware')

const isSIAdminRoute = createRouteMatcher(['/admin(.*)'])
const isOrgAdminRoute = createRouteMatcher(['/organization/(.*)/admin(.*)'])
const isReviewerRoute = createRouteMatcher(['/reviewer(.*)'])
const isResearcherRoute = createRouteMatcher(['/researcher(.*)'])

const ANON_ROUTES: Array<string> = [
    '/account/reset-password',
    '/account/signup',
    '/account/signin',
    '/account/invitation',
]

// Clerk middleware reference
// https://clerk.com/docs/references/nextjs/clerk-middleware

type UserInfo = {
    orgSlug: string

    userId: string
    isSIAdmin: boolean
    isOrgAdmin: (slug: string) => boolean
    isReviewer: boolean
    isResearcher: boolean
}

function redirectToRole(request: NextRequest, route: string, clerkUser: string, info: UserInfo) {
    middlewareDebug(`Blocking unauthorized ${route} route access: %s roles: %s`, clerkUser, JSON.stringify(info))
    if (info.isResearcher) {
        return NextResponse.redirect(new URL('/researcher/dashboard', request.url))
    }
    if (info.isReviewer) {
        return NextResponse.redirect(new URL(`/reviewer/${info.orgSlug}/dashboard`, request.url))
    }
    return NextResponse.redirect(new URL('/', request.url))
}

export default clerkMiddleware(async (auth, req) => {
    const { userId: clerkUserId, orgSlug, sessionClaims } = await auth()

    const metadata = sessionClaims?.userMetadata || { orgs: [], userId: '' }

    if (!clerkUserId) {
        if (ANON_ROUTES.find((r) => req.nextUrl.pathname.startsWith(r))) {
            return NextResponse.next()
        }
        return NextResponse.redirect(new URL('/account/signin', req.url))
    }

    // Define user roles
    const info: UserInfo = {
        orgSlug: orgSlug || metadata.orgs?.[0]?.slug || '',
        userId: metadata.userId,
        get isSIAdmin() {
            return orgSlug == CLERK_ADMIN_ORG_SLUG
        },
        isOrgAdmin(slug: string) {
            return Boolean(this.isSIAdmin || metadata.orgs?.find((org) => org.slug === slug && org.isAdmin))
        },
        get isReviewer() {
            return Boolean(this.isOrgAdmin || metadata.orgs?.find((org) => org.slug === this.orgSlug && org.isReviewer))
        },
        get isResearcher() {
            return Boolean(
                this.isOrgAdmin || metadata.orgs?.find((org) => org.slug === this.orgSlug && org.isResearcher),
            )
        },
    }

    if (isSIAdminRoute(req) && !info.isSIAdmin) {
        return redirectToRole(req, 'si admin', clerkUserId, info)
    }

    if (isOrgAdminRoute(req) && !info.isOrgAdmin(req.nextUrl.pathname.split('/')[2])) {
        return redirectToRole(req, 'org-admin', clerkUserId, info)
    }

    if (isReviewerRoute(req) && !info.isReviewer) {
        return redirectToRole(req, 'reviewer', clerkUserId, info)
    }

    if (isResearcherRoute(req) && !info.isResearcher) {
        return redirectToRole(req, 'researcher', clerkUserId, info)
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
