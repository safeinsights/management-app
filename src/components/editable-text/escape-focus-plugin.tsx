import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { KEY_ESCAPE_COMMAND, COMMAND_PRIORITY_HIGH } from 'lexical'

export function EscapeFocusPlugin() {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        return editor.registerCommand(
            KEY_ESCAPE_COMMAND,
            () => {
                const rootElement = editor.getRootElement()
                rootElement?.blur()
                return true
            },
            COMMAND_PRIORITY_HIGH,
        )
    }, [editor])

    return null
}
