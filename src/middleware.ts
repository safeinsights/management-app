import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

const isMemberRoute = createRouteMatcher(['/fix-me/member(.*)'])
const isResearcherRoute = createRouteMatcher(['/fix-me/researcher(.*)'])
const SAFEINSIGHTS_ORG_ID = 'org_2oUWxfZ5UDD2tZVwRmMF8BpD2rD'

// Clerk middleware reference
// https://clerk.com/docs/references/nextjs/clerk-middleware

export default clerkMiddleware(async (auth, req: NextRequest) => {
    try {
        const { userId, orgRole, orgId } = await auth()

        // Check organization memberships
        const isOrgMember = (orgId === SAFEINSIGHTS_ORG_ID)
        const isSiMember = (orgRole === 'org:si_member')
        const isAdmin = (orgRole === 'org:admin')

        // console.log('Current user:', user)
        console.log(`[Middleware] Current User is member of org SafeInsights: ${isOrgMember ? 'yes' : 'no'}`)
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
