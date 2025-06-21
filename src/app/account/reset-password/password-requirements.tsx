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

export const PASSWORD_REQUIREMENTS = [
    { re: /[0-9]/, label: 'One number', message: 'Password must contain at least one number' },
    { re: /[A-Z]/, label: 'One uppercase letter', message: 'Password must contain at least one uppercase letter' },
    {
        re: /[$&+,:;=?@#|'<>.^*()%!-]/,
        label: 'One special symbol',
        message: 'Password must contain at least one special symbol',
    },
    { re: /^.{8,}$/, label: '8 character minimum', message: '8 character minimum' },
]

export function Requirements({ requirements }: RequirementsProps) {
    const rows = []

    for (let i = 0; i < requirements.length; i += 2) {
        rows.push(
            <Flex key={i} direction="row" gap="md">
                {requirements.slice(i, i + 2).map((requirement, index) => (
                    <Flex key={i + index} align="center" gap="xs" style={{ flex: 1 }}>
                        <ThemeIcon color={requirement.meets ? 'green.9' : 'red.9'} size={16} radius="xl">
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
