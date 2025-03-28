import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import logger from '@/lib/logger'
import debug from 'debug'

const middlewareDebug = debug('app:middleware')

/**
 * Example Clerk auth() response structure:
 * ```typescript
 * {
 *   sessionClaims: {
 *     azp: "http://localhost:4000",
 *     exp: 1730995945,
 *     iat: 1730995885,
 *     iss: "https://example.clerk.accounts.dev",
 *     nbf: 1730995875,
 *     org_id: "org_xxxxxxxxxxxxxxxxxxxx",
 *     org_permissions: [],
 *     org_role: "org:admin",
 *     org_slug: "example-org",
 *     sid: "sess_xxxxxxxxxxxxxxxxxxxx",
 *     sub: "user_xxxxxxxxxxxxxxxxxxxx"
 *   },
 *   sessionId: "sess_xxxxxxxxxxxxxxxxxxxx",
 *   userId: "user_xxxxxxxxxxxxxxxxxxxx",
 *   orgId: "org_xxxxxxxxxxxxxxxxxxxx",
 *   orgRole: "org:admin",
 *   orgSlug: "example-org",
 *   orgPermissions: [],
 *   __experimental_factorVerificationAge: null
 * }
 * ```
 */

const isMemberRoute = createRouteMatcher(['/member(.*)'])
const isResearcherRoute = createRouteMatcher(['/researcher(.*)'])
const OPENSTAX_ORG_SLUG = 'openstax'
const CLERK_ADMIN_ORG_SLUG = 'safe-insights'

const MFA_ROUTE = '/account/mfa'

const ANON_ROUTES: Array<string> = ['/account/reset-password', '/account/signup', '/account/signin']

// Clerk middleware reference
// https://clerk.com/docs/references/nextjs/clerk-middleware

export default clerkMiddleware(async (auth, req) => {
    const { userId, orgId, orgSlug, sessionClaims } = await auth()

    if (!userId) {
        if (ANON_ROUTES.find((r) => req.nextUrl.pathname.startsWith(r))) {
            return NextResponse.next()
        }
        return NextResponse.redirect(new URL('/account/signin', req.url))
    }

    // Define user roles
    const userRoles = {
        isAdmin: orgSlug === CLERK_ADMIN_ORG_SLUG,
        hasMFA: !!sessionClaims?.hasMFA,
        get isMember() {
            return orgSlug && !this.isAdmin
        },
        get isResearcher() {
            return !this.isAdmin && !this.isMember
        },
    }

    // middlewareDebug('Auth check: %o', {
    //     organization: orgId,
    //     role: orgRole,
    //     userId,
    //     ...userRoles,
    // })

    // TODO Redirect users to different URIs based on their role? ie:
    //  member -> /member
    //  researcher -> /researcher
    //  admin -> /admin
    //  or should this happen somewhere else

    // Route protection
    const routeProtection = {
        member: isMemberRoute(req) && !userRoles.isMember && !userRoles.isAdmin,
        researcher: isResearcherRoute(req) && !userRoles.isResearcher && !userRoles.isAdmin,
    }

    if (routeProtection.member) {
        logger.warn('Access denied: Member route requires member or admin access')
        middlewareDebug('Blocking unauthorized member route access: %o', { userId, orgId, userRoles })
        return new NextResponse(null, { status: 403 })
    }

    if (routeProtection.researcher) {
        logger.warn('Access denied: Researcher route requires researcher or admin access')
        middlewareDebug('Blocking unauthorized researcher route access: %o', { userId, orgId, userRoles })
        return new NextResponse(null, { status: 403 })
    }

    return NextResponse.next()
})

//
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
