'use client'

import { useMemo } from 'react'
import { ScrollArea, Box, Text } from '@mantine/core'
import hljs from 'highlight.js/lib/core'
import python from 'highlight.js/lib/languages/python'
import r from 'highlight.js/lib/languages/r'
import 'highlight.js/styles/github-dark.css'

// Register languages
hljs.registerLanguage('python', python)
hljs.registerLanguage('r', r)

interface CodeViewerProps {
    code: string
    language: 'python' | 'r'
    fileName?: string
}

export function CodeViewer({ code, language, fileName }: CodeViewerProps) {
    // Use hljs.highlight() instead of hljs.highlightElement() to avoid DOM manipulation
    // This properly escapes HTML in the code and returns safe highlighted HTML
    const highlightedCode = useMemo(() => {
        try {
            return hljs.highlight(code, { language: language.toLowerCase() }).value
        } catch (error) {
            // Fallback to plain text if highlighting fails
            console.error('Failed to highlight code:', error)
            return code
        }
    }, [code, language])

    return (
        <Box>
            {fileName && (
                <Text size="sm" c="dimmed" mb="xs">
                    {fileName}
                </Text>
            )}
            <ScrollArea h={500} type="auto">
                <pre style={{ margin: 0, padding: '1rem', background: '#0d1117', borderRadius: '4px' }}>
                    <code
                        className={`language-${language.toLowerCase()}`}
                        dangerouslySetInnerHTML={{ __html: highlightedCode }}
                    />
                </pre>
            </ScrollArea>
        </Box>
    )
}
