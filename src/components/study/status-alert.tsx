import type { ReactNode } from 'react'
import { Alert, Stack, Text } from '@mantine/core'
import { CheckCircleIcon, InfoIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'

export const STATUS_ALERT_SEPARATOR = '•'

export const STATUS_ALERT_VARIANT = {
    informative: 'informative',
    action: 'action',
    success: 'success',
} as const

export type StatusAlertVariant = (typeof STATUS_ALERT_VARIANT)[keyof typeof STATUS_ALERT_VARIANT]

type StatusAlertProps = {
    variant: StatusAlertVariant
    title: ReactNode
    children: ReactNode
    /**
     * Opt in to a polite live region (OTTER-696). Only surfaces that SWAP this banner's copy in
     * place need it: Mantine's Alert defaults to role="alert", an assertive region that interrupts
     * the screen reader — wrong for a state change the user just caused. Announcing works only
     * while the region stays mounted across the swap, so callers must render ONE StatusAlert whose
     * props change, never two components swapped by a conditional (which remounts the region and
     * drops the announcement).
     */
    announce?: boolean
}

const VARIANTS = {
    informative: {
        bg: 'purple.0',
        titleColor: 'purple.5',
        titleWeight: 700,
        iconColor: 'var(--mantine-color-purple-5)',
        Icon: InfoIcon,
    },
    action: {
        bg: 'yellow.0',
        titleColor: 'yellow.10',
        titleWeight: 700,
        iconColor: 'var(--mantine-color-yellow-10)',
        Icon: WarningCircleIcon,
    },
    success: {
        bg: 'green.0',
        titleColor: 'green.9',
        titleWeight: 700,
        iconColor: 'var(--mantine-color-green-9)',
        Icon: CheckCircleIcon,
    },
} as const satisfies Record<
    StatusAlertVariant,
    { bg: string; titleColor: string; titleWeight: number; iconColor: string; Icon: typeof InfoIcon }
>

// aria-atomic so the swap is read as one banner (title AND body), not just the changed title.
const announceProps = { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } as const

export function StatusAlert({ variant, title, children, announce = false }: StatusAlertProps) {
    const { bg, titleColor, titleWeight, iconColor, Icon } = VARIANTS[variant]
    const liveRegion = announce ? announceProps : {}
    return (
        <Alert
            variant="light"
            radius={0}
            bg={bg}
            icon={<Icon size={20} weight="fill" color={iconColor} />}
            styles={{
                icon: { color: iconColor, marginInlineEnd: 'var(--mantine-spacing-xs)' },
                wrapper: { alignItems: 'flex-start' },
            }}
            data-testid="status-alert"
            data-variant={variant}
            {...liveRegion}
        >
            <Stack gap="xs">
                <Text fz={14} fw={titleWeight} c={titleColor}>
                    {title}
                </Text>
                <Text fz={14} c="charcoal.9">
                    {children}
                </Text>
            </Stack>
        </Alert>
    )
}
