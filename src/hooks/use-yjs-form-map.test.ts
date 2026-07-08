import { vi } from 'vitest'
import {
    beforeEach,
    createTestProposalDraft,
    db,
    describe,
    expect,
    faker,
    it,
    renderHook,
    waitFor,
} from '@/tests/unit.helpers'
import { useForm } from '@mantine/form'
import * as Y from 'yjs'
import { type HocuspocusProviderHandle } from '@/tests/hocuspocus.mock'
import { proposalFieldsDocName } from '@/lib/collaboration-documents'
import { initialProposalValues, type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { useYjsFormMap } from './use-yjs-form-map'

// Dynamic import inside the factory so the helper module is resolved at mock
// time, not at file-init. Using a top-level `import` left the binding in TDZ
// when vitest hoisted vi.mock above it, throwing "Cannot access __vi_import_N__
// before initialization" on CI.
vi.mock('@hocuspocus/provider', async () => {
    const { createHocuspocusMock } = await import('@/tests/hocuspocus.mock')
    return createHocuspocusMock({ withYDoc: true })
})

import * as HocuspocusModule from '@hocuspocus/provider'

const constructed = (HocuspocusModule as unknown as { __constructed: HocuspocusProviderHandle[] }).__constructed

const newWebsocketProvider = () => new HocuspocusModule.HocuspocusProviderWebsocket(undefined as never)

const buildProposalForm = (overrides: Partial<ProposalFormValues> = {}) => {
    const initial = { ...initialProposalValues, ...overrides }
    return renderHook(() => useForm<ProposalFormValues>({ mode: 'uncontrolled', initialValues: initial }))
}

const setupCollabHook = ({
    studyId,
    formInitial,
    websocketProvider = newWebsocketProvider(),
}: {
    studyId: string
    formInitial: Partial<ProposalFormValues>
    websocketProvider?: ReturnType<typeof newWebsocketProvider> | null
}) => {
    const { result: formResult } = buildProposalForm(formInitial)
    const form = formResult.current
    const hookResult = renderHook(() =>
        useYjsFormMap({
            studyId,
            form,
            websocketProvider,
        }),
    )
    return { form, hookResult }
}

const createDraftStudy = (slugTag: string, formTitle = 'Original') =>
    createTestProposalDraft({
        enclaveSlug: `yjs-${slugTag}-enclave`,
        studyInfo: { title: formTitle },
    })

describe('useYjsFormMap', () => {
    beforeEach(() => {
        constructed.length = 0
    })

    it('cold load: seeds the Y.Map from form initial values when no yjsDocument row exists', async () => {
        const { studyId } = await createDraftStudy('cold')
        const piUserId = faker.string.uuid()

        const { hookResult } = setupCollabHook({
            studyId,
            formInitial: {
                title: 'Original',
                datasets: ['ds-1'],
                piName: 'PI',
                piUserId,
            },
        })

        expect(constructed).toHaveLength(1)
        constructed[0].triggerSync()

        await waitFor(() => expect(hookResult.result.current.isSynced).toBe(true))

        const fieldsMap = hookResult.result.current.fieldsMap
        expect(fieldsMap).not.toBeNull()
        expect(fieldsMap!.get('title')).toBe('Original')
        expect(fieldsMap!.get('datasets')).toEqual(['ds-1'])
        expect(fieldsMap!.get('piName')).toBe('PI')
        expect(fieldsMap!.get('piUserId')).toBe(piUserId)
    })

    it('warm load: applies CRDT state pushed before sync to the form when a yjsDocument row exists', async () => {
        const { studyId } = await createDraftStudy('warm', 'OriginalForm')

        // The row gates `getYjsDocumentUpdatedAtAction` onto the warm-load branch (non-null
        // updatedAt). The mocked Hocuspocus provider can't read it back as CRDT bytes, so
        // the Y.applyUpdate below is what supplies the actual content the form will see.
        await db
            .insertInto('yjsDocument')
            .values({
                name: proposalFieldsDocName(studyId),
                studyId,
                data: Buffer.from([0]),
            })
            .execute()

        const { form, hookResult } = setupCollabHook({
            studyId,
            formInitial: { title: 'OriginalForm', datasets: [], piName: 'PI', piUserId: faker.string.uuid() },
        })

        expect(constructed).toHaveLength(1)
        const handle = constructed[0]

        // Simulate the Hocuspocus server pushing persisted CRDT state into the doc
        // before the synced event fires.
        const seedDoc = new Y.Doc()
        seedDoc.getMap('fields').set('title', 'FromCRDT')
        Y.applyUpdate(handle.document!, Y.encodeStateAsUpdate(seedDoc))

        handle.triggerSync()

        await waitFor(() => expect(hookResult.result.current.isSynced).toBe(true))
        await waitFor(() => expect(form.getValues().title).toBe('FromCRDT'))
        expect(form.isDirty()).toBe(false)
    })

    it('remote update applies to local form mid-session', async () => {
        const { studyId } = await createDraftStudy('remote')

        const { form, hookResult } = setupCollabHook({
            studyId,
            formInitial: {
                title: 'Original',
                datasets: ['ds-1'],
                piName: 'PI',
                piUserId: faker.string.uuid(),
            },
        })

        expect(constructed).toHaveLength(1)
        const handle = constructed[0]
        handle.triggerSync()
        await waitFor(() => expect(hookResult.result.current.isSynced).toBe(true))

        // Write to the captured Y.Doc with a non-LOCAL_ORIGIN origin so the hook's
        // observe handler treats it as a remote update.
        const remoteOrigin = Symbol('remote')
        const document = handle.document!
        document.transact(() => {
            document.getMap('fields').set('title', 'Remote')
        }, remoteOrigin)

        await waitFor(() => expect(form.getValues().title).toBe('Remote'))
        expect(form.isDirty()).toBe(false)
    })

    it('local writes via pushField propagate to a remote peer with the LOCAL_ORIGIN tag', async () => {
        const { studyId } = await createDraftStudy('local')

        const { hookResult } = setupCollabHook({
            studyId,
            formInitial: {
                title: 'Original',
                datasets: ['ds-1'],
                piName: 'PI',
                piUserId: faker.string.uuid(),
            },
        })

        expect(constructed).toHaveLength(1)
        const handle = constructed[0]
        handle.triggerSync()
        await waitFor(() => expect(hookResult.result.current.isSynced).toBe(true))

        const peerB = new Y.Doc()
        // Pre-sync peerB with peerA's current state so the receiving peer has the
        // baseline before applying incremental updates.
        Y.applyUpdate(peerB, Y.encodeStateAsUpdate(handle.document!))

        const capturedOrigins: unknown[] = []
        handle.document!.on('update', (update: Uint8Array, origin: unknown) => {
            capturedOrigins.push(origin)
            Y.applyUpdate(peerB, update, origin)
        })

        hookResult.result.current.pushField('datasets', ['ds-1', 'ds-2'])

        // Confirm the local write committed before checking propagation.
        expect(handle.document!.getMap('fields').get('datasets')).toEqual(['ds-1', 'ds-2'])

        await waitFor(() => expect(peerB.getMap('fields').get('datasets')).toEqual(['ds-1', 'ds-2']))

        const localOrigin = capturedOrigins.find(
            (o): o is symbol => typeof o === 'symbol' && (o as symbol).description === 'use-yjs-form-map.local',
        )
        expect(localOrigin).toBeDefined()
    })

    it('pushPI writes both keys in a single transact', async () => {
        const { studyId } = await createDraftStudy('pi')

        const { hookResult } = setupCollabHook({
            studyId,
            formInitial: {
                title: 'Original',
                datasets: ['ds-1'],
                piName: 'PI',
                piUserId: faker.string.uuid(),
            },
        })

        expect(constructed).toHaveLength(1)
        constructed[0].triggerSync()
        await waitFor(() => expect(hookResult.result.current.isSynced).toBe(true))

        const fieldsMap = hookResult.result.current.fieldsMap!
        const events: Y.YMapEvent<unknown>[] = []
        const observer = (event: Y.YMapEvent<unknown>) => events.push(event)
        fieldsMap.observe(observer)

        const newPiId = faker.string.uuid()
        hookResult.result.current.pushPI(newPiId, 'Dr. PI')

        expect(events).toHaveLength(1)
        expect(events[0].keysChanged).toEqual(new Set(['piName', 'piUserId']))
        expect(fieldsMap.get('piName')).toBe('Dr. PI')
        expect(fieldsMap.get('piUserId')).toBe(newPiId)

        fieldsMap.unobserve(observer)
    })

    it('does not mark fields edited when seeding initial values on first sync', async () => {
        const { studyId } = await createDraftStudy('seed-not-edit')

        const { hookResult } = setupCollabHook({
            studyId,
            formInitial: { title: 'Original', datasets: ['ds-1'], piName: 'PI', piUserId: faker.string.uuid() },
        })

        constructed[0].triggerSync()
        await waitFor(() => expect(hookResult.result.current.isSynced).toBe(true))

        expect(hookResult.result.current.fieldsMap!.get('title')).toBe('Original')
        expect(hookResult.result.current.editedKeys.size).toBe(0)
    })

    it('marks only the pushed field as edited, and only on an actual write', async () => {
        const { studyId } = await createDraftStudy('edit-keys')

        const { hookResult } = setupCollabHook({
            studyId,
            formInitial: { title: 'Original', datasets: ['ds-1'], piName: 'PI', piUserId: faker.string.uuid() },
        })

        constructed[0].triggerSync()
        await waitFor(() => expect(hookResult.result.current.isSynced).toBe(true))

        // A no-op push (value already in the map) must not flag the field. The real
        // push after it bounds the assertion: once 'title' is marked, a lingering
        // mark from the no-op would show up in the size check below.
        hookResult.result.current.pushField('title', 'Original')
        hookResult.result.current.pushField('datasets', ['ds-1', 'ds-2'])

        await waitFor(() => expect(hookResult.result.current.editedKeys.has('datasets')).toBe(true))
        expect(hookResult.result.current.editedKeys.has('title')).toBe(false)
        expect(hookResult.result.current.editedKeys.size).toBe(1)
    })

    it('marks both PI keys as edited on pushPI', async () => {
        const { studyId } = await createDraftStudy('edit-pi')

        const { hookResult } = setupCollabHook({
            studyId,
            formInitial: { title: 'Original', datasets: ['ds-1'], piName: 'PI', piUserId: faker.string.uuid() },
        })

        constructed[0].triggerSync()
        await waitFor(() => expect(hookResult.result.current.isSynced).toBe(true))

        hookResult.result.current.pushPI(faker.string.uuid(), 'Dr. New')

        await waitFor(() => expect(hookResult.result.current.editedKeys.has('piName')).toBe(true))
        expect(hookResult.result.current.editedKeys.has('piUserId')).toBe(true)
        expect(hookResult.result.current.editedKeys.has('title')).toBe(false)
    })

    it('remote updates do not mark fields as edited', async () => {
        const { studyId } = await createDraftStudy('remote-not-edit')

        const { form, hookResult } = setupCollabHook({
            studyId,
            formInitial: { title: 'Original', datasets: ['ds-1'], piName: 'PI', piUserId: faker.string.uuid() },
        })

        const handle = constructed[0]
        handle.triggerSync()
        await waitFor(() => expect(hookResult.result.current.isSynced).toBe(true))

        const remoteOrigin = Symbol('remote')
        const document = handle.document!
        document.transact(() => {
            document.getMap('fields').set('title', 'Remote')
        }, remoteOrigin)

        await waitFor(() => expect(form.getValues().title).toBe('Remote'))
        expect(hookResult.result.current.editedKeys.size).toBe(0)
    })

    it('hook is inert without a websocket provider', () => {
        const studyId = faker.string.uuid()
        const { hookResult } = setupCollabHook({
            studyId,
            formInitial: { title: 'Original', datasets: ['ds-1'], piName: 'PI', piUserId: faker.string.uuid() },
            websocketProvider: null,
        })

        expect(constructed).toHaveLength(0)
        expect(hookResult.result.current.provider).toBeNull()
        expect(hookResult.result.current.fieldsMap).toBeNull()
        expect(hookResult.result.current.isSynced).toBe(false)
        expect(() => hookResult.result.current.pushField('title', 'X')).not.toThrow()
    })
})
