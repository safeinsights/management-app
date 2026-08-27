import type { FC } from 'react'
import { Box, Group } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink } from '@/components/links'
import type { NavAction, NavVariant, StepNav } from '@/lib/study-screen'

// The single in-content step navigation for the study flow (OTTER-673). What each button says, where
// it goes and how heavy it looks is decided by resolveStepNav; this component only lays it out.

// Mantine has no "solid" — the spec's three weights map onto filled / outline / subtle.
const MANTINE_VARIANT: Record<NavVariant, string> = {
    solid: 'filled',
    outline: 'outline',
    subtle: 'subtle',
}

const NavButton: FC<{ action?: NavAction; withCaret?: boolean }> = ({ action, withCaret = false }) => {
    if (!action) return null
    return (
        <ButtonLink
            href={action.href}
            size="md"
            variant={MANTINE_VARIANT[action.variant]}
            leftSection={withCaret ? <CaretLeftIcon /> : undefined}
            data-testid={action.testId}
        >
            {action.label}
        </ButtonLink>
    )
}

// Back holds the far left and the secondary/forward pair the far right, so the solid action keeps the
// same screen position on every step — including the steps where "Previous step" is suppressed (hence
// the empty left slot rather than dropping the element and letting space-between collapse).
export const StepNavigation: FC<{ nav: StepNav }> = ({ nav }) => {
    if (!nav.back && !nav.secondary && !nav.forward) return null

    return (
        <Group justify="space-between" data-testid="step-navigation">
            <Box>
                <NavButton action={nav.back} withCaret />
            </Box>
            <Group gap="md">
                <NavButton action={nav.secondary} />
                <NavButton action={nav.forward} />
            </Group>
        </Group>
    )
}
