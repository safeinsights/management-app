import { Routes } from '@/lib/routes'
import { sessionFromClerk } from '@/server/clerk'
import { redirect } from 'next/navigation'
import { type ReactNode } from 'react'

// These pages previously relied on a client component that redirected in an effect — by which point
// the server had already rendered and streamed the admin payload to a non-admin member. Authorization
// has to resolve before rendering, so it lives here.
// The parent [orgSlug] layout has already established membership; this narrows it to admins.
export default async function OrgAdminLayout({
    children,
    params,
}: Readonly<{ children: ReactNode; params: Promise<{ orgSlug: string }> }>) {
    const { orgSlug } = await params
    const session = await sessionFromClerk()

    if (!session || (!session.orgs[orgSlug]?.isAdmin && !session.user.isSiAdmin)) {
        redirect(Routes.dashboard)
    }

    return <>{children}</>
}
