'use client'

import { FC } from 'react'
import { Text } from '@mantine/core'

interface CharacterCounterProps {
    /** Current character count, measured raw so it agrees with the validator that gates the field. */
    count: number
    /** Maximum number of characters allowed */
    maxCharacters: number
}

/**
 * The counter under every capped input field. Renders a bare "count/limit" with no unit, and turns
 * red once the count passes the limit.
 */
export const CharacterCounter: FC<CharacterCounterProps> = ({ count, maxCharacters }) => {
    const isOverLimit = count > maxCharacters

    return (
        <Text size="xs" c={isOverLimit ? 'red' : 'dimmed'}>
            {count}/{maxCharacters}
        </Text>
    )
}
