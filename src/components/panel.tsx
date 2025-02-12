import { Flex, Paper, Text } from '@mantine/core'
import React from 'react'

export const Panel: React.FC<{ children: React.ReactNode; title: React.ReactNode }> = ({ children, title }) => {
    return (
        <Flex direction="column">
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
