'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchFileAction } from './actions'
import type { MinimalRunInfo, CodeManifest } from '@/lib/types'
import { useEffect, useState } from 'react'
import { Flex, Title, LoadingOverlay } from '@mantine/core'
import hljs from 'highlight.js'
import { codeViewStyles, filePathHeading } from './styles.css'
import 'highlight.js/styles/github.css'

function guessLanguage(filePath: string) {
    const lastDotPosition = filePath.lastIndexOf('.')
    if (lastDotPosition === -1) return filePath.split('/').pop() || ''
    return filePath.substring(lastDotPosition + 1) || ''
}

export function DisplayFile({ run, path, manifest }: { run: MinimalRunInfo; path?: string; manifest: CodeManifest }) {
    const [displaying, setDisplaying] = useState('')
    const [html, setHtml] = useState('')

    const { data: sourceCode, isLoading } = useQuery({
        queryKey: ['code-file', displaying],
        enabled: !!displaying,
        queryFn: () => fetchFileAction(run, displaying),
    })

    useEffect(() => {
        if (path && manifest.files[path]) setDisplaying(path)
    }, [path, manifest])

    useEffect(() => {
        if (sourceCode) {
            const language = guessLanguage(displaying)
            try {
                setHtml(hljs.highlight(sourceCode, { language }).value)
            } catch {
                setHtml(hljs.highlightAuto(sourceCode).value)
            }
        }
    }, [displaying, sourceCode])

    return (
        <Flex direction="column" flex="1">
            <Title className={filePathHeading} order={4}>
                {displaying}
            </Title>
            <pre className={codeViewStyles}>
                <LoadingOverlay visible={isLoading} zIndex={1000} overlayProps={{ radius: 'sm', blur: 2 }} />

                <code dangerouslySetInnerHTML={{ __html: html }} />
            </pre>
        </Flex>
    )
}
