'use client'

import { FC } from 'react'
import { Text } from '@mantine/core'

interface WordCounterProps {
    /** Current word count */
    wordCount: number
    /** Maximum number of words allowed */
    maxWords: number
}

export const WordCounter: FC<WordCounterProps> = ({ wordCount, maxWords }) => {
    const isOverLimit = wordCount > maxWords

    return (
        <Text size="xs" c={isOverLimit ? 'red' : 'dimmed'}>
            {wordCount}/{maxWords}
        </Text>
    )
}
