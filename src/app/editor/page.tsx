'use client';

import React from 'react'
import dynamic from 'next/dynamic'

const DynamicMonacoEditorReact = dynamic(async () => {
    const { Editor } = await import('./editor')
    // const { buildJsonClientUserConfig } = await import('monaco-languageclient-examples/json-client');
    // const comp = await import('@typefox/monaco-editor-react');
    // const wrapperConfig = buildJsonClientUserConfig();
    return () => <Editor />
}, {
    ssr: false
});


export default function Page() {
    return (
        <div style={{ 'height': '80vh', padding: '5px' }} >
            <DynamicMonacoEditorReact />
        </div>
    );
}

