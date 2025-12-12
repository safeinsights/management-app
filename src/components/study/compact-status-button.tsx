import { Button, Group, Loader, Stack, Text } from '@mantine/core'
import { ReactNode } from 'react'

interface CompactStatusButtonProps {
    icon?: ReactNode
    primaryText: string
    secondaryText: string
    color?: string
    loading?: boolean
    disabled?: boolean
    onClick?: () => void
}

export const CompactStatusButton = ({
    icon,
    primaryText,
    secondaryText,
    color,
    loading = false,
    disabled = false,
    onClick,
}: CompactStatusButtonProps) => {
    return (
        <Button variant="outline" color={color} onClick={onClick} disabled={disabled || loading}>
            <Group gap="xs" wrap="nowrap">
                {loading ? <Loader size={14} /> : icon}
                <Stack gap={0} align="flex-start">
                    <Text fz="xs" lh={1}>
                        {primaryText}
                    </Text>
                    <Text fz={10} fs="italic" c={color ? `${color}.6` : 'dimmed'} lh={1}>
                        {secondaryText}
                    </Text>
                </Stack>
            </Group>
        </Button>
    )
}
