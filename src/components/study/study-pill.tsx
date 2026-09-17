'use client'

import { Flex, type MantineColor, Text } from '@mantine/core'
import { type FC, type ReactNode } from 'react'
import { InfoTooltip } from '../tooltip'

type Props = {
    label: string
    bg: MantineColor
    c: MantineColor
    icon?: ReactNode
    tooltip?: string
    bd?: MantineColor
}

// Shared so two pills rendered on the same study page cannot drift in size or shape.
export const StudyPill: FC<Props> = ({ label, bg, c, bd, icon, tooltip }) => {
    const pill = (
        <Flex
            align="center"
            gap={4}
            bg={bg}
            c={c}
            bdrs={100}
            bd={bd ? `1px solid ${bd}` : ''}
            px={16}
            py={4}
            style={{ display: 'inline-flex', whiteSpace: 'nowrap', cursor: tooltip ? 'pointer' : 'default' }}
        >
            {icon}
            <Text size="xs" fw={500}>
                {label}
            </Text>
        </Flex>
    )

    if (!tooltip) return pill

    return (
        <InfoTooltip label={tooltip} multiline styles={{ tooltip: { maxWidth: 250 } }}>
            {pill}
        </InfoTooltip>
    )
}
