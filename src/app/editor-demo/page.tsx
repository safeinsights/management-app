'use client'

import { useEffect, useState } from 'react'
import { Center, Loader } from '@mantine/core'

function EditorDemoLoader() {
    const [Editor, setEditor] = useState<React.ComponentType | null>(null)

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

    return <Editor />
}

export default function EditorDemoPage() {
    return <EditorDemoLoader />
}
