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
        <Text size="xs" c="charcoal.7" ta="right">
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
}

/**
 * The Code files card's Launch IDE button (OTTER-693 row 7), with the three states the card
 * defines: solid while the IDE is unclaimed, outline once the viewer holds it, disabled when
 * somebody else does.
 *
 * Separate from launch-ide-button.tsx, which /resubmit still renders and whose label flips to
 * "Edit files in IDE" — the card wants one label here and the variant to carry the meaning.
 */
export const LaunchIdeControl: FC<LaunchIdeControlProps> = ({
    isVisible = true,
    isClaimed,
    canLaunch,
    ideOwnerName,
    isLaunching,
    onLaunch,
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
        <Stack gap={4} align="flex-end">
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
