'use client'

import { Paper, ScrollArea, Typography } from '@mantine/core'
import type { FC } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Panda's preflight zeroes list-style globally, so restore markers explicitly (values match
// .editable-text-ul/-ol in globals.css).
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
    /** Tall enough to read a clause without scrolling, short enough that the checkbox stays in view. */
    maxHeight?: number
    label?: string
}

export const LEGAL_DOCUMENT_MAX_HEIGHT = 280

/**
 * Renders a legal document's markdown in a bounded scroll region.
 *
 * No `rehype-raw`: this content reaches every user in the app, so embedded HTML stays escaped
 * rather than rendered. Presentational only — callers supply the markdown, which keeps the login
 * modal, the signup form and the admin version viewer on one renderer.
 */
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
