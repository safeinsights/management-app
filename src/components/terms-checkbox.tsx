'use client'

import { Anchor, Checkbox, Popover, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { FC, ReactNode } from 'react'

const TOS_TEXT =
    'What to expect: Once implemented, SafeInsights Terms of Service will detail acceptable use of SafeInsights, applicable laws and jurisdictions, procedures for resolving disputes, and disclaimers of liability.'

const PRIVACY_TEXT =
    'What to expect: Once implemented, SafeInsights Privacy Notice will detail the ways that SafeInsights gathers, uses, discloses, and manages user data and personal information.'

const PopoverLink: FC<{ label: string; content: string }> = ({ label, content }) => {
    const [opened, { toggle, close }] = useDisclosure(false)

    return (
        <Popover width={300} withArrow shadow="md" opened={opened} onChange={close}>
            <Popover.Target>
                <Anchor component="button" type="button" onClick={toggle} fw={700} fz="sm">
                    {label}
                </Anchor>
            </Popover.Target>
            <Popover.Dropdown>
                <Text size="sm">{content}</Text>
            </Popover.Dropdown>
        </Popover>
    )
}

export const TermsCheckboxLabel: FC = () => (
    <Text component="span" fz="sm">
        I agree to the <PopoverLink label="Terms of Service" content={TOS_TEXT} /> and{' '}
        <PopoverLink label="Privacy Notice" content={PRIVACY_TEXT} />
    </Text>
)

type TermsCheckboxProps = {
    checked: boolean
    onChange: (checked: boolean) => void
    error?: ReactNode
}

export const TermsCheckbox: FC<TermsCheckboxProps> = ({ checked, onChange, error }) => (
    <Checkbox
        mt="md"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        label={<TermsCheckboxLabel />}
        error={error}
    />
)
