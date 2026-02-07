'use client'

import { FC } from 'react'
import { Text } from '@mantine/core'
import { countWords } from '@/lib/word-count'

interface WordCounterProps {
    value: string
    maxWords: number
}

export const WordCounter: FC<WordCounterProps> = ({ value, maxWords }) => {
    const wordCount = countWords(value)
    const isOverLimit = wordCount > maxWords

    return (
        <Text size="xs" c={isOverLimit ? 'red' : 'dimmed'}>
            {wordCount}/{maxWords}
        </Text>
    )
}
