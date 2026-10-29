import { HocuspocusProvider } from '@hocuspocus/provider'
import { act } from '@testing-library/react'
import { $createParagraphNode, $createTextNode, $getRoot, getNearestEditorFromDOMNode } from 'lexical'

const lexicalTextNode = (text: string) => ({
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
    text,
    type: 'text',
    version: 1,
})

/** Serialized Lexical state for one paragraph holding a link, plus optional plain text around it. */
export function lexicalLinkState({
    url,
    text = 'example',
    target = '_blank',
    lead,
    tail,
}: {
    url: string
    text?: string
    target?: string | null
    lead?: string
    tail?: string
}) {
    const link = {
        children: [lexicalTextNode(text)],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'link',
        version: 1,
        rel: target ? 'noopener noreferrer' : null,
        target,
        title: null,
        url,
    }
    const children = [
        ...(lead === undefined ? [] : [lexicalTextNode(lead)]),
        link,
        ...(tail === undefined ? [] : [lexicalTextNode(tail)]),
    ]

    return JSON.stringify({
        root: {
            children: [{ children, direction: 'ltr', format: '', indent: 0, type: 'paragraph', version: 1 }],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
        },
    })
}

// Vitest transforms a module on its first import, so the first lazy editor load in a run can outlast
// a findBy. Call from beforeAll in a file that waits on the editor; production serves a built chunk.
export const preloadEditor = async () => {
    await import('@/components/editable-text/collaborative-editor')
}

type FakeCollaborativeProvider = { configuration: { name?: string }; __simulateSave: () => void }

/**
 * Drives one autosave round trip so a save indicator reaches "All changes saved". Without it the
 * Hocuspocus mock never emits, and a test asserting the label is absent proves nothing.
 *
 * Call once the editor has mounted: it takes the newest provider. `docName` picks one of several.
 */
export const simulateEditorSave = async (docName?: string) => {
    const { __instances } = HocuspocusProvider as unknown as { __instances: FakeCollaborativeProvider[] }
    const matching = docName ? __instances.filter((p) => p.configuration.name === docName) : __instances
    const provider = matching.at(-1)

    if (!provider) {
        throw new Error(`No collaborative editor provider${docName ? ` named "${docName}"` : ''} has been created`)
    }

    await act(async () => {
        provider.__simulateSave()
    })
}

/**
 * The live Lexical editor behind a mounted collaborative surface, given its root or any node in it.
 *
 * Edits must go through Lexical's API because happy-dom cannot dispatch the `beforeinput` events it
 * listens for, and the collaborative editor has no `children` slot to take a CaptureEditor plugin.
 */
export const lexicalEditorFor = (surface: HTMLElement) => {
    const editor = getNearestEditorFromDOMNode(surface)
    if (!editor) throw new Error('that element is not a mounted Lexical surface')
    return editor
}

export const setEditorText = async (surface: HTMLElement, text: string) => {
    const editor = lexicalEditorFor(surface)
    // Awaited: Lexical commits on a microtask, so a synchronous act() returns before the change
    // has reached the form.
    await act(async () => {
        editor.update(() => {
            const paragraph = $createParagraphNode()
            if (text) paragraph.append($createTextNode(text))
            $getRoot().clear().append(paragraph)
        })
    })
}
