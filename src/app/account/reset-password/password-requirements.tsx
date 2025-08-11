import { theme } from '@/theme'
import { Flex, Text, useMantineTheme } from '@mantine/core'
import { CheckIcon, XCircleIcon } from '@phosphor-icons/react/dist/ssr'

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
    const theme = useMantineTheme()
    for (let i = 0; i < requirements.length; i += 2) {
        rows.push(
            <Flex key={i} direction="row" gap="md">
                {requirements.slice(i, i + 2).map((requirement, index) => (
                    <Flex key={i + index} align="center" gap="xs" style={{ flex: 1 }}>
                        
                            {requirement.meets ? <CheckIcon size={14} color={theme.colors.green[9]} /> : <XCircleIcon size={14} color={theme.colors.red[7]} />}
    
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
