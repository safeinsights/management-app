'use client'

import { useEffect, useState } from 'react'
import { Center, Loader } from '@mantine/core'
import type { ComponentType } from 'react'

type EditorDemoProps = { wsUrl: string }

export function EditorDemoLoader({ wsUrl }: EditorDemoProps) {
    const [Editor, setEditor] = useState<ComponentType<EditorDemoProps> | null>(null)

    useEffect(() => {
        import('./editor-demo').then((mod) => setEditor(() => mod.default))
    }, [])

    if (!Editor) {
        return (
            <Center h="80vh">
                <Loader />
            </Center>
        )
    }

    return <Editor wsUrl={wsUrl} />
}
