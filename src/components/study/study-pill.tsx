'use client'

import { Flex, type MantineColor, Text } from '@mantine/core'
import { type FC, type ReactNode } from 'react'
import { fontWeight } from '@/theme/tokens'
import { InfoTooltip } from '../tooltip'

type Props = {
    label: string
    bg: MantineColor
    c: MantineColor
    icon?: ReactNode
    tooltip?: string
    bd?: MantineColor
}

// Shared so two pills rendered on the same study page cannot drift in size or shape. Geometry is the
// "Badge" component of the SI UI Component Library: 26px tall, 12px padding, 4px gap, 16px radius,
// label/sm text.
export const StudyPill: FC<Props> = ({ label, bg, c, bd, icon, tooltip }) => {
    const pill = (
        <Flex
            align="center"
            gap="xxs"
            bg={bg}
            c={c}
            bdrs="lg"
            bd={bd ? `1px solid ${bd}` : ''}
            px="sm"
            h="1.625rem"
            style={{ display: 'inline-flex', whiteSpace: 'nowrap', cursor: tooltip ? 'pointer' : 'default' }}
        >
            {icon}
            <Text size="xs" fw={fontWeight.semibold} lh={1.2}>
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
