import { Routes } from '@/lib/routes'
import { sessionFromClerk } from '@/server/clerk'
import { redirect } from 'next/navigation'
import { type ReactNode } from 'react'

// Authorization must resolve before rendering: a client-side effect redirect would already have
// streamed the admin payload to a non-admin member.
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
