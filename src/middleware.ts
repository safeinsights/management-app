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
const SAFEINSIGHTS_ORG_SLUG = 'safe-insights'

const MFA_ROUTE = '/account/mfa'

const ANON_ROUTES: Array<string> = ['/account/reset-password', '/account/signup', '/account/signin']

// Clerk middleware reference
// https://clerk.com/docs/references/nextjs/clerk-middleware

export default clerkMiddleware(async (auth, req) => {
    const { userId, orgId, orgRole, orgSlug, sessionClaims } = await auth()
    console.log(sessionClaims)
    if (!userId) {
        if (ANON_ROUTES.find((r) => req.nextUrl.pathname.startsWith(r))) {
            return NextResponse.next()
        }
        return NextResponse.redirect(new URL('/account/signin', req.url))
    }

    // Define user roles
    const userRoles = {
        isAdmin: orgSlug === SAFEINSIGHTS_ORG_SLUG,
        isOpenStaxMember: orgSlug === OPENSTAX_ORG_SLUG,
        hasMFA: !!sessionClaims?.hasMFA,
        get isMember() {
            return this.isOpenStaxMember && !this.isAdmin
        },
        get isResearcher() {
            return !this.isAdmin && !this.isOpenStaxMember
        },
    }

    middlewareDebug('Auth check: %o', {
        organization: orgId,
        role: orgRole,
        userId,
        ...userRoles,
    })

    // if they don't have MFA and are not currently adding it, force them to do so
    if (!userRoles.hasMFA && !req.nextUrl.pathname.startsWith(MFA_ROUTE)) {
    }

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

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for routes below
        '/(dl|member|researcher)(.*)',
    ],
}
