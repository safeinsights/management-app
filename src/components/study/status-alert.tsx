import type { ReactNode } from 'react'
import { Alert, Stack, Text } from '@mantine/core'
import { CheckCircleIcon, InfoIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { fontWeight, semanticColor } from '@/theme/tokens'

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
    informative: { bg: semanticColor('info.bg.light'), accent: semanticColor('info.text'), Icon: InfoIcon },
    action: { bg: semanticColor('warning.bg.light'), accent: semanticColor('warning.text'), Icon: WarningCircleIcon },
    success: { bg: semanticColor('success.bg.light'), accent: semanticColor('success.text'), Icon: CheckCircleIcon },
    decline: { bg: semanticColor('error.bg.light'), accent: semanticColor('error.text'), Icon: WarningCircleIcon },
} satisfies Record<StatusAlertVariant, { bg: string; accent: string; Icon: typeof InfoIcon }>

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
            c={accent}
            icon={<Icon size={20} weight="fill" />}
            data-testid="status-alert"
            data-variant={variant}
            {...liveRegion}
        >
            <Stack gap="xs">
                <Text fz={14} fw={fontWeight.bold} c={accent}>
                    {title}
                </Text>
                <Text fz={14} c={semanticColor('text.primary')}>
                    {children}
                </Text>
            </Stack>
        </Alert>
    )
}
