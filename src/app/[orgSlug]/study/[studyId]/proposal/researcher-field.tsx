'use client'

import { FC } from 'react'
import { Anchor, Group, Stack, Text } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { Routes } from '@/lib/routes'
import { fontWeight, semanticColor } from '@/theme/tokens'

const LABEL = 'Researcher'

const description = (orgName: string) => `Update your profile to share your research experience with ${orgName}.`

interface ResearcherFieldProps {
    researcherName: string
    orgName: string
    // The guidance and button act on the viewer's own profile, so a co-author sees the name only.
    isDraftCreator: boolean
}

// Not FormField (its label points at a control that does not exist here) and not ReadOnlyField
// (no asterisk or description slot). The asterisk is visual only.
export const ResearcherField: FC<ResearcherFieldProps> = ({ researcherName, orgName, isDraftCreator }) => (
    <Stack gap="xxs">
        <Text fw={fontWeight.semibold} size="sm">
            {LABEL}{' '}
            <Text component="span" c={semanticColor('error.text')} aria-hidden>
                *
            </Text>
        </Text>
        <ResearcherProfileHint orgName={orgName} isVisible={isDraftCreator} />
        <Group align="center" gap="xxl">
            <Text size="md" fw={fontWeight.regular}>
                {researcherName}
            </Text>
            <UpdateProfileLink isVisible={isDraftCreator} />
        </Group>
    </Stack>
)

const ResearcherProfileHint: FC<{ orgName: string; isVisible: boolean }> = ({ orgName, isVisible }) => {
    if (!isVisible) return null

    return (
        <Text size="xs" c="dimmed" mb="xs">
            {description(orgName)}
        </Text>
    )
}

const UpdateProfileLink: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null

    return (
        <Anchor
            href={Routes.researcherProfile}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            c={semanticColor('link.default')}
            fw={fontWeight.semibold}
        >
            <Group gap="xxs" wrap="nowrap">
                Update profile
                <ArrowSquareOutIcon size={16} weight="bold" />
            </Group>
        </Anchor>
    )
}
