'use server'
import 'server-only'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
const isMemberRoute = createRouteMatcher(['/fix-me/member(.*)'])
const isResearcherRoute = createRouteMatcher(['/fix-me/researcher(.*)'])

// Clerk middleware reference
// https://clerk.com/docs/references/nextjs/clerk-middleware

export default clerkMiddleware((auth, req) => {
    const { userId, user } = auth()

    const SAFEINSIGHTS_ORG_ID = 'org_2oUWxfZ5UDD2tZVwRmMF8BpD2rD'

    const isOrgMember = user?.organizationMemberships?.some(
        membership => membership.organization.id === SAFEINSIGHTS_ORG_ID
    )
    const isSiMember = user?.organizationMemberships?.some(
        membership => membership.organization.id === SAFEINSIGHTS_ORG_ID && membership.role === 'org:si_member'
    )
    const isAdmin = user?.organizationMemberships?.some(
        membership => membership.organization.id === SAFEINSIGHTS_ORG_ID && membership.role === 'org:admin'
    )

    console.log('[Middleware] Current user:', user)
    console.log(`[Middleware] Current User is member of org SafeInsights: ${isOrgMember ? 'yes' : 'no'}`)
    console.log(`[Middleware] Current User is a SafeInsights member (si_member): ${isSiMember ? 'yes' : 'no'}`)
    console.log(`[Middleware] Current User is a SafeInsights admin (admin): ${isAdmin ? 'yes' : 'no'}`)

    // Do not allow and redirect certain paths when logged in (e.g. password resets, signup)
    if (req.nextUrl.pathname.startsWith('/reset-password') || req.nextUrl.pathname.startsWith('/signup')) {
        if (userId) {
            return NextResponse.redirect(new URL('/', req.url))
        }
    }

    if (isMemberRoute(req))
        auth().protect((has) => {
            return (
                // TODO check for membership identifier in url and check group
                has({ permission: 'org:sys_memberships' }) || has({ permission: 'org:sys_domains_manage' })
            )
        })

    if (isResearcherRoute(req))
        auth().protect((has) => {
            return (
                // TODO setup groups and perms, check them here
                has({ permission: 'org:researcher' })
            )
        })
})

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for routes above
        '/(member|researcher)(.*)',
    ],
}
