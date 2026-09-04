import type { ReactNode } from 'react'
import { Alert, Stack, Text } from '@mantine/core'
import { CheckCircleIcon, InfoIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'

export const STATUS_ALERT_SEPARATOR = '•'

export const statusAlertTitle = (title: string, at: Date | string | null | undefined): string =>
    at ? `${title} ${STATUS_ALERT_SEPARATOR} ${dayjs(at).format('MMM DD, YYYY')}` : title

export const STATUS_ALERT_VARIANT = {
    informative: 'informative',
    action: 'action',
    success: 'success',
    decline: 'decline',
} as const

export type StatusAlertVariant = (typeof STATUS_ALERT_VARIANT)[keyof typeof STATUS_ALERT_VARIANT]

type StatusAlertProps = {
    variant: StatusAlertVariant
    title: ReactNode
    children: ReactNode
    /** Polite live region (OTTER-696). Callers must render ONE StatusAlert whose props change;
     * a remount drops the announcement. */
    announce?: boolean
}

const VARIANTS = {
    informative: { bg: 'purple.0', accent: 'purple.5', Icon: InfoIcon },
    action: { bg: 'yellow.0', accent: 'yellow.10', Icon: WarningCircleIcon },
    success: { bg: 'green.0', accent: 'green.11', Icon: CheckCircleIcon },
    decline: { bg: 'red.11', accent: 'red.10', Icon: WarningCircleIcon },
} as const satisfies Record<StatusAlertVariant, { bg: string; accent: string; Icon: typeof InfoIcon }>

// Mantine resolves 'color.shade' in its own style props only, not inside a styles object.
const cssColor = (color: string) => `var(--mantine-color-${color.replace('.', '-')})`

// aria-atomic so the swap is read as one banner (title AND body), not just the changed title.
const announceProps = { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } as const

export function StatusAlert({ variant, title, children, announce = false }: StatusAlertProps) {
    const { bg, accent, Icon } = VARIANTS[variant]
    const liveRegion = announce ? announceProps : {}
    return (
        <Alert
            variant="light"
            radius={0}
            bg={bg}
            icon={<Icon size={20} weight="fill" />}
            styles={{
                icon: { color: cssColor(accent), marginInlineEnd: 'var(--mantine-spacing-xs)' },
                wrapper: { alignItems: 'flex-start' },
            }}
            data-testid="status-alert"
            data-variant={variant}
            {...liveRegion}
        >
            <Stack gap="xs">
                <Text fz={14} fw={700} c={accent}>
                    {title}
                </Text>
                <Text fz={14} c="charcoal.9">
                    {children}
                </Text>
            </Stack>
        </Alert>
    )
}
