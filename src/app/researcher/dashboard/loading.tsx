import DashboardSkeleton from '@/components/layout/skeleton/dashboard'
import { Stack } from '@mantine/core'

export default function LoadingResearcherDashboard() {
    return (
        <Stack gap="md" px="md" py="sm">
            <DashboardSkeleton />
        </Stack>
    )
}
