import { create } from 'zustand'
import { configureEditor, Editor, OnMountHandler } from './config'
import { useShallow } from 'zustand/react/shallow'

export { useShallow }

export type AiMessage = {
    sender: 'user' | 'assistant'
    message: string
    code?: string // Optional code snippet for user messages
}

interface EditorStoreState {
    editor: Editor;
    configureEditor: OnMountHandler;
    appendMessagePair(user: string, ai: string, code: string): void
    isDrawerOpen: boolean;
    aiMessages: AiMessage[];
}

export const useEditorStore = create<EditorStoreState>((set) => ({
    editor: null as any, // Initially null, will be set by configureEditor
    isDrawerOpen: true,
    aiMessages: [],
    configureEditor(editor, monaco) {
        configureEditor(editor, monaco)
        set({ editor })
    },
    appendMessagePair(user: string, ai: string, code: string) {
        set({
            aiMessages: [
                ...useEditorStore.getState().aiMessages,
                { sender: 'user', message: user, code },
                { sender: 'assistant', message: ai },
            ]
        })
    },

}))
