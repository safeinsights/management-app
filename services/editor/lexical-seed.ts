// Server-side seeding of fresh Y.Docs from existing Lexical JSON columns.
// Replaces the client-side `shouldBootstrap` + `initialContent` path on the
// proposal text fields, eliminating the race where two clients hitting first
// open simultaneously would each bootstrap and CRDT-additive-merge into
// duplicated content. Hocuspocus serializes `onLoadDocument` per document, so
// this seeding runs at most once per fresh Y.Doc.
//
// Mirrors the `initializeEditor` path inside `@lexical/react`'s
// `LexicalCollaborationPlugin` but headless (no DOM) and synchronous from the
// server's perspective.

import { createHeadlessEditor } from '@lexical/headless'
import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { createBinding, syncLexicalUpdateToYjs, type Provider } from '@lexical/yjs'
import { HISTORY_MERGE_TAG, type Klass, type LexicalNode } from 'lexical'
import * as Y from 'yjs'

import type { ProposalTextSlug } from './auth.ts'

// Mirrors src/components/editable-text/config.ts:lexicalNodes. Duplicated
// because that file pulls in the React lexical packages, which the headless
// editor service must not depend on.
const SEED_NODES: Klass<LexicalNode>[] = [ListNode, ListItemNode, LinkNode]

// Slug → snake-cased study column. Duplicated locally; both ends of the slug
// list are stable.
export const SLUG_TO_STUDY_COLUMN: Record<ProposalTextSlug, string> = {
    'research-questions': 'research_questions',
    'project-summary': 'project_summary',
    impact: 'impact',
    'additional-notes': 'additional_notes',
}

// Stub Provider satisfying the @lexical/yjs binding's structural type. The
// binding doesn't dispatch awareness or remote events during a one-shot seed,
// so all the listeners are no-ops.
function createStubProvider(): Provider {
    return {
        awareness: {
            getLocalState: () => null,
            setLocalState: () => {},
            getStates: () => new Map(),
            on: () => {},
            off: () => {},
            setLocalStateField: () => {},
        },
        connect: () => {},
        disconnect: () => {},
        on: () => {},
        off: () => {},
    }
}

// Seeds the supplied Y.Doc from a stored Lexical JSON string. No-op (returns
// false) when the JSON is empty/falsy. Returns true on a successful seed.
//
// Throws on malformed JSON or invalid Lexical structure so the caller can
// decide whether to swallow the error (typical: log and continue with an
// empty Y.Doc rather than block the connection on a corrupt DB column).
export function seedYDocFromLexical(yDoc: Y.Doc, lexicalJson: string | null | undefined): boolean {
    if (!lexicalJson) return false
    const trimmed = lexicalJson.trim()
    if (trimmed.length === 0) return false

    const editor = createHeadlessEditor({
        namespace: 'editor-seed',
        nodes: SEED_NODES,
        onError: (error) => {
            throw error
        },
    })

    const provider = createStubProvider()
    const docMap = new Map<string, Y.Doc>()
    const id = 'seed'
    docMap.set(id, yDoc)

    const binding = createBinding(editor, provider, id, yDoc, docMap)

    // Match the `useYjsCollaboration` registration: every editor update is
    // streamed into the Y.Doc via the binding. This is what populates the Y.Doc
    // from the parsed editor state below.
    const removeListener = editor.registerUpdateListener(
        ({ prevEditorState, editorState, dirtyLeaves, dirtyElements, normalizedNodes, tags }) => {
            syncLexicalUpdateToYjs(
                binding,
                provider,
                prevEditorState,
                editorState,
                dirtyElements,
                dirtyLeaves,
                normalizedNodes,
                tags,
            )
        },
    )

    try {
        const parsed = editor.parseEditorState(trimmed)
        editor.setEditorState(parsed, { tag: HISTORY_MERGE_TAG })
    } finally {
        removeListener()
    }

    return true
}
