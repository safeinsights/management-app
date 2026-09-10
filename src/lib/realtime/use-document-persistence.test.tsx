import { act, describe, expect, it, renderHook } from '@/tests/unit.helpers'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import { DOCUMENT_STORED_EVENT, useDocumentPersistence } from './use-document-persistence'

const DOC_NAME = 'outputs-review-feedback-019ddb2a-5f38-74ea-b401-94fd798390ff'

// Implements only what the hook touches: `document`, and stateless on/off.
const fakeProvider = () => {
    const document = new Y.Doc()
    const listeners = new Set<(data: { payload: unknown }) => void>()
    return {
        document,
        on: (event: string, listener: (data: { payload: unknown }) => void) => {
            if (event === 'stateless') listeners.add(listener)
        },
        off: (event: string, listener: (data: { payload: unknown }) => void) => {
            if (event === 'stateless') listeners.delete(listener)
        },
        edit: (text: string) => document.getText('feedback').insert(0, text),
        // The acknowledgment carries the vector of the snapshot that was written, which is what
        // lets the hook tell a completed write from one that is still in flight.
        ackCurrentState: (documentName = DOC_NAME) => {
            const stateVector = Buffer.from(Y.encodeStateVector(document)).toString('base64')
            const payload = JSON.stringify({ type: DOCUMENT_STORED_EVENT, documentName, stateVector })
            listeners.forEach((notify) => notify({ payload }))
        },
        ackSnapshot: (snapshot: Uint8Array) => {
            const persisted = new Y.Doc()
            Y.applyUpdate(persisted, snapshot)
            const stateVector = Buffer.from(Y.encodeStateVector(persisted)).toString('base64')
            persisted.destroy()
            const payload = JSON.stringify({
                type: DOCUMENT_STORED_EVENT,
                documentName: DOC_NAME,
                stateVector,
            })
            listeners.forEach((notify) => notify({ payload }))
        },
    }
}

const renderGate = (provider: ReturnType<typeof fakeProvider> | null) =>
    renderHook(() => useDocumentPersistence(provider as unknown as HocuspocusProvider | null, DOC_NAME))

describe('useDocumentPersistence', () => {
    it('reports a tab that never edited as saved, because it has nothing to lose', async () => {
        const { result } = renderGate(fakeProvider())

        await expect(result.current.awaitFeedbackStored()).resolves.toBe(true)
    })

    it('cannot confirm anything without a provider', async () => {
        const { result } = renderGate(null)

        await expect(result.current.awaitFeedbackStored()).resolves.toBe(false)
    })

    it('resolves once an acknowledgment covers the edit', async () => {
        const provider = fakeProvider()
        const { result } = renderGate(provider)
        act(() => provider.edit('reviewed the outputs'))

        const pending = result.current.awaitFeedbackStored()
        act(() => provider.ackCurrentState())

        await expect(pending).resolves.toBe(true)
    })

    // The acknowledgment describes the snapshot that was written. An edit made while that write was
    // in flight is not in it, so a timestamp alone would have called this saved.
    it('stays unsaved when the acknowledgment predates a later edit', async () => {
        const provider = fakeProvider()
        const { result } = renderGate(provider)

        act(() => provider.edit('first'))
        const snapshotOfFirst = Y.encodeStateAsUpdate(provider.document)
        act(() => provider.edit('second'))

        const pending = result.current.awaitFeedbackStored(50)
        act(() => provider.ackSnapshot(snapshotOfFirst))
        await expect(pending).resolves.toBe(false)

        const second = result.current.awaitFeedbackStored()
        act(() => provider.ackCurrentState())
        await expect(second).resolves.toBe(true)
    })

    it('ignores an acknowledgment for another document', async () => {
        const provider = fakeProvider()
        const { result } = renderGate(provider)
        act(() => provider.edit('reviewed'))

        const pending = result.current.awaitFeedbackStored(50)
        act(() => provider.ackCurrentState('outputs-review-feedback-019ddb2a-5f38-74ea-b401-94fd798390aa'))

        await expect(pending).resolves.toBeNull()
    })

    // An editor that has never acknowledged a write is almost certainly a build that does not send
    // them, so the honest answer is "cannot tell" and never "your work is lost".
    it('reports capability unknown when no acknowledgment has ever arrived', async () => {
        const provider = fakeProvider()
        const { result } = renderGate(provider)
        act(() => provider.edit('reviewed'))

        await expect(result.current.awaitFeedbackStored(50)).resolves.toBeNull()
    })

    it('reports unsaved once the editor is known to acknowledge writes', async () => {
        const provider = fakeProvider()
        const { result } = renderGate(provider)

        act(() => provider.edit('first'))
        const pending = result.current.awaitFeedbackStored()
        act(() => provider.ackCurrentState())
        await expect(pending).resolves.toBe(true)

        act(() => provider.edit('second'))

        await expect(result.current.awaitFeedbackStored(50)).resolves.toBe(false)
    })
})
