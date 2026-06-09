import type { ReactNode } from 'react'
import type { Route } from 'next'
import { Divider, Group, Stack, Title } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { OrgBreadcrumbs } from '@/components/page-breadcrumbs'
import { ButtonLink } from '@/components/links'

// Presentational chrome for the DO "Study Details" (results review) page. It owns the
// breadcrumbs, title, divider, and "Previous" link, but NOT the data fetch (the job comes
// from @/server/db) or the results body — that arrives via `children`. Keeping it free of
// server-only imports lets it render in isolation (e.g. Ladle). The StudyDetailsReviewer
// container (./study-details-reviewer) fetches the job and supplies the real results body.
export type StudyDetailsReviewerViewProps = {
    orgSlug: string
    previousHref: Route
    children: ReactNode
}

export function StudyDetailsReviewerView({ orgSlug, previousHref, children }: StudyDetailsReviewerViewProps) {
    return (
        <Stack px="xl" gap="xl">
            <OrgBreadcrumbs
                crumbs={{
                    orgSlug,
                    current: 'Study Details',
                }}
            />
            <Title order={2} size="h4" fw={500}>
                Study Details
            </Title>
            <Divider />
            {children}
            <Group>
                <ButtonLink href={previousHref} variant="subtle" leftSection={<CaretLeftIcon />}>
                    Previous
                </ButtonLink>
            </Group>
        </Stack>
    )
}
