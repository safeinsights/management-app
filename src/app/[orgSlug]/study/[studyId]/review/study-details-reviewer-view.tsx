import type { ReactNode } from 'react'
import type { Route } from 'next'
import { Divider, Group, Stack, Title } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink } from '@/components/links'

// The results body arrives via children, keeping this free of server-only imports so it renders
// in isolation (e.g. Ladle).
export type StudyDetailsReviewerViewProps = {
    previousHref: Route
    children: ReactNode
}

export function StudyDetailsReviewerView({ previousHref, children }: StudyDetailsReviewerViewProps) {
    return (
        <Stack px="xl" gap="xl">
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
