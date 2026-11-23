import { UserLayout } from '@/components/layout/user-layout'

export const dynamic = 'force-dynamic'

type Props = { children: React.ReactNode }

export default function ReviewerLayout({ children }: Props) {
    return <UserLayout>{children}</UserLayout>
}
