'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { Box, Group, Paper, Skeleton, Stack, Text } from '@mantine/core'
import type { HocuspocusProviderWebsocket } from '@hocuspocus/provider'

import { FormFieldLabel } from '@/components/form-field-label'
import { InputError } from '@/components/errors'
import { WordCounter } from '@/components/word-counter'
import { isActionError } from '@/lib/errors'
import { proposalTextFieldDocName, type ProposalTextFieldKey } from '@/lib/collaboration-documents'
import { countWordsFromLexical } from '@/lib/word-count'
import { getYjsDocumentUpdatedAtAction } from '@/server/actions/editor.actions'
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

type Bootstrap = { state: 'loading' } | { state: 'fresh'; initialContent: string | undefined } | { state: 'existing' }

const isLexicalJson = (value: string | undefined): value is string => {
    if (!value) return false
    try {
        const parsed = JSON.parse(value)
        return typeof parsed === 'object' && parsed !== null && 'root' in parsed
    } catch {
        return false
    }
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
    const [bootstrap, setBootstrap] = useState<Bootstrap>({ state: 'loading' })

    const docName = proposalTextFieldDocName(studyId, field.id as ProposalTextFieldKey)

    useEffect(() => {
        let cancelled = false
        getYjsDocumentUpdatedAtAction({ documentName: docName, studyId }).then((result) => {
            if (cancelled) return
            if (isActionError(result) || result === null) {
                setBootstrap({
                    state: 'fresh',
                    initialContent: isLexicalJson(initialValue) ? initialValue : undefined,
                })
            } else {
                setBootstrap({ state: 'existing' })
            }
        })
        return () => {
            cancelled = true
        }
        // initialValue intentionally excluded — bootstrap is a one-shot decision.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [docName, studyId])

    if (bootstrap.state === 'loading') {
        return <Skeleton h={300} radius={4} />
    }

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
                        initialContent={bootstrap.state === 'fresh' ? bootstrap.initialContent : undefined}
                        shouldBootstrap={bootstrap.state === 'fresh' && bootstrap.initialContent !== undefined}
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
