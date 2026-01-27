'use server'

import { AccessDeniedAlert } from '@/components/errors'
import { sessionFromClerk } from '@/server/clerk'
import { Stack } from '@mantine/core'
import { StudyProposal } from './proposal'
import { StudyRequestPageHeader } from './page-header'

export default async function RequestStudyPage(props: { params: Promise<{ orgSlug: string }> }) {
    const params = await props.params

    const session = await sessionFromClerk()
    if (!session) return <AccessDeniedAlert />

    return (
        <Stack p="xl" gap="xl">
            <StudyRequestPageHeader orgSlug={params.orgSlug} />
            <StudyProposal />
        </Stack>
    )
}
