'use client'

import { StatusLabel } from '@/lib/status-labels'
import { Flex, Text } from '@mantine/core'
import { FC } from 'react'
import { InfoTooltip } from '../tooltip'

export const DisplayStudyStatus: FC<{ status: StatusLabel }> = ({ status }) => {
    const { label, tooltip } = status
    const color = label === 'Errored' || label === 'Awaiting Review' ? 'red.9' : 'dark.8'

    const statusStyle: Record<'Approved' | 'Errored' | 'Rejected' | 'Under Review', { color?: string }> = {
        Approved: { color: 'green.9' },
        Errored: { color: 'red.9' },
        Rejected: { color: 'charcoal.9' },
        'Under Review': { color: 'grey.6' },
    }

    if (label === 'Needs Review') {
        return (
            <Flex align="center">
                <InfoTooltip label={tooltip} multiline styles={{ tooltip: { maxWidth: 250 } }}>
                    <Text
                        size="sm"
                        bd="1px solid purple.7"
                        bdrs={2}
                        p="2px 6px"
                        ta={'center'}
                        fw={600}
                        c={'purple.7'}
                        style={{ cursor: 'pointer' }}
                    >
                        {label.toLocaleUpperCase()}
                    </Text>
                </InfoTooltip>
            </Flex>
        )
    }

    if (label === 'Approved' && status.stage === 'Results') {
        return (
            <Flex align="center">
                <InfoTooltip label={tooltip} multiline styles={{ tooltip: { maxWidth: 250 } }}>
                    <Text
                        size="sm"
                        bd="1px solid green.10"
                        bdrs={2}
                        p="2px 6px"
                        ta={'center'}
                        fw={600}
                        c={'green.10'}
                        style={{ cursor: 'pointer' }}
                    >
                        {label.toLocaleUpperCase()}
                    </Text>
                </InfoTooltip>
            </Flex>
        )
    }

    return (
        <Flex align="center" gap="xs">
            <InfoTooltip label={tooltip} multiline styles={{ tooltip: { maxWidth: 250 } }}>
                <Text
                    c={statusStyle[label as keyof typeof statusStyle]?.color || color}
                    fw={600}
                    style={{ cursor: 'pointer', ...(statusStyle[label as keyof typeof statusStyle] || {}) }}
                >
                    {label.toLocaleUpperCase()}
                </Text>
            </InfoTooltip>
        </Flex>
    )
}
