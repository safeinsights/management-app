import type { ReactNode } from 'react'
import { Alert, Stack, Text } from '@mantine/core'
import { InfoIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'

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
} as const satisfies Record<
    StatusAlertVariant,
    { bg: string; titleColor: string; titleWeight: number; iconColor: string; Icon: typeof InfoIcon }
>

export function StatusAlert({ variant, title, children }: StatusAlertProps) {
    const { bg, titleColor, titleWeight, iconColor, Icon } = VARIANTS[variant]
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
