import { Flex, Text, ThemeIcon } from '@mantine/core'
import { Check, X } from '@phosphor-icons/react'

interface RequirementItem {
    re: RegExp
    label: string
    message: string
    meets: boolean
}

interface RequirementsProps {
    requirements: RequirementItem[]
}

export function Requirements({ requirements }: RequirementsProps) {
    const rows = []

    for (let i = 0; i < requirements.length; i += 2) {
        rows.push(
            <Flex key={i} direction="row" gap="md">
                {requirements.slice(i, i + 2).map((requirement, index) => (
                    <Flex key={i + index} align="center" gap="xs" style={{ flex: 1 }}>
                        <ThemeIcon color={requirement.meets ? 'teal' : 'red'} size={16} radius="xl">
                            {requirement.meets ? <Check size={12} /> : <X size={12} />}
                        </ThemeIcon>
                        <Text size="sm">{requirement.label}</Text>
                    </Flex>
                ))}
            </Flex>,
        )
    }

    return (
        <Flex direction="column" gap="xs">
            {rows}
        </Flex>
    )
}
