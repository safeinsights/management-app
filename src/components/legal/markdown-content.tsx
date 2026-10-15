'use client'

import { Paper, ScrollArea, Typography } from '@mantine/core'
import clsx from 'clsx'
import { memo, type FC } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// The rich-text editor's list classes from globals.css, so legal documents indent lists the same way
// instead of taking Typography's wider default.
const MARKDOWN_LIST_COMPONENTS: Components = {
    ul: ({ node: _node, className, ...props }) => <ul className={clsx('editable-text-ul', className)} {...props} />,
    ol: ({ node: _node, className, ...props }) => <ol className={clsx('editable-text-ol', className)} {...props} />,
}

type Props = {
    content: string
    maxHeight?: number
    // Skips the scroll area entirely. A full-page reader wants the page to scroll, and a
    // never-scrolling ScrollArea still leaves a focusable dead tab stop.
    unbounded?: boolean
    label?: string
}

type BoundedProps = { content: string; maxHeight: number; label?: string }

export const LEGAL_DOCUMENT_MAX_HEIGHT = 280

// Hoisted so react-markdown does not rebuild its processor and re-parse the whole document on
// every render.
const REMARK_PLUGINS = [remarkGfm]

// No `rehype-raw`: this content reaches every user, so embedded HTML stays escaped.
const DocumentMarkdown: FC<{ content: string }> = ({ content }) => (
    <Typography fz="sm">
        <Markdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_LIST_COMPONENTS}>
            {content}
        </Markdown>
    </Typography>
)

const BoundedMarkdown: FC<BoundedProps> = ({ content, maxHeight, label }) => (
    <ScrollArea.Autosize mah={maxHeight} type="auto" aria-label={label} tabIndex={0}>
        <DocumentMarkdown content={content} />
    </ScrollArea.Autosize>
)

export const LegalMarkdownContent: FC<Props> = memo(function LegalMarkdownContent({
    content,
    maxHeight = LEGAL_DOCUMENT_MAX_HEIGHT,
    unbounded,
    label,
}) {
    const body = unbounded ? (
        <DocumentMarkdown content={content} />
    ) : (
        <BoundedMarkdown content={content} maxHeight={maxHeight} label={label} />
    )

    return (
        <Paper withBorder p="md">
            {body}
        </Paper>
    )
})
