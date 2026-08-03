import { Divider, Stack, Text, Title } from '@mantine/core'
import { FC, ReactNode } from 'react'

interface FormSectionHeaderProps {
    title: string
    description: ReactNode
    required?: boolean
}

export const FormSectionHeader: FC<FormSectionHeaderProps> = ({ title, description, required }) => (
    <Stack gap="md">
        <Title fz="xl" fw={700} c="charcoal.9">
            {title}
            {required && (
                <>
                    {' '}
                    <Text component="span" c="red.10" inherit aria-label="required">
                        *
                    </Text>
                </>
            )}
        </Title>
        <Divider color="charcoal.1" />
        <Text fz="md" c="charcoal.9">
            {description}
        </Text>
    </Stack>
)
