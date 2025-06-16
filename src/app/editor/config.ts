import {registerCompletion, type CompletionRegistration} from 'monacopilot';
import type { OnMount as OnMountHandler } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'

type Editor = editor.IStandaloneCodeEditor

export type { OnMountHandler, Editor }


export const configureEditor: OnMountHandler = (editor, monaco) => {
    const completion = registerCompletion(monaco, editor, {
        language: 'r',
        filename: 'main.r',
        endpoint: '/editor/completion',
    });
    editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Space,
        () => {

            completion.trigger();
        },
    )

    editor.onDidDispose(() => {
        completion.deregister()
    })


}
