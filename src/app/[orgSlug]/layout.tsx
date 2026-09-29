import { UserLayout } from '@/components/layout/user-layout'
import { Routes } from '@/lib/routes'
import { sessionFromClerk } from '@/server/clerk'
import { redirect } from 'next/navigation'
import { type ReactNode } from 'react'

// Middleware is not the authorization boundary: direct RSC/segment requests bypass it. Re-check
// membership here so a non-member never gets a rendered payload for another org's pages.
export default async function OrgLayout({
    children,
    params,
}: Readonly<{ children: ReactNode; params: Promise<{ orgSlug: string }> }>) {
    const { orgSlug } = await params
    const session = await sessionFromClerk()

    if (!session || (!session.orgs[orgSlug] && !session.user.isSiAdmin)) {
        redirect(Routes.dashboard)
    }

    return <UserLayout>{children}</UserLayout>
}
