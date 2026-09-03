'use client'

import { Paper, ScrollArea, Typography } from '@mantine/core'
import type { FC } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Panda's preflight zeroes list-style globally; values match .editable-text-ul/-ol in globals.css.
const MARKDOWN_LIST_COMPONENTS: Components = {
    ul: ({ node: _node, ...props }) => (
        <ul style={{ listStyleType: 'disc', paddingLeft: '1.5em', margin: '0.25em 0' }} {...props} />
    ),
    ol: ({ node: _node, ...props }) => (
        <ol style={{ listStyleType: 'decimal', paddingLeft: '1.5em', margin: '0.25em 0' }} {...props} />
    ),
}

type Props = {
    content: string
    maxHeight?: number
    label?: string
}

export const LEGAL_DOCUMENT_MAX_HEIGHT = 280

// No `rehype-raw`: this content reaches every user, so embedded HTML stays escaped.
export const LegalDocumentContent: FC<Props> = ({ content, maxHeight = LEGAL_DOCUMENT_MAX_HEIGHT, label }) => (
    <Paper withBorder p="md">
        <ScrollArea.Autosize mah={maxHeight} type="auto" aria-label={label} tabIndex={0}>
            <Typography fz="sm">
                <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN_LIST_COMPONENTS}>
                    {content}
                </Markdown>
            </Typography>
        </ScrollArea.Autosize>
    </Paper>
)
