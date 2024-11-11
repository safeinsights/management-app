import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

const isMemberRoute = createRouteMatcher(['/fix-me/member(.*)'])
const isResearcherRoute = createRouteMatcher(['/fix-me/researcher(.*)'])
const OPENSTAX_ORG_ID = 'org_2ohzjhfpKp4QqubW86FfXzzDm2I'

// Clerk middleware reference
// https://clerk.com/docs/references/nextjs/clerk-middleware

export default clerkMiddleware(async (auth, req: NextRequest) => {
    try {
        const { userId, orgId, orgRole, sessionClaims } = await auth()

        // Require organization selection and prevent personal account usage
        if (userId && (!orgId || sessionClaims?.org_personal)) {
            if (!req.nextUrl.pathname.startsWith('/org-selection')) {
                return NextResponse.redirect(new URL('/org-selection', req.url))
            }
        }
        
        const isOrgMember = orgId === OPENSTAX_ORG_ID
        const isSiMember = isOrgMember && orgRole === 'org:si_member'
        const isAdmin = isOrgMember && orgRole === 'org:admin'

        console.log('[Middleware] Active Organization:', orgId)
        console.log('[Middleware] Current Role:', orgRole)
        console.log(`[Middleware] Current User is member of org openstax: ${isOrgMember ? 'yes' : 'no'}`)
        console.log(`[Middleware] Current User is a SafeInsights member (si_member): ${isSiMember ? 'yes' : 'no'}`)
        console.log(`[Middleware] Current User is a SafeInsights admin (admin): ${isAdmin ? 'yes' : 'no'}`)

        // Handle authentication redirects
        if (req.nextUrl.pathname.startsWith('/reset-password') || 
            req.nextUrl.pathname.startsWith('/signup')) {
            if (userId) {
                return NextResponse.redirect(new URL('/', req.url))
            }
        }

        // // Handle route protection
        // if (isMemberRoute(req)) {
        //     if (!userId || !isOrgMember) {
        //         return NextResponse.redirect(new URL('/sign-in', req.url))
        //     }
        // }

        // if (isResearcherRoute(req)) {
        //     if (!userId || !isAdmin) {
        //         return NextResponse.redirect(new URL('/sign-in', req.url))
        //     }
        // }

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
