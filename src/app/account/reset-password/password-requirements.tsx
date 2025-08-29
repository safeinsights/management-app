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
    { re: /^.{8,}$/, label: '8 character minimum', message: 'Password must be at least 8 characters long' },
]

/**
 * Helper function to check password requirements and determine if they should be displayed
 */
export function usePasswordRequirements(password: string) {
    const requirements = PASSWORD_REQUIREMENTS.map((req) => ({
        ...req,
        meets: req.re.test(password),
    }))

    const allRequirementsMet = requirements.every((r) => r.meets)

    const shouldShowRequirements = () => {
        if (allRequirementsMet) return false

        // Show requirements only if password field has content
        return password.length > 0
    }

    return {
        requirements,
        allRequirementsMet,
        shouldShowRequirements: shouldShowRequirements(),
    }
}

export function Requirements({ requirements }: RequirementsProps) {
    const rows = []
    const theme = useMantineTheme()
    for (let i = 0; i < requirements.length; i += 2) {
        rows.push(
            <Flex key={i} direction="row" gap="md">
                {requirements.slice(i, i + 2).map((requirement, index) => (
                    <Flex key={i + index} align="center" gap="xs" style={{ flex: 1 }}>
                        {requirement.meets ? (
                            <CheckIcon size={14} color={theme.colors.green[9]} />
                        ) : (
                            <XCircleIcon size={14} color={theme.colors.red[7]} />
                        )}

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
