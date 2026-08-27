'use client'

import { FC } from 'react'
import { Anchor, Group, Stack, Text } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { Routes } from '@/lib/routes'

const LABEL = 'Researcher'

const description = (orgName: string) => `Update your profile to share your research experience with ${orgName}.`

interface ResearcherFieldProps {
    researcherName: string
    orgName: string
    /**
     * True only for the person who created the draft. Any other lab member editing the same
     * proposal sees the name and nothing else: the guidance and the button both act on the
     * *viewer's* own profile, so offering them to someone else invites editing the wrong profile.
     */
    isDraftCreator: boolean
}

/**
 * The Researcher row: a label over the creator's name, not an input (OTTER-691).
 *
 * Deliberately not `FormField` or `ReadOnlyField`. `FormField` builds an `Input.Wrapper` whose
 * label points at a control, and there is no control here. `ReadOnlyField` is the right shape but
 * carries no asterisk and no description slot, both of which Figma shows on this row. The asterisk
 * stays visual only: there is nothing for a user to fill in, so marking it required to assistive
 * tech would announce an obligation that cannot be acted on.
 */
export const ResearcherField: FC<ResearcherFieldProps> = ({ researcherName, orgName, isDraftCreator }) => (
    <Stack gap={4}>
        <Text fw={600} size="sm">
            {LABEL}{' '}
            <Text component="span" c="red.7" aria-hidden>
                *
            </Text>
        </Text>
        <ResearcherProfileHint orgName={orgName} isVisible={isDraftCreator} />
        <Group align="center" gap="xxl">
            <Text size="md" fw={400}>
                {researcherName}
            </Text>
            <UpdateProfileLink isVisible={isDraftCreator} />
        </Group>
    </Stack>
)

const ResearcherProfileHint: FC<{ orgName: string; isVisible: boolean }> = ({ orgName, isVisible }) => {
    if (!isVisible) return null

    return (
        <Text size="sm" c="dimmed" mb="xs">
            {description(orgName)}
        </Text>
    )
}

const UpdateProfileLink: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null

    return (
        <Anchor href={Routes.researcherProfile} target="_blank" rel="noopener noreferrer" size="sm" c="blue.7" fw={600}>
            <Group gap={4} wrap="nowrap">
                Update profile
                <ArrowSquareOutIcon size={16} weight="bold" />
            </Group>
        </Anchor>
    )
}
