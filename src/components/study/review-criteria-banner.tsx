import type { ReactNode } from 'react'
import { Box, Stack, Text } from '@mantine/core'
import type { MantineSpacing } from '@mantine/core'

type Criterion = {
    label: string
    description?: string
}

type ReviewCriteriaBannerProps = {
    intro: ReactNode
    criteria: readonly Criterion[]
    mb?: MantineSpacing
    testId?: string
    criteriaTestId?: string
}

export function ReviewCriteriaBanner({
    intro,
    criteria,
    mb,
    testId = 'review-criteria-banner',
    criteriaTestId = 'review-criteria',
}: ReviewCriteriaBannerProps) {
    return (
        <Box bg="purple.0" p="md" mb={mb} style={{ borderRadius: 'var(--mantine-radius-sm)' }} data-testid={testId}>
            <Stack gap="xs">
                <Text size="sm">{intro}</Text>
                <Stack gap={4} mt="md" data-testid={criteriaTestId}>
                    {criteria.map(({ label, description }) => (
                        <Text size="sm" key={label}>
                            <strong>{description ? `${label}:` : label}</strong>
                            {description ? ` ${description}` : null}
                        </Text>
                    ))}
                </Stack>
            </Stack>
        </Box>
    )
}
