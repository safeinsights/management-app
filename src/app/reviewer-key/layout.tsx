export const dynamic = 'force-dynamic'

import { UserLayout } from '@/components/layout/user-layout'
import { getReviewerPublicKeyAction } from '@/server/actions/org.actions'
import { redirect } from 'next/navigation'

type Props = { children: React.ReactNode }

export default async function ReviewerLayout({ children }: Props) {
    const key = await getReviewerPublicKeyAction()

    if (!key) {
        redirect('/account/keys')
    }

    return <UserLayout>{children}</UserLayout>
}
