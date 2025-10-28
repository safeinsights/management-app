'use client'

import { useEffect, useRef } from 'react'
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
    const codeRef = useRef<HTMLElement>(null)

    useEffect(() => {
        if (codeRef.current) {
            // Remove existing highlighting
            delete codeRef.current.dataset.highlighted

            // Apply highlighting
            hljs.highlightElement(codeRef.current)
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
                    <code ref={codeRef} className={`language-${language.toLowerCase()}`}>
                        {code}
                    </code>
                </pre>
            </ScrollArea>
        </Box>
    )
}
