import { Divider, Stack, Text, Title } from '@mantine/core'
import { FC, ReactNode } from 'react'
import { fontWeight, semanticColor } from '@/theme/tokens'

interface FormSectionHeaderProps {
    title: string
    description: ReactNode
    required?: boolean
}

/** `order={3}` assumes a `ProposalStepHeader` h2 above it. */
export const FormSectionHeader: FC<FormSectionHeaderProps> = ({ title, description, required }) => (
    <Stack gap="md">
        <Title fz="xl" fw={fontWeight.bold} c={semanticColor('text.primary')} order={3}>
            {title}
            {required && (
                <>
                    {' '}
                    <Text component="span" c={semanticColor('error.text')} inherit aria-label="required">
                        *
                    </Text>
                </>
            )}
        </Title>
        <Divider color="charcoal.1" />
        <Text fz="md" c={semanticColor('text.primary')}>
            {description}
        </Text>
    </Stack>
)
