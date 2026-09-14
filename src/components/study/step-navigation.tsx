import type { FC, ReactNode } from 'react'
import { Box, Group, type ButtonVariant } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink } from '@/components/links'
import type { NavAction, NavVariant, StepNav } from '@/lib/study-screen'

// The single in-content step navigation for the study flow (OTTER-673). What each button says, where
// it goes and how heavy it looks is decided by resolveStepNav; this component only lays it out.

// Mantine has no "solid" — the spec's three weights map onto filled / outline / subtle.
const MANTINE_VARIANT: Record<NavVariant, ButtonVariant> = {
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

type StepNavigationProps = {
    nav: StepNav
    // A Submit action opens a modal rather than navigating, so it belongs to the form; the form hands
    // it in here so it shares the row with "Previous step" instead of laying that row out again.
    formAction?: ReactNode
}

// Back holds the far left and the secondary/forward pair the far right, so the solid action keeps the
// same screen position on every step — including the steps where "Previous step" is suppressed (hence
// the empty left slot rather than dropping the element and letting space-between collapse).
export const StepNavigation: FC<StepNavigationProps> = ({ nav, formAction }) => {
    if (!nav.back && !nav.secondary && !nav.forward && !formAction) return null

    return (
        <Group justify="space-between" data-testid="step-navigation">
            <Box>
                <NavButton action={nav.back} withCaret />
            </Box>
            <Group gap="md">
                <NavButton action={nav.secondary} />
                <NavButton action={nav.forward} />
                {formAction}
            </Group>
        </Group>
    )
}
