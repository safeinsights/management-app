import { REQUEST_PATH_HEADER } from '@/lib/request-path'
import { Routes } from '@/lib/routes'
import { keyGenerationUrl } from '@/lib/user-key-redirect'
import { describe, expect, it, mockSessionWithTestData } from '@/tests/unit.helpers'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireUserKey } from './user-key-gate'

const requestPath = async (path: string) => (await headers()).set(REQUEST_PATH_HEADER, path)

describe('requireUserKey', () => {
    it('redirects a keyless account to key setup', async () => {
        await mockSessionWithTestData({ orgType: 'lab' })

        await requireUserKey()

        expect(redirect).toHaveBeenCalledWith(Routes.accountKeys)
    })

    it('carries the page a keyless account asked for to key setup', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })
        await requestPath(`/${org.slug}/study/abc/review?tab=code`)

        await requireUserKey()

        expect(redirect).toHaveBeenCalledWith(keyGenerationUrl(`/${org.slug}/study/abc/review?tab=code`))
    })

    // Otherwise the signup flow, which reaches the gate through My dashboard, would lose the
    // inviting org's landing.
    it.each([Routes.dashboard, Routes.home, `${Routes.dashboard}?skip=Acme`])('does not carry %s', async (path) => {
        await mockSessionWithTestData({ orgType: 'lab' })
        await requestPath(path)

        await requireUserKey()

        expect(redirect).toHaveBeenCalledWith(Routes.accountKeys)
    })

    it('drops a path that does not stay on this site', async () => {
        await mockSessionWithTestData({ orgType: 'lab' })
        await requestPath('//evil.example/x')

        await requireUserKey()

        expect(redirect).toHaveBeenCalledWith(Routes.accountKeys)
    })

    it('lets an account that holds a key through', async () => {
        await mockSessionWithTestData({ orgType: 'enclave' })

        await requireUserKey()

        expect(redirect).not.toHaveBeenCalled()
    })
})
