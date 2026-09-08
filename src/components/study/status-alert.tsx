import type { ReactNode } from 'react'
import { Alert, Stack, Text } from '@mantine/core'
import { CheckCircleIcon, InfoIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'

const STATUS_ALERT_SEPARATOR = '•'

export const statusAlertTitle = (title: string, at: Date | string | null | undefined): string =>
    at ? `${title} ${STATUS_ALERT_SEPARATOR} ${dayjs(at).format('MMM DD, YYYY')}` : title

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
    /** Polite live region (OTTER-696). Callers must render ONE StatusAlert whose props change;
     * a remount drops the announcement. */
    announce?: boolean
}

// Figma status/success/text-icon — 7.5:1 against green.0, the AA ratio a bold 14px title needs
// (OTTER-482). The OTTER-661 ramp now carries this exact value at green.9; swapping the literal for
// the token belongs to the call-site migration.
const SUCCESS_TITLE = '#285831'

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
        titleColor: 'yellow.9',
        titleWeight: 700,
        iconColor: 'var(--mantine-color-yellow-9)',
        Icon: WarningCircleIcon,
    },
    success: {
        bg: 'green.0',
        titleColor: SUCCESS_TITLE,
        titleWeight: 700,
        iconColor: SUCCESS_TITLE,
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
