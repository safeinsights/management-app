import { describe, expect, it, vi } from 'vitest'

import {
    authenticate,
    isStatelessEventValidForDocument,
    parseDocumentName,
    parseStatelessEvent,
    requiredOrgIdForDocument,
    type AuthenticateDeps,
    type DbQuery,
} from './auth'

const STUDY_ID = '019ddb2a-5f38-74ea-b401-94fd79839071'

describe('parseDocumentName', () => {
    it('parses review-feedback documents', () => {
        expect(parseDocumentName(`review-feedback-${STUDY_ID}`)).toEqual({
            kind: 'review-feedback',
            studyId: STUDY_ID,
        })
    })

    it('parses proposal-fields documents', () => {
        expect(parseDocumentName(`proposal-${STUDY_ID}-fields`)).toEqual({
            kind: 'proposal-fields',
            studyId: STUDY_ID,
        })
    })

    it.each(['research-questions', 'project-summary', 'impact', 'additional-notes'] as const)(
        'parses proposal-text document with slug %s',
        (slug) => {
            expect(parseDocumentName(`proposal-${STUDY_ID}-${slug}`)).toEqual({
                kind: 'proposal-text',
                studyId: STUDY_ID,
                slug,
            })
        },
    )

    it.each([
        '',
        'random-string',
        'proposal-not-a-uuid-fields',
        `proposal-${STUDY_ID}-unknown-suffix`,
        `review-feedback-not-a-uuid`,
        `proposal-${STUDY_ID}`,
        `review-feedback-${STUDY_ID}-extra`,
    ])('rejects malformed name "%s"', (name) => {
        expect(parseDocumentName(name)).toBeNull()
    })
})

describe('requiredOrgIdForDocument', () => {
    const study = { org_id: 'do-org', submitted_by_org_id: 'lab-org' }

    it('returns DO org for review-feedback', () => {
        expect(requiredOrgIdForDocument({ kind: 'review-feedback', studyId: STUDY_ID }, study)).toBe('do-org')
    })

    it('returns lab org for proposal-fields', () => {
        expect(requiredOrgIdForDocument({ kind: 'proposal-fields', studyId: STUDY_ID }, study)).toBe('lab-org')
    })

    it('returns lab org for proposal-text', () => {
        expect(
            requiredOrgIdForDocument({ kind: 'proposal-text', studyId: STUDY_ID, slug: 'research-questions' }, study),
        ).toBe('lab-org')
    })
})

describe('parseStatelessEvent', () => {
    const baseEvent = {
        type: 'proposal-submitted',
        studyId: STUDY_ID,
        submittedByName: 'Alice Reviewer',
        submittedByTabId: 'tab-1',
    }

    it('accepts a well-formed proposal-submitted event', () => {
        expect(parseStatelessEvent(JSON.stringify(baseEvent))).toEqual(baseEvent)
    })

    it('accepts a well-formed proposal-review-submitted event', () => {
        const event = { ...baseEvent, type: 'proposal-review-submitted' }
        expect(parseStatelessEvent(JSON.stringify(event))).toEqual(event)
    })

    it('rejects non-string payload', () => {
        expect(parseStatelessEvent(42)).toBeNull()
        expect(parseStatelessEvent(null)).toBeNull()
    })

    it('rejects invalid JSON', () => {
        expect(parseStatelessEvent('not json {')).toBeNull()
    })

    it('rejects unknown event type', () => {
        expect(parseStatelessEvent(JSON.stringify({ ...baseEvent, type: 'forged-event' }))).toBeNull()
    })

    it('rejects malformed studyId', () => {
        expect(parseStatelessEvent(JSON.stringify({ ...baseEvent, studyId: 'not-a-uuid' }))).toBeNull()
    })

    it('rejects empty submittedByName', () => {
        expect(parseStatelessEvent(JSON.stringify({ ...baseEvent, submittedByName: '' }))).toBeNull()
    })

    it('rejects missing submittedByTabId', () => {
        const { submittedByTabId: _drop, ...incomplete } = baseEvent
        expect(parseStatelessEvent(JSON.stringify(incomplete))).toBeNull()
    })
})

describe('isStatelessEventValidForDocument', () => {
    const event = {
        type: 'proposal-submitted' as const,
        studyId: STUDY_ID,
        submittedByName: 'Alice',
        submittedByTabId: 'tab-1',
    }

    it('accepts proposal-submitted on proposal-fields document', () => {
        expect(isStatelessEventValidForDocument(event, { kind: 'proposal-fields', studyId: STUDY_ID })).toBe(true)
    })

    it('rejects proposal-submitted on review-feedback document', () => {
        expect(isStatelessEventValidForDocument(event, { kind: 'review-feedback', studyId: STUDY_ID })).toBe(false)
    })

    it('accepts proposal-review-submitted on review-feedback', () => {
        expect(
            isStatelessEventValidForDocument(
                { ...event, type: 'proposal-review-submitted' },
                { kind: 'review-feedback', studyId: STUDY_ID },
            ),
        ).toBe(true)
    })

    it('rejects proposal-review-submitted on proposal-fields', () => {
        expect(
            isStatelessEventValidForDocument(
                { ...event, type: 'proposal-review-submitted' },
                { kind: 'proposal-fields', studyId: STUDY_ID },
            ),
        ).toBe(false)
    })

    it('rejects studyId mismatch', () => {
        expect(
            isStatelessEventValidForDocument(event, {
                kind: 'proposal-fields',
                studyId: '019ddb2a-5f38-74ea-b401-94fd79839072',
            }),
        ).toBe(false)
    })
})

type ScriptedQuery = (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>

const dbFromScripts = (scripts: ScriptedQuery): DbQuery => ({
    query: scripts as DbQuery['query'],
})

const baseDeps = (overrides: Partial<AuthenticateDeps> = {}): AuthenticateDeps => ({
    db: dbFromScripts(async () => ({ rows: [], rowCount: 0 })),
    verifyToken: async () => ({ sub: 'clerk-user-1' }),
    jwtKey: 'fake-jwt-key',
    secretKey: undefined,
    authorizedParties: [],
    siAdminOrgSlug: 'safe-insights',
    ...overrides,
})

describe('authenticate', () => {
    it('rejects when token is missing', async () => {
        await expect(
            authenticate({ token: null, documentName: `review-feedback-${STUDY_ID}` }, baseDeps()),
        ).rejects.toThrow(/missing token/)
    })

    it('rejects when verifyToken returns no subject', async () => {
        await expect(
            authenticate(
                { token: 'tok', documentName: `review-feedback-${STUDY_ID}` },
                baseDeps({ verifyToken: async () => ({ sub: null }) }),
            ),
        ).rejects.toThrow(/no subject/)
    })

    it('rejects when verifyToken throws (invalid signature / expired)', async () => {
        await expect(
            authenticate(
                { token: 'tok', documentName: `review-feedback-${STUDY_ID}` },
                baseDeps({
                    verifyToken: async () => {
                        throw new Error('jwt expired')
                    },
                }),
            ),
        ).rejects.toThrow(/jwt expired/)
    })

    it('rejects unrecognized document name', async () => {
        await expect(authenticate({ token: 'tok', documentName: 'garbage' }, baseDeps())).rejects.toThrow(
            /unrecognized document/,
        )
    })

    it('rejects when user is not provisioned', async () => {
        const db = dbFromScripts(async (text) => {
            if (text.includes('FROM "user"')) return { rows: [], rowCount: 0 }
            return { rows: [], rowCount: 0 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `review-feedback-${STUDY_ID}` }, baseDeps({ db })),
        ).rejects.toThrow(/user not provisioned/)
    })

    it('rejects when study is not found', async () => {
        const db = dbFromScripts(async (text) => {
            if (text.includes('FROM "user"')) return { rows: [{ id: 'user-1' }], rowCount: 1 }
            if (text.includes('FROM study')) return { rows: [], rowCount: 0 }
            return { rows: [], rowCount: 0 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `review-feedback-${STUDY_ID}` }, baseDeps({ db })),
        ).rejects.toThrow(/study not found/)
    })

    it('rejects a lab member trying to open a review-feedback document (cross-org)', async () => {
        const queries: Array<{ text: string; values?: unknown[] }> = []
        const db = dbFromScripts(async (text, values) => {
            queries.push({ text, values })
            if (text.includes('FROM "user"')) return { rows: [{ id: 'lab-user' }], rowCount: 1 }
            if (text.includes('FROM study'))
                return { rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org' }], rowCount: 1 }
            // membership check: user is in lab-org, but review-feedback requires do-org
            return { rows: [], rowCount: 0 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `review-feedback-${STUDY_ID}` }, baseDeps({ db })),
        ).rejects.toThrow(/no membership/)
        const membershipQuery = queries.find((q) => q.text.includes('FROM org_user'))
        // Confirms the kind-aware membership check requires do-org for review-feedback.
        expect(membershipQuery?.values?.[2]).toBe('do-org')
    })

    it('rejects a DO member trying to open a proposal-fields document (cross-org)', async () => {
        const queries: Array<{ text: string; values?: unknown[] }> = []
        const db = dbFromScripts(async (text, values) => {
            queries.push({ text, values })
            if (text.includes('FROM "user"')) return { rows: [{ id: 'do-user' }], rowCount: 1 }
            if (text.includes('FROM study'))
                return { rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org' }], rowCount: 1 }
            return { rows: [], rowCount: 0 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `proposal-${STUDY_ID}-fields` }, baseDeps({ db })),
        ).rejects.toThrow(/no membership/)
        const membershipQuery = queries.find((q) => q.text.includes('FROM org_user'))
        // Confirms proposal-* requires lab-org.
        expect(membershipQuery?.values?.[2]).toBe('lab-org')
    })

    it('passes a lab member opening their lab proposal-fields document', async () => {
        const db = dbFromScripts(async (text) => {
            if (text.includes('FROM "user"')) return { rows: [{ id: 'lab-user' }], rowCount: 1 }
            if (text.includes('FROM study'))
                return { rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org' }], rowCount: 1 }
            return { rows: [{}], rowCount: 1 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `proposal-${STUDY_ID}-fields` }, baseDeps({ db })),
        ).resolves.toEqual({ user: { id: 'lab-user' } })
    })

    it('passes a DO member opening their DO review-feedback document', async () => {
        const db = dbFromScripts(async (text) => {
            if (text.includes('FROM "user"')) return { rows: [{ id: 'do-user' }], rowCount: 1 }
            if (text.includes('FROM study'))
                return { rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org' }], rowCount: 1 }
            return { rows: [{}], rowCount: 1 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `review-feedback-${STUDY_ID}` }, baseDeps({ db })),
        ).resolves.toEqual({ user: { id: 'do-user' } })
    })

    it('passes a safe-insights admin opening any document', async () => {
        const db = dbFromScripts(async (text) => {
            if (text.includes('FROM "user"')) return { rows: [{ id: 'admin-user' }], rowCount: 1 }
            if (text.includes('FROM study'))
                return { rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org' }], rowCount: 1 }
            return { rows: [{}], rowCount: 1 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `proposal-${STUDY_ID}-research-questions` }, baseDeps({ db })),
        ).resolves.toEqual({ user: { id: 'admin-user' } })
    })

    it('forwards authorizedParties only when non-empty', async () => {
        const verifyToken = vi.fn(async () => ({ sub: 'u' }))
        const db = dbFromScripts(async (text) => {
            if (text.includes('FROM "user"')) return { rows: [{ id: 'u' }], rowCount: 1 }
            if (text.includes('FROM study'))
                return { rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org' }], rowCount: 1 }
            return { rows: [{}], rowCount: 1 }
        })

        await authenticate(
            { token: 'tok', documentName: `review-feedback-${STUDY_ID}` },
            baseDeps({ db, verifyToken, authorizedParties: [] }),
        )
        expect(verifyToken).toHaveBeenCalledWith('tok', expect.objectContaining({ authorizedParties: undefined }))

        verifyToken.mockClear()
        await authenticate(
            { token: 'tok', documentName: `review-feedback-${STUDY_ID}` },
            baseDeps({ db, verifyToken, authorizedParties: ['https://app.example'] }),
        )
        expect(verifyToken).toHaveBeenCalledWith(
            'tok',
            expect.objectContaining({ authorizedParties: ['https://app.example'] }),
        )
    })
})
