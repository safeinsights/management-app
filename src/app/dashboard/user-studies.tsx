'use client'

import { StudiesTable } from '@/components/dashboard/studies-table'
import { JoinedOrgBanner } from '@/components/dashboard/joined-org-banner'
import { DashboardHeaderSkeleton, TableSkeleton } from '@/components/layout/skeleton/dashboard'
import { PageHeader } from '@/components/page-header'
import { useInvitationNotices } from '@/hooks/use-invitation-notices'
import { useSession } from '@/hooks/session'
import type { UserSession } from '@/lib/types'
import { Paper, SegmentedControl, Stack } from '@mantine/core'
import type { Route } from 'next'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

type Audience = 'researcher' | 'reviewer'

function getAudienceFromQuery(audience: string | null): Audience | null {
    if (audience === 'researcher' || audience === 'reviewer') return audience
    return null
}

const hasMultipleOrgTypes = (session: UserSession | null | undefined) =>
    session ? new Set(Object.values(session.orgs).map((o) => o.type)).size > 1 : false

// A fresh visit opens on Reviewer (the card); a switch writes ?audience= so Back and refresh return
// to the tab the user chose.
function useMyStudiesAudience() {
    const { session } = useSession()
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const showToggle = hasMultipleOrgTypes(session)
    const singleRole: Audience = session?.belongsToEnclave ? 'reviewer' : 'researcher'
    const defaultAudience: Audience = showToggle ? 'reviewer' : singleRole
    const audience = showToggle ? (getAudienceFromQuery(searchParams.get('audience')) ?? defaultAudience) : singleRole

    const onAudienceChange = (value: string) => {
        const nextAudience = getAudienceFromQuery(value)
        if (!nextAudience) return

        const params = new URLSearchParams(searchParams.toString())
        params.set('audience', nextAudience)
        router.replace(`${pathname}?${params.toString()}` as Route)
    }

    return { session, audience, onAudienceChange, showToggle }
}

const RoleSwitcher = ({
    isVisible,
    audience,
    onChange,
}: {
    isVisible: boolean
    audience: Audience
    onChange: (value: string) => void
}) => {
    if (!isVisible) return null
    return (
        <SegmentedControl
            value={audience}
            onChange={onChange}
            radius="xs"
            p="xxs"
            color="navy"
            w="fit-content"
            data={[
                { label: 'Reviewer', value: 'reviewer' },
                { label: 'Researcher', value: 'researcher' },
            ]}
        />
    )
}

export default function UserStudiesDashboard() {
    const { session, audience, onAudienceChange, showToggle } = useMyStudiesAudience()
    useInvitationNotices()

    if (!session) {
        return (
            <Stack p="xxl" gap="xxl">
                <DashboardHeaderSkeleton />
                <Paper shadow="xs" p="xxl">
                    <TableSkeleton paperWrapper={false} />
                </Paper>
            </Stack>
        )
    }

    const isReviewer = audience === 'reviewer'

    return (
        <Stack p="xxl" gap="xxl">
            <PageHeader title="My studies" />
            <JoinedOrgBanner />
            <Stack gap="md">
                <RoleSwitcher isVisible={showToggle} audience={audience} onChange={onAudienceChange} />
                <Paper shadow="xs" p="xxl">
                    <StudiesTable
                        key={audience}
                        audience={audience}
                        scope="user"
                        orgSlug=""
                        title={isReviewer ? 'Studies for review' : 'All studies'}
                        description={
                            isReviewer
                                ? 'Studies you are reviewing, across every organization you belong to. Open a study to view its details, review submitted materials, and submit your decision.'
                                : 'Studies you have taken part in, across every organization you belong to. Open a study to check its status, view details, or take your next step.'
                        }
                        showNewStudyButton={!isReviewer}
                        showRefresher
                    />
                </Paper>
            </Stack>
        </Stack>
    )
}
