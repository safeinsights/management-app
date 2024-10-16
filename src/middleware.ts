'use server'
import 'server-only'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
const isMemberRoute = createRouteMatcher(['/fix-me/member(.*)'])
const isResearcherRoute = createRouteMatcher(['/fix-me/researcher(.*)'])

// Clerk middleware reference
// https://clerk.com/docs/references/nextjs/clerk-middleware

export default clerkMiddleware((auth, req) => {
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
