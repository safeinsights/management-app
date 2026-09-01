import type { FC } from 'react'
import type { Route } from 'next'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink } from '@/components/links'

// Shared so the variant and icon cannot drift between the reviewer's and researcher's panels.
export const PreviousStepLink: FC<{ previousHref: Route }> = ({ previousHref }) => (
    <ButtonLink href={previousHref} variant="subtle" leftSection={<CaretLeftIcon />}>
        Previous step
    </ButtonLink>
)
