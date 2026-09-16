'use client'

import type { FC } from 'react'
import { Button, HoverCard, Stack, Text } from '@mantine/core'
import { ArrowSquareOutIcon, WarningIcon } from '@phosphor-icons/react/dist/ssr'

const LABEL = 'Launch IDE'

const UNCLAIMED_HELPER = 'Launching locks the IDE to you for this study.'

const ENABLED_HOVER_CARD =
    "Opens your files in the IDE where you can edit and refine your code. When you're done, return here to submit."

const UNAVAILABLE_TITLE = 'IDE unavailable'
const unavailableBody = (ideOwnerName: string | null) =>
    `${ideOwnerName ?? 'Another researcher'} is using the IDE for this study. Only the first researcher to launch it can use it. The IDE will not be available to you for this study.`

/**
 * Shown under the button only while the IDE is unclaimed, which is the one moment the warning is
 * actionable — once anyone has launched, the lock is already spent.
 */
const UnclaimedHelperText: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null

    return (
        <Text size="xs" c="charcoal.7">
            <Text span inherit c="yellow.8" mr={4} display="inline-flex" style={{ verticalAlign: 'middle' }}>
                <WarningIcon size={12} weight="fill" aria-hidden />
            </Text>
            {UNCLAIMED_HELPER}
        </Text>
    )
}

type LaunchIdeControlProps = {
    /** False in view-only mode, where the card hides the control outright. */
    isVisible?: boolean
    /** True once any researcher has launched; drives solid vs outline. */
    isClaimed: boolean
    /** False only when someone else holds it. */
    canLaunch: boolean
    ideOwnerName: string | null
    isLaunching: boolean
    onLaunch: () => void
    /** Right in a card header, left in the empty state's panel — the caller owns its own layout. */
    align?: 'flex-start' | 'flex-end'
}

/**
 * The one Launch IDE control. One label with the variant carrying the meaning, per OTTER-693.
 * Failures and progress are not shown here: they belong to IdeLaunchFailedModal and
 * IdeLaunchProgressModal, which the card mounting this control also mounts.
 */
export const LaunchIdeControl: FC<LaunchIdeControlProps> = ({
    isVisible = true,
    isClaimed,
    canLaunch,
    ideOwnerName,
    isLaunching,
    onLaunch,
    align = 'flex-end',
}) => {
    if (!isVisible) return null

    const button = (
        <Button
            variant={isClaimed ? 'outline' : 'filled'}
            disabled={!canLaunch}
            loading={isLaunching}
            rightSection={<ArrowSquareOutIcon size={16} />}
            onClick={onLaunch}
        >
            {LABEL}
        </Button>
    )

    return (
        <Stack gap={4} align={align}>
            <HoverCard width={300} withArrow shadow="md" position="bottom-end">
                {/* A disabled Mantine Button fires no pointer events, so the target has to be a
                    wrapper rather than the button, or the unavailable card never shows. */}
                <HoverCard.Target>
                    <div>{button}</div>
                </HoverCard.Target>
                <HoverCard.Dropdown>
                    <LaunchHoverCardBody canLaunch={canLaunch} ideOwnerName={ideOwnerName} />
                </HoverCard.Dropdown>
            </HoverCard>
            <UnclaimedHelperText isVisible={!isClaimed} />
        </Stack>
    )
}

const LaunchHoverCardBody: FC<{ canLaunch: boolean; ideOwnerName: string | null }> = ({ canLaunch, ideOwnerName }) => {
    if (canLaunch) return <Text size="sm">{ENABLED_HOVER_CARD}</Text>

    return (
        <Stack gap={4}>
            <Text size="sm" fw={600}>
                {UNAVAILABLE_TITLE}
            </Text>
            <Text size="sm">{unavailableBody(ideOwnerName)}</Text>
        </Stack>
    )
}
