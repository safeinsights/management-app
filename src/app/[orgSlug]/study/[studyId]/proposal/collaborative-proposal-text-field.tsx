'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Box, Group, Paper, Skeleton, Stack, Text } from '@mantine/core'
import type { HocuspocusProviderWebsocket } from '@hocuspocus/provider'

import { FormFieldLabel } from '@/components/form-field-label'
import { InputError } from '@/components/errors'
import { WordCounter } from '@/components/word-counter'
import { proposalTextFieldDocName, type ProposalTextFieldKey } from '@/lib/collaboration-documents'
import { countWordsFromLexical } from '@/lib/word-count'
import { type EditableTextField } from './field-config'

const CollaborativeEditor = dynamic(
    () => import('@/components/editable-text/collaborative-editor').then((mod) => mod.CollaborativeEditor),
    {
        ssr: false,
        loading: () => <Skeleton h={240} radius={4} />,
    },
)

const contentStyle = {
    minHeight: 200,
    padding: '8px 16px',
    outline: 'none',
    fontSize: '1rem',
    lineHeight: 1.6,
} as const

type Props = {
    studyId: string
    field: EditableTextField & { id: ProposalTextFieldKey }
    initialValue: string
    error: string | undefined
    onChange: (val: string) => void
    websocketProvider: HocuspocusProviderWebsocket | null
}

export function CollaborativeProposalTextField({
    studyId,
    field,
    initialValue,
    error,
    onChange,
    websocketProvider,
}: Props) {
    const [wordCount, setWordCount] = useState(() => countWordsFromLexical(initialValue))

    const docName = proposalTextFieldDocName(studyId, field.id as ProposalTextFieldKey)

    return (
        <Paper p="xxl">
            <Stack gap="xxl">
                <Box>
                    <FormFieldLabel label={field.label} required={field.required} inputId={field.id} />
                    <Text size="xs" c="charcoal.7" mb="xs">
                        {field.description}
                    </Text>
                    <CollaborativeEditor
                        id={docName}
                        studyId={studyId}
                        websocketProvider={websocketProvider ?? undefined}
                        contentStyle={contentStyle}
                        placeholder={field.placeholder}
                        onChange={(json) => {
                            onChange(json)
                            setWordCount(countWordsFromLexical(json))
                        }}
                    />
                    <Group justify={error ? 'space-between' : 'flex-end'} mt={4}>
                        {error && <InputError error={error} />}
                        <WordCounter wordCount={wordCount} maxWords={field.maxWords} />
                    </Group>
                </Box>
            </Stack>
        </Paper>
    )
}
