'use client'

import { FC } from 'react'
import { WordCounter } from '@/components/word-counter'

interface CharacterCounterProps {
    /** Current character count, measured raw so it agrees with the validator that gates the field. */
    count: number
    /** Maximum number of characters allowed */
    maxCharacters: number
}

/**
 * The counter under a field the product spells out in characters rather than words.
 *
 * A named wrapper, not a second implementation: it renders exactly what {@link WordCounter}
 * renders, so delegating keeps the over-limit styling defined once and stops the two drifting.
 * The split buys the naming at the call site, which is the part worth having; neither shape can
 * stop a caller passing a word count against a character limit, since both are plain numbers.
 */
export const CharacterCounter: FC<CharacterCounterProps> = ({ count, maxCharacters }) => (
    <WordCounter wordCount={count} maxWords={maxCharacters} />
)
