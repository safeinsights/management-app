import { Box, Flex, FlexProps, Paper, Text, Anchor, Title } from '@mantine/core'
import { CheckCircleIcon, ProhibitIcon } from '@phosphor-icons/react/dist/ssr'
import React from 'react'
import { fontWeight, semanticColor } from '@/theme/tokens'

export type PanelProps = FlexProps & {
    title: string
    children: React.ReactNode
}

export const Panel: React.FC<PanelProps> = ({ children, title, ...flexProps }) => {
    return (
        <Flex direction="column" {...flexProps}>
            {/* The header tint is 50% alpha: laid over white so a dark page never shows through. */}
            <Paper bg={semanticColor('surface.raised')} shadow="none" mt="xl" radius="sm">
                <Box bg={semanticColor('surface.tableheader')} p="sm" bdrs="sm">
                    <Title order={3}>{title}</Title>
                </Box>
            </Paper>
            <Paper bg={semanticColor('surface.sunken')} shadow="none" p="xl" radius="sm">
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
    return (
        <Flex
            direction="column"
            justify="center"
            align="center"
            gap="xs"
            mb="sm"
            fw={fontWeight.semibold}
            {...flexProps}
        >
            <CheckCircleIcon size={28} color={semanticColor('success.text')} weight="fill" />
            <Text c={semanticColor('success.text')} size="md" fw={fontWeight.bold}>
                {title}
            </Text>
            <Anchor
                component="button"
                mt="md"
                size="sm"
                c={semanticColor('link.default')}
                fw={fontWeight.semibold}
                onClick={onContinue}
            >
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
    return (
        <Flex
            direction="column"
            justify="center"
            align="center"
            gap="xs"
            mb="sm"
            fw={fontWeight.semibold}
            {...flexProps}
        >
            <ProhibitIcon size={28} color={semanticColor('error.text')} weight="fill" />
            <Text c={semanticColor('error.text')} size="md" fw={fontWeight.bold}>
                {title}
            </Text>
            <Anchor
                component="button"
                mt="md"
                size="sm"
                c={semanticColor('link.default')}
                fw={fontWeight.semibold}
                onClick={onContinue}
            >
                {children}
            </Anchor>
        </Flex>
    )
}
