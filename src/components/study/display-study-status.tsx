'use client'

import { StatusLabel } from '@/lib/status-labels'
import { Flex, Text, Tooltip } from '@mantine/core'
import React, { FC } from 'react'

export const DisplayStudyStatus: FC<{ status: StatusLabel }> = ({ status }) => {
    const { label, tooltip } = status
    const color = label === 'Errored' || label === 'Awaiting Review' ? 'red.9' : 'dark.8'

    const statusStyle: Record<'Approved' | 'Errored' | 'Rejected' | 'Under Review', { color?: string }> = {
        Approved: { color: 'green.9' },
        Errored: { color: 'red.9' },
        Rejected: { color: 'red.9' },
        'Under Review': { color: 'grey.6' },
    }

    if (label === 'Needs Review') {
        return (
            <Flex align="center">
                <Tooltip label={tooltip} multiline styles={{ tooltip: { maxWidth: 250 } }}>
                    <Text
                        bd="1px solid purple.8"
                        bdrs={2}
                        p="2px 6px"
                        ta={'center'}
                        fw={600}
                        c={'purple.8'}
                        style={{ cursor: 'pointer' }}
                    >
                        {label.toLocaleUpperCase()}
                    </Text>
                </Tooltip>
            </Flex>
        )
    }

    return (
        <Flex align="center" gap="xs">
            <Tooltip label={tooltip} multiline styles={{ tooltip: { maxWidth: 250 } }}>
                <Text
                    c={statusStyle[label as keyof typeof statusStyle]?.color || color}
                    fw={600}
                    style={{ cursor: 'pointer', ...(statusStyle[label as keyof typeof statusStyle] || {}) }}
                >
                    {label.toLocaleUpperCase()}
                </Text>
            </Tooltip>
        </Flex>
    )
}
