import { clerkMiddleware, createRouteMatcher, auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isMemberRoute = createRouteMatcher(['/member/(.*)'])
const isResearcherRoute = createRouteMatcher(['/researcher/(.*)'])

const SAFEINSIGHTS_ORG_ID = 'org_2oUWxfZ5UDD2tZVwRmMF8BpD2rD'

export default clerkMiddleware(async (auth, req) => {
    const { userId, organizations } = auth
    
    // Redirect logged-in users away from auth pages
    if (req.nextUrl.pathname.startsWith('/reset-password') || req.nextUrl.pathname.startsWith('/signup')) {
        if (userId) {
            return NextResponse.redirect(new URL('/', req.url))
        }
        return
    }

    // Check if user is a member of SafeInsights org with si_member role
    const isSiMember = organizations?.some(
        org => org.id === SAFEINSIGHTS_ORG_ID && org.membership?.role === 'si_member'
    )

    // Member route access control
    if (isMemberRoute(req)) {
        if (!isSiMember) {
            return new NextResponse(null, { status: 403 })
        }
        return
    }

    // Researcher route access control
    if (isResearcherRoute(req)) {
        if (isSiMember) {
            return new NextResponse(null, { status: 403 })
        }
        return
    }
})

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for routes above
        '/(member|researcher)(.*)',
    ],
}
