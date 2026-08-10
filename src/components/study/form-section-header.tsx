import { Divider, Stack, Text, Title } from '@mantine/core'
import { FC, ReactNode } from 'react'

interface FormSectionHeaderProps {
    title: string
    description: ReactNode
    required?: boolean
}

/** `order={3}` assumes a `ProposalStepHeader` h2 above it — check the outline before using elsewhere. */
export const FormSectionHeader: FC<FormSectionHeaderProps> = ({ title, description, required }) => (
    <Stack gap="md">
        <Title fz="xl" fw={700} c="charcoal.9" order={3}>
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
