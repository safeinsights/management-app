import { expect, test, beforeEach } from 'vitest'
import * as apiHandler from './route'
import { insertTestStudyData, mockApiMember } from '@/tests/helpers'
import { uuidToB64 } from '@/lib/uuid'
import { type Member } from '@/lib/types'

let member: Member | null = null

beforeEach(async () => {
    member = await mockApiMember({ identifier: 'testy-mctestface' })
})

test('jwt is verified', async () => {
    const resp = await apiHandler.GET()
    expect(resp.status).toBe(200)
    expect(await resp.json()).toEqual([])
})

test('return study runs', async () => {
    const { runIds } = await insertTestStudyData({ memberId: member?.id || '' })

    const resp = await apiHandler.GET()
    const json = await resp.json()

    expect(json).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                runId: runIds[0],
                title: 'my 1st study',
                status: 'pending',
                dataSources: ['all'],
                outputMimeType: 'text/csv',
                containerLocation: `test-container:${uuidToB64(runIds[0])}`,
            }),
            expect.objectContaining({
                runId: runIds[1],
                title: 'my 1st study',
                status: 'pending',
                dataSources: ['all'],
                outputMimeType: 'text/csv',
                containerLocation: `test-container:${uuidToB64(runIds[1])}`,
            }),
        ]),
    )
})
