import type { ReactNode } from 'react'
import { Alert, Stack, Text } from '@mantine/core'
import { CheckCircleIcon, InfoIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { fontWeight, semanticColor, type SemanticToken } from '@/theme/tokens'

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

// Each variant is the Figma Alert's light status pair: status/*/bg-light under status/*/text-icon.
const VARIANTS = {
    informative: { bg: 'info.bg.light', accent: 'info.text', Icon: InfoIcon },
    action: { bg: 'warning.bg.light', accent: 'warning.text', Icon: WarningCircleIcon },
    success: { bg: 'success.bg.light', accent: 'success.text', Icon: CheckCircleIcon },
    decline: { bg: 'error.bg.light', accent: 'error.text', Icon: WarningCircleIcon },
} as const satisfies Record<StatusAlertVariant, { bg: SemanticToken; accent: SemanticToken; Icon: typeof InfoIcon }>

// aria-atomic so the swap is read as one banner (title AND body), not just the changed title.
const announceProps = { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } as const

export function StatusAlert({ variant, title, children, announce = false }: StatusAlertProps) {
    const { bg, accent, Icon } = VARIANTS[variant]
    const accentColor = semanticColor(accent)
    const liveRegion = announce ? announceProps : {}
    return (
        <Alert
            variant="light"
            radius={0}
            bg={semanticColor(bg)}
            icon={<Icon size={20} weight="fill" />}
            styles={{
                icon: { color: accentColor, marginInlineEnd: 'var(--mantine-spacing-xs)' },
                wrapper: { alignItems: 'flex-start' },
            }}
            data-testid="status-alert"
            data-variant={variant}
            {...liveRegion}
        >
            <Stack gap="xs">
                <Text fz={14} fw={fontWeight.bold} c={accentColor}>
                    {title}
                </Text>
                <Text fz={14} c={semanticColor('text.primary')}>
                    {children}
                </Text>
            </Stack>
        </Alert>
    )
}
