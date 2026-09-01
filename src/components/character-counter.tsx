'use client'

import { FC } from 'react'
import { Text } from '@mantine/core'

interface CharacterCounterProps {
    /** Current character count, measured through `countCharacters` like the rule that gates the field. */
    count: number
    maxCharacters: number
    /** Pass `fieldCounterId(inputId)`; without it the counter is visible but never announced (OTTER-737). */
    id?: string
}

export const CharacterCounter: FC<CharacterCounterProps> = ({ count, maxCharacters, id }) => {
    const isOverLimit = count > maxCharacters

    return (
        <Text id={id} size="xs" c={isOverLimit ? 'red' : 'dimmed'}>
            {count}/{maxCharacters}
        </Text>
    )
}
