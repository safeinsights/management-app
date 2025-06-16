"use client";

import {
  toSocket,
  WebSocketMessageReader,
  WebSocketMessageWriter,
} from "vscode-ws-jsonrpc";

import { DEFAULT_CODE } from "./code";
import MonacoEditor from '@monaco-editor/react';
import { Flex } from "@mantine/core";
import { EditorToolbar } from "./toolbar";
import { useEditorStore } from "./state";

export default function Home() {

    const configureEditor = useEditorStore(state => state.configureEditor)

    return (
        <Flex direction="column">
            <EditorToolbar />
            <MonacoEditor
                theme="vs-dark"
                height={'80vh'}
                defaultLanguage="r"
                defaultValue={DEFAULT_CODE}
                path="file:///main.r"
                onMount={configureEditor}
                options={{ automaticLayout: true }}
                loading={<div>Loading editor...</div>}
            />
        </Flex>
    );
}
