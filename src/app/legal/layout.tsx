import { UserLayout } from '@/components/layout/user-layout'

export const dynamic = 'force-dynamic'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
    return <UserLayout>{children}</UserLayout>
}
