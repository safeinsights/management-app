export const dynamic = 'force-dynamic'

import { UserLayout } from '@/components/layout/user-layout'
import { actionResult } from '@/lib/utils'
import { reviewerKeyExistsAction } from '@/server/actions/user-keys.actions'
import { redirect } from 'next/navigation'

type Props = { children: React.ReactNode }

export default async function ReviewerLayout({ children }: Props) {
    const hasKey = actionResult(await reviewerKeyExistsAction())

    if (!hasKey) {
        redirect('/account/keys')
    }

    return <UserLayout>{children}</UserLayout>
}
