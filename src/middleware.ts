import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

const isMemberRoute = createRouteMatcher(['/member(.*)'])
const isResearcherRoute = createRouteMatcher(['/researcher(.*)'])
const OPENSTAX_ORG_ID = 'org_2ohzjhfpKp4QqubW86FfXzzDm2I'
const SAFEINSIGHTS_ORG_ID = 'org_2oUWxfZ5UDD2tZVwRmMF8BpD2rD'

// Clerk middleware reference
// https://clerk.com/docs/references/nextjs/clerk-middleware

export default clerkMiddleware(async (auth, req: NextRequest) => {
    try {
        const { userId, orgId, orgRole, sessionClaims } = await auth()

        // TODO: Probably remove
        // Require organization selection and prevent personal account usage
        // if (userId && (!orgId || sessionClaims?.org_personal)) {
        //     if (!req.nextUrl.pathname.startsWith('/org-selection')) {
        //         return NextResponse.redirect(new URL('/org-selection', req.url))
        //     }
        // }

        // Check if user belongs to SafeInsights organization (admin - highest priority)
        const isAdmin = orgId === SAFEINSIGHTS_ORG_ID
        // Check if user belongs to OpenStax organization (if not admin)
        const isOrgMember = !isAdmin && orgId === OPENSTAX_ORG_ID
        // Check if user is a SafeInsights member (any OpenStax org member, if not admin)
        const isMember = isOrgMember
        // Define researcher status (users not admin and not in OpenStax)
        const isResearcher = !isAdmin && !isOrgMember

        console.log('[Middleware] Active Organization:', orgId)
        console.log('[Middleware] Current Role:', orgRole)
        console.log(`[Middleware] Current User is admin: ${isAdmin ? 'yes' : 'no'}`)
        console.log(`[Middleware] Current User is si_member: ${isMember ? 'yes' : 'no'}`)
        console.log(`[Middleware] Current User is si_researcher: ${isResearcher ? 'yes' : 'no'}`)

        // Handle authentication redirects
        if (req.nextUrl.pathname.startsWith('/reset-password') || 
            req.nextUrl.pathname.startsWith('/signup')) {
            if (userId) {
                return NextResponse.redirect(new URL('/', req.url))
            }
        }

        // TODO: Activate it for future usage if needed
        // Handle post-login redirects for members and researchers
        // if (userId && isOrgMember && req.nextUrl.pathname === '/') {
        //     if (isMember) {
        //         return NextResponse.redirect(new URL('/member/openstax/studies/review', req.url))
        //     } else {
        //         return NextResponse.redirect(new URL('/researcher/study/request/openstax', req.url))
        //     }
        // }

        // Handle member route protection
        if (isMemberRoute(req)) {
            // Only SI members and admins can access member routes
            if (!isMember && !isAdmin) {
                console.log('[Middleware] Access denied: Member route requires SI member or admin access')
                return new NextResponse(null, { status: 403 })
            }
        }

        // Handle researcher route protection
        if (isResearcherRoute(req)) {
            // Only researchers and admins can access researcher routes
            if (!isResearcher && !isAdmin) {
                console.log('[Middleware] Access denied: Researcher route requires researcher or admin access')
                return new NextResponse(null, { status: 403 })
            }
        }

    } catch (error) {
        console.error('Middleware error:', error)
    }

    return NextResponse.next()
})

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for routes below
        '/(member|researcher)(.*)',
        '/',
        '/(reset-password|signup)'
    ],
}
