import DashboardSkeleton from '@/components/layout/skeleton/dashboard'
import { mainStyles, pageStyles } from '@/styles/common'

export default function LoadingRoot() {
    return (
        <div className={pageStyles}>
            <main className={mainStyles}>
                <DashboardSkeleton />
            </main>
        </div>
    )
}
