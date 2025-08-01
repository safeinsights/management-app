import { expect, test } from 'vitest'
import * as apiHandler from './route'
import { db } from '@/database'
import { insertTestStudyData, insertTestOrg, readTestSupportFile, insertTestUser } from '@/tests/unit.helpers'
import { headers } from 'next/headers'
import jwt from 'jsonwebtoken'

test('missing JWT is rejected', async () => {
    const resp = await apiHandler.GET()
    expect(resp.status).toBe(401)
    expect(await resp.json()).toEqual({
        error: "Token error: Error: 'Authorization' header missing or not well formed.  Headers are:\n",
    })
})

test('jwt with invalid iss is rejected', async () => {
    const privateKey = await readTestSupportFile('invalid_private_key.pem')
    const token = jwt.sign({ iss: 'unknown-org-slug' }, privateKey, { algorithm: 'RS256' })
    const hdr = await headers()
    hdr.set('Authorization', `Bearer ${token}`)
    const resp = await apiHandler.GET()
    expect(resp.status).toBe(401)
    expect(await resp.json()).toEqual({ error: 'Token error: Error: Org not found' })
})

test('jwt with expired token is rejected', async () => {
    const org = await insertTestOrg()
    const privateKey = await readTestSupportFile('private_key.pem')
    const token = jwt.sign({ iss: org.slug }, privateKey, { algorithm: 'RS256', expiresIn: -30 })
    const hdr = await headers()
    hdr.set('Authorization', `Bearer ${token}`)
    const resp = await apiHandler.GET()
    expect(resp.status).toBe(401)
    expect(await resp.json()).toEqual({ error: 'Token error: TokenExpiredError: jwt expired' })
})

test('return study jobs', async () => {
    const org = await insertTestOrg()
    const { jobIds } = await insertTestStudyData({ org })

    const resp = await apiHandler.GET()
    const json = await resp.json()

    expect(json).toEqual({
        jobs: expect.arrayContaining([
            expect.objectContaining({
                jobId: jobIds[1],
                title: 'my 1st study',
                status: 'JOB-RUNNING',
                dataSources: ['all'],
                outputMimeType: 'text/csv',
                containerLocation: `test-container:${jobIds[1]}`,
            }),
            expect.objectContaining({
                jobId: jobIds[2],
                title: 'my 1st study',
                status: 'JOB-READY',
                dataSources: ['all'],
                outputMimeType: 'text/csv',
                containerLocation: `test-container:${jobIds[2]}`,
            }),
        ]),
    })

    expect(json).not.toEqual({
        jobs: expect.arrayContaining([
            expect.objectContaining({
                jobId: jobIds[0],
            }),
        ]),
    })
})

test('studies are not included once finished', async () => {
    const org = await insertTestOrg()
    const { jobIds } = await insertTestStudyData({ org })

    await db
        .insertInto('jobStatusChange')
        .values({
            studyJobId: jobIds[1],
            status: 'RUN-COMPLETE',
            message: 'A OK',
        })
        .execute()

    const resp = await apiHandler.GET()
    const json = await resp.json()

    expect(json).not.toEqual({
        jobs: expect.arrayContaining([{ jobId: jobIds[1] }]),
    })
})

test('includes approved studies only', async () => {
    const org = await insertTestOrg()
    await insertTestStudyData({ org })
    const { user } = await insertTestUser({ org })

    const pendingReviewStudy = await db
        .insertInto('study')
        .values({
            orgId: org.id,
            containerLocation: 'test-container',
            title: 'my 1st study',
            researcherId: user.id,
            piName: 'test',
            irbProtocols: 'https://www.google.com',
            status: 'PENDING-REVIEW',
            dataSources: ['all'],
            outputMimeType: 'text/csv',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const resp = await apiHandler.GET()
    const json = await resp.json()
    expect(json.jobs).not.toContainEqual(expect.objectContaining({ studyId: pendingReviewStudy.id }))
})
