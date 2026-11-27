// @vitest-environment node
// The suite stubs the Hocuspocus client (tests/vitest.setup.ts), and a stub is what hid a retry that
// did nothing. This file runs the real client against a real server.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Server } from '@hocuspocus/server'
import type * as HocuspocusClient from '@hocuspocus/provider'
import { Doc } from 'yjs'
import { resendHandshake } from './collaborative-editor'

const { HocuspocusProvider, HocuspocusProviderWebsocket } =
    await vi.importActual<typeof HocuspocusClient>('@hocuspocus/provider')

const DOCUMENT_NAME = 'doc-1'
const INFRA_FAILURE = 'INFRA_UNAVAILABLE: database unreachable'

describe('resendHandshake against a Hocuspocus server', () => {
    let server: Server | undefined
    let socket: HocuspocusClient.HocuspocusProviderWebsocket | undefined

    afterEach(async () => {
        socket?.destroy()
        await server?.destroy()
    })

    it('recovers a document the server turned away, with the text typed in the meantime', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        let isDatabaseDown = true
        server = new Server({
            port: 0,
            quiet: true,
            stopOnSignals: false,
            onAuthenticate: async () => {
                if (isDatabaseDown) throw { reason: INFRA_FAILURE }
            },
        })
        await server.listen()
        const serverText = () => server?.hocuspocus.documents.get(DOCUMENT_NAME)?.getText('body').toString()

        socket = new HocuspocusProviderWebsocket({ url: `ws://127.0.0.1:${server.address.port}` })
        const onAuthenticationFailed = vi.fn()
        const document = new Doc()
        const provider = new HocuspocusProvider({
            websocketProvider: socket,
            name: DOCUMENT_NAME,
            document,
            token: async () => 'token',
            onAuthenticationFailed,
        })
        provider.attach()
        await vi.waitFor(() => expect(onAuthenticationFailed).toHaveBeenCalledWith({ reason: INFRA_FAILURE }))

        document.getText('body').insert(0, 'typed while offline')
        isDatabaseDown = false
        await resendHandshake(provider)

        await vi.waitFor(() => expect(serverText()).toBe('typed while offline'))
        expect(provider.isAuthenticated).toBe(true)

        document.getText('body').insert(0, 'typed after the retry, ')
        await vi.waitFor(() => expect(serverText()).toBe('typed after the retry, typed while offline'))
    })
})
