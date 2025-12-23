import { ButtonLink } from '@/components/links'
import { Routes } from '@/lib/routes'
import { Stack, Text, Title } from '@mantine/core'
import { PlusIcon } from '@phosphor-icons/react/dist/ssr'
import { Audience } from './types'

type EmptyStateProps = {
    audience: Audience
    orgSlug: string
    showNewStudyButton: boolean
}

export function EmptyState({ audience, orgSlug, showNewStudyButton }: EmptyStateProps) {
    if (audience === 'reviewer') {
        return <Title order={5}>You have no studies to review.</Title>
    }

    // Researcher empty state
    return (
        <Stack align="center" gap="md">
            <Text>You haven&apos;t started a study yet</Text>
            {showNewStudyButton && (
                <ButtonLink leftSection={<PlusIcon />} href={Routes.studyRequest({ orgSlug })} data-testid="new-study">
                    Propose New Study
                </ButtonLink>
            )}
        </Stack>
    )
}
