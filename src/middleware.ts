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

    // For researcher routes, ensure they're not using SafeInsights org
    if (isResearcherRoute(req)) {
        return NextResponse.next()
    }

    // For member routes, require SafeInsights membership
    if (isMemberRoute(req)) {
        if (!userId) {
            return NextResponse.redirect(new URL('/sign-in', req.url))
        }
        
        const isSiMember = organizations?.some(
            org => org.id === SAFEINSIGHTS_ORG_ID && org.membership?.role === 'si_member'
        )
        
        // Debug logging
        console.log('Organizations:', organizations)
        console.log('Is SafeInsights member:', isSiMember)
        console.log('User ID:', userId)
        
        if (!isSiMember) {
            return new NextResponse(null, { status: 403 })
        }
    }

    return NextResponse.next()
})

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for routes above
        '/(member|researcher)(.*)',
    ],
}
