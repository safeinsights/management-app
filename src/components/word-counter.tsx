'use client'

import { FC } from 'react'
import { Text } from '@mantine/core'

interface WordCounterProps {
    /** Current word count */
    wordCount: number
    /** Maximum number of words allowed */
    maxWords: number
    /** Appended after the count, e.g. "words". Omitted by default so existing call sites are unchanged. */
    unit?: string
}

export const WordCounter: FC<WordCounterProps> = ({ wordCount, maxWords, unit }) => {
    const isOverLimit = wordCount > maxWords

    return (
        <Text size="xs" c={isOverLimit ? 'red' : 'dimmed'}>
            {wordCount}/{maxWords}
            {unit ? ` ${unit}` : ''}
        </Text>
    )
}
