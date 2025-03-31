import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import debug from 'debug'

const middlewareDebug = debug('app:middleware')

const isAdminRoute = createRouteMatcher(['/admin(.*)'])
const isMemberRoute = createRouteMatcher(['/member(.*)'])
const isResearcherRoute = createRouteMatcher(['/researcher(.*)'])
const CLERK_ADMIN_ORG_SLUG = 'safe-insights'

const ANON_ROUTES: Array<string> = ['/account/reset-password', '/account/signup', '/account/signin']

// Clerk middleware reference
// https://clerk.com/docs/references/nextjs/clerk-middleware


//.redirect(new URL('/home', request.url))

type Roles = {
    isAdmin: boolean
    isMember: boolean
    isResearcher: boolean
}

function redirectToRole(request: NextRequest, route: string, roles: Roles) {
    middlewareDebug(`Blocking unauthorized ${route} route access: %o`, roles)
    if (roles.isResearcher) {
        return NextResponse.redirect(new URL('/researcher/dashboard', request.url))
    }
    return NextResponse.redirect(new URL('/', request.url))
}

export default clerkMiddleware(async (auth, req) => {
    const { userId, orgId, orgSlug } = await auth()

    if (!userId) {
        if (ANON_ROUTES.find((r) => req.nextUrl.pathname.startsWith(r))) {
            return NextResponse.next()
        }
        return NextResponse.redirect(new URL('/account/signin', req.url))
    }

    // Define user roles
    const userRoles: Roles = {
        isAdmin: orgSlug === CLERK_ADMIN_ORG_SLUG,
        get isMember() {
            return Boolean(orgSlug && !this.isAdmin)
        },
        get isResearcher() {
            return Boolean(!this.isAdmin && !this.isMember)
        },
    }

    if (isAdminRoute(req) && !userRoles.isAdmin) {
        return redirectToRole(req, 'admin', userRoles)
    }

    if (isMemberRoute(req) && !userRoles.isMember) {
        return redirectToRole(req, 'member', userRoles)
    }

    if (isResearcherRoute(req) && !userRoles.isResearcher) {
        middlewareDebug('Blocking unauthorized researcher route access: %o', { userId, orgId, userRoles })
        return new NextResponse(null, { status: 403 })
    }

    return NextResponse.next()
})

export const config = {
    matcher: [
        // as optimziation and for clarity, we always run for routes below:
        '/(admin|dl|member|researcher)(.*)',
        // This regex should also match the above urls, but it's hard to read
        // We want to run on everything except:
        //   Next.js internals
        //   api requests: the api access wrapper accesses DB, but nextjs middleware doesn't support a full node env
        //   and all static files, unless found in search params
        '/((?!_next|api|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    ],
}
