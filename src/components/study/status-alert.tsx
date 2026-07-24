import type { ReactNode } from 'react'
import { Alert, Stack, Text } from '@mantine/core'
import { InfoIcon, WarningIcon } from '@phosphor-icons/react/dist/ssr'

export const STATUS_ALERT_VARIANT = {
    informative: 'informative',
    action: 'action',
} as const

export type StatusAlertVariant = (typeof STATUS_ALERT_VARIANT)[keyof typeof STATUS_ALERT_VARIANT]

type StatusAlertProps = {
    variant: StatusAlertVariant
    title: ReactNode
    children: ReactNode
}

const VARIANTS = {
    informative: { bg: 'purple.0', titleColor: 'purple.5', iconColor: 'var(--mantine-color-purple-5)', Icon: InfoIcon },
    action: {
        bg: 'yellow.0',
        titleColor: 'charcoal.9',
        iconColor: 'var(--mantine-color-charcoal-9)',
        Icon: WarningIcon,
    },
} as const satisfies Record<
    StatusAlertVariant,
    { bg: string; titleColor: string; iconColor: string; Icon: typeof InfoIcon }
>

export function StatusAlert({ variant, title, children }: StatusAlertProps) {
    const { bg, titleColor, iconColor, Icon } = VARIANTS[variant]
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
        >
            <Stack gap={4}>
                <Text fz={14} fw={700} c={titleColor}>
                    {title}
                </Text>
                <Text fz={14} c="charcoal.9">
                    {children}
                </Text>
            </Stack>
        </Alert>
    )
}
