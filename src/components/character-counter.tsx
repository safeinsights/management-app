'use client'

import { FC } from 'react'
import { Text } from '@mantine/core'

interface CharacterCounterProps {
    /** Current character count, measured through `countCharacters` like the rule that gates the field. */
    count: number
    /** Maximum number of characters allowed */
    maxCharacters: number
    /**
     * DOM id, so the field's `aria-describedby` can reach the count (OTTER-737). Pass
     * `fieldCounterId(inputId)`; without it the counter is visible but never announced.
     */
    id?: string
}

/**
 * The counter under every capped input field. Renders a bare "count/limit" with no unit, and turns
 * red once the count passes the limit.
 */
export const CharacterCounter: FC<CharacterCounterProps> = ({ count, maxCharacters, id }) => {
    const isOverLimit = count > maxCharacters

    return (
        <Text id={id} size="xs" c={isOverLimit ? 'var(--mantine-color-error)' : 'dimmed'}>
            {count}/{maxCharacters}
        </Text>
    )
}
