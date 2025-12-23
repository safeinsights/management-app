'use server'

import { AccessDeniedAlert } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { sessionFromClerk } from '@/server/clerk'
import { Stack, Title } from '@mantine/core'
import { StudyProposal } from './proposal'

export default async function RequestStudyPage(props: { params: Promise<{ orgSlug: string }> }) {
    const params = await props.params

    const session = await sessionFromClerk()
    if (!session) return <AccessDeniedAlert />

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs crumbs={{ orgSlug: params.orgSlug, current: 'Propose a study' }} />
            <Title order={1}>Propose a study</Title>
            <StudyProposal />
        </Stack>
    )
}
