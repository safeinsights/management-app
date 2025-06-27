import { Flex, FlexProps, Paper, Text, Anchor, useMantineTheme, Title } from '@mantine/core'
import { CheckCircleIcon, ProhibitIcon } from '@phosphor-icons/react/dist/ssr'
import React from 'react'

export type PanelProps = FlexProps & {
    title: string
    children: React.ReactNode
}

export const Panel: React.FC<PanelProps> = ({ children, title, ...flexProps }) => {
    return (
        <Flex direction="column" {...flexProps}>
            <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} radius="sm">
                <Title order={3}>{title}</Title>
            </Paper>
            <Paper bg="#f5f5f5" shadow="none" p={30} radius="sm">
                {children}
            </Paper>
        </Flex>
    )
}

export const SuccessPanel: React.FC<PanelProps & { onContinue(): void }> = ({
    children,
    title,
    onContinue,
    ...flexProps
}) => {
    const theme = useMantineTheme()

    return (
        <Flex direction="column" justify="center" align="center" gap="xs" mb="sm" fw="semibold" {...flexProps}>
            <CheckCircleIcon size={28} color={theme.colors.green[9]} weight="fill" />
            <Text c="green.9" size="md" fw="bold">
                {title}
            </Text>
            <Anchor component="button" mt={16} size="sm" c="blue.8" fw={600} onClick={onContinue}>
                {children}
            </Anchor>
        </Flex>
    )
}

export const ErrorPanel: React.FC<PanelProps & { onContinue(): void }> = ({
    children,
    title,
    onContinue,
    ...flexProps
}) => {
    const theme = useMantineTheme()

    return (
        <Flex direction="column" justify="center" align="center" gap="xs" mb="sm" fw="semibold" {...flexProps}>
            <ProhibitIcon size={28} color={theme.colors.red[9]} weight="fill" />
            <Text c="red.9" size="md" fw="bold">
                {title}
            </Text>
            <Anchor component="button" mt={16} size="sm" c="blue.8" fw={600} onClick={onContinue}>
                {children}
            </Anchor>
        </Flex>
    )
}
