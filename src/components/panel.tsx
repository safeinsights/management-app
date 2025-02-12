import { Flex, FlexProps, Paper, Text } from '@mantine/core'
import React from 'react'

export type PanelProps = FlexProps & {
    title: string
    children: React.ReactNode
}

export const Panel: React.FC<PanelProps> = ({ children, title, ...flexProps }) => {
    return (
        <Flex direction="column" {...flexProps}>
            <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} radius="sm">
                <Flex justify="space-between" gap="xl">
                    <Text ta="left">{title}</Text>
                </Flex>
            </Paper>
            <Paper bg="#f5f5f5" shadow="none" p={30} radius="sm">
                {children}
            </Paper>
        </Flex>
    )
}
