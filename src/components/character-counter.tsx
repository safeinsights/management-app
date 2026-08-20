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
 * Sibling of {@link WordCounter} for fields the product spells out in characters rather than
 * words. Kept separate rather than folded in behind a `unit` flag: the two count different
 * things, and a shared component would let a call site pass a word count against a character
 * limit without anything failing.
 */
export const CharacterCounter: FC<CharacterCounterProps> = ({ count, maxCharacters }) => {
    const isOverLimit = count > maxCharacters

    return (
        <Text size="xs" c={isOverLimit ? 'red' : 'dimmed'}>
            {count}/{maxCharacters}
        </Text>
    )
}
