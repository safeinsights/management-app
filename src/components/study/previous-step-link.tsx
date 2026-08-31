import type { FC } from 'react'
import type { Route } from 'next'
import type { ButtonProps } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink } from '@/components/links'

// Every step that can be stepped back from renders the same back link; kept here so the variant and
// icon cannot drift between the panels that use it.
export const PreviousStepLink: FC<{ previousHref: Route; size?: ButtonProps['size'] }> = ({ previousHref, size }) => (
    <ButtonLink href={previousHref} variant="subtle" size={size} leftSection={<CaretLeftIcon />}>
        Previous step
    </ButtonLink>
)
