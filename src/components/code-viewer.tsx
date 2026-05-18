'use client'

import { useMemo } from 'react'
import { ScrollArea, Box, Text } from '@mantine/core'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import julia from 'highlight.js/lib/languages/julia'
import latex from 'highlight.js/lib/languages/latex'
import lua from 'highlight.js/lib/languages/lua'
import makefile from 'highlight.js/lib/languages/makefile'
import markdown from 'highlight.js/lib/languages/markdown'
import matlab from 'highlight.js/lib/languages/matlab'
import perl from 'highlight.js/lib/languages/perl'
import php from 'highlight.js/lib/languages/php'
import plaintext from 'highlight.js/lib/languages/plaintext'
import python from 'highlight.js/lib/languages/python'
import r from 'highlight.js/lib/languages/r'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import sas from 'highlight.js/lib/languages/sas'
import scala from 'highlight.js/lib/languages/scala'
import sql from 'highlight.js/lib/languages/sql'
import stata from 'highlight.js/lib/languages/stata'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import 'highlight.js/styles/github.css'
import type { HighlightLanguage } from '@/lib/languages'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('css', css)
hljs.registerLanguage('dockerfile', dockerfile)
hljs.registerLanguage('go', go)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('julia', julia)
hljs.registerLanguage('latex', latex)
hljs.registerLanguage('lua', lua)
hljs.registerLanguage('makefile', makefile)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('matlab', matlab)
hljs.registerLanguage('perl', perl)
hljs.registerLanguage('php', php)
hljs.registerLanguage('plaintext', plaintext)
hljs.registerLanguage('python', python)
hljs.registerLanguage('r', r)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('sas', sas)
hljs.registerLanguage('scala', scala)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('stata', stata)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('yaml', yaml)

interface CodeViewerProps {
    code: string
    language: HighlightLanguage
    fileName?: string
}

export function CodeViewer({ code, language, fileName }: CodeViewerProps) {
    const highlightedCode = useMemo(() => {
        try {
            return hljs.highlight(code, { language }).value
        } catch (error) {
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
                <pre
                    style={{
                        margin: 0,
                        padding: '1rem',
                        background: '#f6f8fa',
                        borderRadius: '4px',
                        color: '#24292f',
                    }}
                >
                    <code
                        className={`language-${language}`}
                        style={{ color: 'inherit' }}
                        dangerouslySetInnerHTML={{ __html: highlightedCode }}
                    />
                </pre>
            </ScrollArea>
        </Box>
    )
}
