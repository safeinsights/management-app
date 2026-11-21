import { describe, expect, it, vi } from 'vitest'

import {
    authenticate,
    AuthFailureError,
    hasFilesDecision,
    isDocumentEditable,
    isReadOnlyDocument,
    parseDocumentName,
    requiredOrgIdForDocument,
    shouldPersistDocument,
    studyEventsOrgIds,
    type AuthenticateDeps,
    type DbQuery,
    type ParsedDocumentName,
} from './auth'
import { ROUND_CLOSING_JOB_STATUSES } from '../../src/lib/job-status-rules.ts'

const STUDY_ID = '019ddb2a-5f38-74ea-b401-94fd79839071'
const JOB_ID = '019ddb2a-5f38-74ea-b401-94fd798390ff'

describe('parseDocumentName', () => {
    it.each([1, 2, 17, 123])('parses versioned review-feedback documents (v%i)', (version) => {
        expect(parseDocumentName(`review-feedback-${STUDY_ID}-v${version}`)).toEqual({
            kind: 'review-feedback',
            studyId: STUDY_ID,
            version,
        })
    })

    it('parses code-review-feedback documents', () => {
        expect(parseDocumentName(`code-review-feedback-${JOB_ID}`)).toEqual({
            kind: 'code-review-feedback',
            jobId: JOB_ID,
        })
    })

    it('parses outputs-review-feedback documents', () => {
        expect(parseDocumentName(`outputs-review-feedback-${JOB_ID}`)).toEqual({
            kind: 'outputs-review-feedback',
            jobId: JOB_ID,
        })
    })

    it('parses code-submission documents', () => {
        expect(parseDocumentName(`code-submission-${STUDY_ID}`)).toEqual({ kind: 'code-submission', studyId: STUDY_ID })
    })

    it('rejects a code-submission document with a malformed study id', () => {
        expect(parseDocumentName('code-submission-not-a-uuid')).toBeNull()
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

    it.each([2, 3, 42])('parses proposal-resubmission-note document at version %s', (version) => {
        expect(parseDocumentName(`proposal-${STUDY_ID}-resubmission-note-v${version}`)).toEqual({
            kind: 'proposal-resubmission-note',
            studyId: STUDY_ID,
            version,
        })
    })

    it.each([
        '',
        'random-string',
        'proposal-not-a-uuid-fields',
        `proposal-${STUDY_ID}-unknown-suffix`,
        `review-feedback-not-a-uuid`,
        `review-feedback-not-a-uuid-v1`,
        `proposal-${STUDY_ID}`,
        `review-feedback-${STUDY_ID}`,
        `review-feedback-${STUDY_ID}-extra`,
        `review-feedback-${STUDY_ID}-v0`,
        `review-feedback-${STUDY_ID}-v01`,
        `review-feedback-${STUDY_ID}-v-1`,
        `review-feedback-${STUDY_ID}-v`,
        `code-review-feedback-not-a-uuid`,
        `outputs-review-feedback-not-a-uuid`,
        `proposal-${STUDY_ID}-resubmission-note`,
        `proposal-${STUDY_ID}-resubmission-note-v0`,
        `proposal-${STUDY_ID}-resubmission-note-v01`,
        `proposal-${STUDY_ID}-resubmission-note-v`,
        `proposal-not-a-uuid-resubmission-note-v2`,
    ])('rejects malformed name "%s"', (name) => {
        expect(parseDocumentName(name)).toBeNull()
    })
})

describe('requiredOrgIdForDocument', () => {
    const study = { org_id: 'do-org', submitted_by_org_id: 'lab-org' }

    it('returns DO org for review-feedback', () => {
        expect(requiredOrgIdForDocument({ kind: 'review-feedback', studyId: STUDY_ID, version: 1 }, study)).toBe(
            'do-org',
        )
    })

    it('returns DO org for code-review-feedback', () => {
        expect(requiredOrgIdForDocument({ kind: 'code-review-feedback', jobId: JOB_ID }, study)).toBe('do-org')
    })

    it('returns DO org for outputs-review-feedback', () => {
        expect(requiredOrgIdForDocument({ kind: 'outputs-review-feedback', jobId: JOB_ID }, study)).toBe('do-org')
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
            authenticate({ token: null, documentName: `review-feedback-${STUDY_ID}-v1` }, baseDeps()),
        ).rejects.toThrow(/missing token/)
    })

    it('rejects when verifyToken returns no subject', async () => {
        await expect(
            authenticate(
                { token: 'tok', documentName: `review-feedback-${STUDY_ID}-v1` },
                baseDeps({ verifyToken: async () => ({ sub: null }) }),
            ),
        ).rejects.toThrow(/no subject/)
    })

    it('rejects when verifyToken throws (invalid signature / expired)', async () => {
        await expect(
            authenticate(
                { token: 'tok', documentName: `review-feedback-${STUDY_ID}-v1` },
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
            authenticate({ token: 'tok', documentName: `review-feedback-${STUDY_ID}-v1` }, baseDeps({ db })),
        ).rejects.toThrow(/user not provisioned/)
    })

    it('rejects when study is not found', async () => {
        const db = dbFromScripts(async (text) => {
            if (text.includes('FROM "user"')) return { rows: [{ id: 'user-1' }], rowCount: 1 }
            if (text.includes('FROM study')) return { rows: [], rowCount: 0 }
            return { rows: [], rowCount: 0 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `review-feedback-${STUDY_ID}-v1` }, baseDeps({ db })),
        ).rejects.toThrow(/study not found/)
    })

    it('rejects a lab member trying to open a review-feedback document (cross-org)', async () => {
        const queries: Array<{ text: string; values?: unknown[] }> = []
        const db = dbFromScripts(async (text, values) => {
            queries.push({ text, values })
            if (text.includes('FROM "user"')) return { rows: [{ id: 'lab-user' }], rowCount: 1 }
            if (text.includes('FROM study'))
                return {
                    rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org', status: 'DRAFT' }],
                    rowCount: 1,
                }
            // membership check: user is in lab-org, but review-feedback requires do-org
            return { rows: [], rowCount: 0 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `review-feedback-${STUDY_ID}-v1` }, baseDeps({ db })),
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
                return {
                    rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org', status: 'DRAFT' }],
                    rowCount: 1,
                }
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
                return {
                    rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org', status: 'DRAFT' }],
                    rowCount: 1,
                }
            return { rows: [{}], rowCount: 1 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `proposal-${STUDY_ID}-fields` }, baseDeps({ db })),
        ).resolves.toEqual({ user: { id: 'lab-user', clerkId: 'clerk-user-1' }, studyId: STUDY_ID })
    })

    it('passes a DO member opening their DO review-feedback document', async () => {
        const db = dbFromScripts(async (text) => {
            if (text.includes('FROM "user"')) return { rows: [{ id: 'do-user' }], rowCount: 1 }
            if (text.includes('FROM study WHERE'))
                return {
                    rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org', status: 'PENDING-REVIEW' }],
                    rowCount: 1,
                }
            return { rows: [{}], rowCount: 1 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `review-feedback-${STUDY_ID}-v1` }, baseDeps({ db })),
        ).resolves.toEqual({ user: { id: 'do-user', clerkId: 'clerk-user-1' }, studyId: STUDY_ID })
    })

    it('passes a safe-insights admin opening any document', async () => {
        const db = dbFromScripts(async (text) => {
            if (text.includes('FROM "user"')) return { rows: [{ id: 'admin-user' }], rowCount: 1 }
            if (text.includes('FROM study'))
                return {
                    rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org', status: 'DRAFT' }],
                    rowCount: 1,
                }
            return { rows: [{}], rowCount: 1 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `proposal-${STUDY_ID}-research-questions` }, baseDeps({ db })),
        ).resolves.toEqual({ user: { id: 'admin-user', clerkId: 'clerk-user-1' }, studyId: STUDY_ID })
    })

    it('forwards authorizedParties only when non-empty', async () => {
        const verifyToken = vi.fn(async () => ({ sub: 'u' }))
        const db = dbFromScripts(async (text) => {
            if (text.includes('FROM "user"')) return { rows: [{ id: 'u' }], rowCount: 1 }
            if (text.includes('FROM study WHERE'))
                return {
                    rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org', status: 'PENDING-REVIEW' }],
                    rowCount: 1,
                }
            return { rows: [{}], rowCount: 1 }
        })

        await authenticate(
            { token: 'tok', documentName: `review-feedback-${STUDY_ID}-v1` },
            baseDeps({ db, verifyToken, authorizedParties: [] }),
        )
        expect(verifyToken).toHaveBeenCalledWith('tok', expect.objectContaining({ authorizedParties: undefined }))

        verifyToken.mockClear()
        await authenticate(
            { token: 'tok', documentName: `review-feedback-${STUDY_ID}-v1` },
            baseDeps({ db, verifyToken, authorizedParties: ['https://app.example'] }),
        )
        expect(verifyToken).toHaveBeenCalledWith(
            'tok',
            expect.objectContaining({ authorizedParties: ['https://app.example'] }),
        )
    })

    it('rejects a proposal-fields connection when the study has been submitted', async () => {
        const db = dbFromScripts(async (text) => {
            if (text.includes('FROM "user"')) return { rows: [{ id: 'lab-user' }], rowCount: 1 }
            if (text.includes('FROM study'))
                return {
                    rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org', status: 'PENDING-REVIEW' }],
                    rowCount: 1,
                }
            return { rows: [{}], rowCount: 1 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `proposal-${STUDY_ID}-fields` }, baseDeps({ db })),
        ).rejects.toThrow(/study is not editable.*PENDING-REVIEW/)
    })

    it('rejects a review-feedback connection after the study has been decided', async () => {
        const db = dbFromScripts(async (text) => {
            if (text.includes('FROM "user"')) return { rows: [{ id: 'do-user' }], rowCount: 1 }
            if (text.includes('FROM study'))
                return {
                    rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org', status: 'APPROVED' }],
                    rowCount: 1,
                }
            return { rows: [{}], rowCount: 1 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `review-feedback-${STUDY_ID}-v1` }, baseDeps({ db })),
        ).rejects.toThrow(/study is not editable.*APPROVED/)
    })

    it('passes a DO member opening a code-review-feedback document with a valid jobId', async () => {
        const db = dbFromScripts(async (text) => {
            if (text.includes('FROM "user"')) return { rows: [{ id: 'do-user' }], rowCount: 1 }
            if (text.includes('FROM study_job')) return { rows: [{ study_id: STUDY_ID }], rowCount: 1 }
            if (text.includes('FROM study'))
                return {
                    rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org', status: 'PENDING-REVIEW' }],
                    rowCount: 1,
                }
            return { rows: [{}], rowCount: 1 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `code-review-feedback-${JOB_ID}` }, baseDeps({ db })),
        ).resolves.toEqual({ user: { id: 'do-user', clerkId: 'clerk-user-1' }, studyId: STUDY_ID })
    })

    it('resolves the studyId through study_job for an outputs-review-feedback document', async () => {
        const db = dbFromScripts(async (text) => {
            if (text.includes('FROM "user"')) return { rows: [{ id: 'do-user' }], rowCount: 1 }
            if (text.includes('FROM study_job')) return { rows: [{ study_id: STUDY_ID }], rowCount: 1 }
            if (text.includes('FROM study'))
                return {
                    rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org', status: 'APPROVED' }],
                    rowCount: 1,
                }
            return { rows: [{}], rowCount: 1 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `outputs-review-feedback-${JOB_ID}` }, baseDeps({ db })),
        ).resolves.toEqual({ user: { id: 'do-user', clerkId: 'clerk-user-1' }, studyId: STUDY_ID })
    })

    it('rejects a code-review-feedback connection when the study_job row does not exist', async () => {
        const db = dbFromScripts(async (text) => {
            if (text.includes('FROM "user"')) return { rows: [{ id: 'do-user' }], rowCount: 1 }
            if (text.includes('FROM study_job')) return { rows: [], rowCount: 0 }
            return { rows: [], rowCount: 0 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `code-review-feedback-${JOB_ID}` }, baseDeps({ db })),
        ).rejects.toMatchObject({ code: 'STUDY_NOT_FOUND', message: expect.stringMatching(/study_job not found/) })
    })

    it('accepts a code-review-feedback connection regardless of latest job status (editor is not the enforcer)', async () => {
        // Whereas v1 rejected post-review job statuses here, v3 delegates code-review
        // versioning to the management-app action layer. The editor only gates on
        // org membership.
        const db = dbFromScripts(async (text) => {
            if (text.includes('FROM "user"')) return { rows: [{ id: 'do-user' }], rowCount: 1 }
            if (text.includes('FROM study_job')) return { rows: [{ study_id: STUDY_ID }], rowCount: 1 }
            if (text.includes('FROM study'))
                return {
                    rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org', status: 'APPROVED' }],
                    rowCount: 1,
                }
            return { rows: [{}], rowCount: 1 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `code-review-feedback-${JOB_ID}` }, baseDeps({ db })),
        ).resolves.toEqual({ user: { id: 'do-user', clerkId: 'clerk-user-1' }, studyId: STUDY_ID })
    })

    it('rejects a lab member trying to open a code-review-feedback document (cross-org)', async () => {
        const queries: Array<{ text: string; values?: unknown[] }> = []
        const db = dbFromScripts(async (text, values) => {
            queries.push({ text, values })
            if (text.includes('FROM "user"')) return { rows: [{ id: 'lab-user' }], rowCount: 1 }
            if (text.includes('FROM study_job')) return { rows: [{ study_id: STUDY_ID }], rowCount: 1 }
            if (text.includes('FROM study'))
                return {
                    rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org', status: 'PENDING-REVIEW' }],
                    rowCount: 1,
                }
            return { rows: [], rowCount: 0 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `code-review-feedback-${JOB_ID}` }, baseDeps({ db })),
        ).rejects.toThrow(/no membership/)
        const membershipQuery = queries.find((q) => q.text.includes('FROM org_user'))
        expect(membershipQuery?.values?.[2]).toBe('do-org')
    })

    it('throws AuthFailureError with stable codes the client can dispatch on', async () => {
        // Sanity-check a couple of representative codes; the wire format is `CODE: message`.
        await expect(
            authenticate({ token: null, documentName: `review-feedback-${STUDY_ID}-v1` }, baseDeps()),
        ).rejects.toMatchObject({ code: 'MISSING_TOKEN', message: expect.stringMatching(/^MISSING_TOKEN: /) })

        const db = dbFromScripts(async (text) => {
            if (text.includes('FROM "user"')) return { rows: [{ id: 'lab-user' }], rowCount: 1 }
            if (text.includes('FROM study'))
                return {
                    rows: [{ org_id: 'do-org', submitted_by_org_id: 'lab-org', status: 'PENDING-REVIEW' }],
                    rowCount: 1,
                }
            return { rows: [{}], rowCount: 1 }
        })
        await expect(
            authenticate({ token: 'tok', documentName: `proposal-${STUDY_ID}-fields` }, baseDeps({ db })),
        ).rejects.toMatchObject({
            code: 'STUDY_NOT_EDITABLE',
            message: expect.stringMatching(/^STUDY_NOT_EDITABLE: /),
        })
    })

    it('AuthFailureError instances carry name, code, and reason', () => {
        const err = new AuthFailureError('NO_MEMBERSHIP', 'no membership in study orgs')
        expect(err).toBeInstanceOf(Error)
        expect(err.name).toBe('AuthFailureError')
        expect(err.code).toBe('NO_MEMBERSHIP')
        expect(err.message).toBe('NO_MEMBERSHIP: no membership in study orgs')
        // Hocuspocus forwards `err.reason` to the client; without this Hocuspocus
        // falls back to the literal string "permission-denied" and the client
        // loses the specific code.
        expect(err.reason).toBe('NO_MEMBERSHIP: no membership in study orgs')
    })
})

describe('isDocumentEditable', () => {
    it('allows proposal kinds while DRAFT or CHANGE-REQUESTED', () => {
        for (const status of ['DRAFT', 'CHANGE-REQUESTED'] as const) {
            expect(isDocumentEditable({ kind: 'proposal-fields', studyId: STUDY_ID }, { status })).toBe(true)
            expect(isDocumentEditable({ kind: 'proposal-text', studyId: STUDY_ID, slug: 'impact' }, { status })).toBe(
                true,
            )
        }
    })

    it('blocks proposal kinds once submitted', () => {
        expect(isDocumentEditable({ kind: 'proposal-fields', studyId: STUDY_ID }, { status: 'PENDING-REVIEW' })).toBe(
            false,
        )
    })

    it('allows review-feedback only while PENDING-REVIEW', () => {
        expect(
            isDocumentEditable(
                { kind: 'review-feedback', studyId: STUDY_ID, version: 1 },
                { status: 'PENDING-REVIEW' },
            ),
        ).toBe(true)
        for (const status of ['APPROVED', 'CHANGE-REQUESTED', 'REJECTED'] as const) {
            expect(isDocumentEditable({ kind: 'review-feedback', studyId: STUDY_ID, version: 1 }, { status })).toBe(
                false,
            )
        }
    })

    it('allows the resubmission note only while CHANGE-REQUESTED (no note exists during DRAFT)', () => {
        const parsed = { kind: 'proposal-resubmission-note', studyId: STUDY_ID, version: 2 } as const
        expect(isDocumentEditable(parsed, { status: 'CHANGE-REQUESTED' })).toBe(true)
        for (const status of ['DRAFT', 'PENDING-REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED'] as const) {
            expect(isDocumentEditable(parsed, { status })).toBe(false)
        }
    })

    it('always allows code-review-feedback regardless of study status (editor is not the enforcer)', () => {
        for (const status of ['DRAFT', 'PENDING-REVIEW', 'APPROVED', 'CHANGE-REQUESTED', 'REJECTED'] as const) {
            expect(isDocumentEditable({ kind: 'code-review-feedback', jobId: JOB_ID }, { status })).toBe(true)
        }
    })

    // Same exemption, same reason: the one-decision-per-round guard for outputs feedback is the
    // study_review_comment unique constraint, not this gate.
    it('always allows outputs-review-feedback regardless of study status', () => {
        for (const status of ['DRAFT', 'PENDING-REVIEW', 'APPROVED', 'CHANGE-REQUESTED', 'REJECTED'] as const) {
            expect(isDocumentEditable({ kind: 'outputs-review-feedback', jobId: JOB_ID }, { status })).toBe(true)
        }
    })
})

describe('hasFilesDecision', () => {
    const fakeDb = (rows: Array<{ status: string }>): DbQuery => ({
        query: (async () => ({ rows, rowCount: rows.length })) as DbQuery['query'],
    })

    it('is false while the job has no closing status row', async () => {
        await expect(hasFilesDecision(JOB_ID, fakeDb([]))).resolves.toBe(false)
    })

    it('is true once a closing status row exists', async () => {
        await expect(hasFilesDecision(JOB_ID, fakeDb([{ status: 'FILES-APPROVED' }]))).resolves.toBe(true)
    })

    it('asks for the shared round-closing statuses', async () => {
        const query = vi.fn(async () => ({ rows: [], rowCount: 0 }))
        await hasFilesDecision(JOB_ID, { query } as unknown as DbQuery)
        expect(query).toHaveBeenCalledWith(expect.stringContaining('ANY($2)'), [
            JOB_ID,
            [...ROUND_CLOSING_JOB_STATUSES],
        ])
    })
})

describe('shouldPersistDocument', () => {
    const fakeDb = (rows: Array<{ status: string }>): DbQuery => ({
        query: (async () => ({ rows, rowCount: rows.length })) as DbQuery['query'],
    })

    it('never persists a code-submission document', async () => {
        await expect(
            shouldPersistDocument({ kind: 'code-submission', studyId: STUDY_ID }, fakeDb([{ status: 'APPROVED' }])),
        ).resolves.toBe(false)
    })

    it('allows persistence for proposal-fields when study is DRAFT', async () => {
        await expect(
            shouldPersistDocument({ kind: 'proposal-fields', studyId: STUDY_ID }, fakeDb([{ status: 'DRAFT' }])),
        ).resolves.toBe(true)
    })

    it('allows persistence for proposal-fields when study is CHANGE-REQUESTED', async () => {
        await expect(
            shouldPersistDocument(
                { kind: 'proposal-fields', studyId: STUDY_ID },
                fakeDb([{ status: 'CHANGE-REQUESTED' }]),
            ),
        ).resolves.toBe(true)
    })

    it('blocks persistence for proposal-fields after status flips to PENDING-REVIEW', async () => {
        await expect(
            shouldPersistDocument(
                { kind: 'proposal-fields', studyId: STUDY_ID },
                fakeDb([{ status: 'PENDING-REVIEW' }]),
            ),
        ).resolves.toBe(false)
    })

    it('allows persistence for review-feedback when status is PENDING-REVIEW', async () => {
        await expect(
            shouldPersistDocument(
                { kind: 'review-feedback', studyId: STUDY_ID, version: 1 },
                fakeDb([{ status: 'PENDING-REVIEW' }]),
            ),
        ).resolves.toBe(true)
    })

    it('blocks persistence for review-feedback once a decision is recorded', async () => {
        for (const status of ['APPROVED', 'CHANGE-REQUESTED', 'REJECTED', 'ARCHIVED'] as const) {
            await expect(
                shouldPersistDocument({ kind: 'review-feedback', studyId: STUDY_ID, version: 1 }, fakeDb([{ status }])),
            ).resolves.toBe(false)
        }
    })

    it('blocks persistence when the study row has been deleted', async () => {
        await expect(
            shouldPersistDocument({ kind: 'proposal-text', studyId: STUDY_ID, slug: 'impact' }, fakeDb([])),
        ).resolves.toBe(false)
    })

    it('always allows code-review-feedback persistence without touching the DB (editor is not the enforcer)', async () => {
        const query = vi.fn()
        const db: DbQuery = { query: query as unknown as DbQuery['query'] }
        await expect(shouldPersistDocument({ kind: 'code-review-feedback', jobId: JOB_ID }, db)).resolves.toBe(true)
        expect(query).not.toHaveBeenCalled()
    })

    // Deleting the draft on submit is only half the guard: without this gate an already-connected
    // tab would persist the document again a moment later and resurrect feedback for a decision
    // that is final.
    it('allows outputs-review-feedback persistence while the job has no files decision', async () => {
        await expect(
            shouldPersistDocument({ kind: 'outputs-review-feedback', jobId: JOB_ID }, fakeDb([])),
        ).resolves.toBe(true)
    })

    it('blocks outputs-review-feedback persistence once a files decision is recorded', async () => {
        await expect(
            shouldPersistDocument({ kind: 'outputs-review-feedback', jobId: JOB_ID }, fakeDb([{ status: 'x' }])),
        ).resolves.toBe(false)
    })
})

describe('study-events documents', () => {
    const doc = `study-events-${STUDY_ID}`
    const study = (status: string) => ({ org_id: 'do-org', submitted_by_org_id: 'lab-org', status })

    // Answers the membership query with whether the user's org is among the allowed ones.
    const depsFor = (userOrgId: string, status: string, isSiAdmin = false) => {
        const queries: Array<{ text: string; values?: unknown[] }> = []
        const db = dbFromScripts(async (text, values) => {
            queries.push({ text, values })
            if (text.includes('FROM "user"')) return { rows: [{ id: 'user-1' }], rowCount: 1 }
            if (text.includes('FROM study')) return { rows: [study(status)], rowCount: 1 }
            const allowed = (values?.[2] as string[]).includes(userOrgId)
            return allowed || isSiAdmin ? { rows: [{}], rowCount: 1 } : { rows: [], rowCount: 0 }
        })
        return { deps: baseDeps({ db }), queries }
    }

    it('parses the per-study events document', () => {
        expect(parseDocumentName(doc)).toEqual({ kind: 'study-events', studyId: STUDY_ID })
        expect(parseDocumentName('study-events-not-a-uuid')).toBeNull()
    })

    it('admits a lab member on a draft study', async () => {
        const { deps, queries } = depsFor('lab-org', 'DRAFT')
        await expect(authenticate({ token: 'tok', documentName: doc }, deps)).resolves.toMatchObject({
            studyId: STUDY_ID,
        })
        expect(queries.find((q) => q.text.includes('FROM org_user'))?.text).toContain('ANY($3)')
    })

    it('refuses an enclave member on a draft study', async () => {
        const { deps } = depsFor('do-org', 'DRAFT')
        await expect(authenticate({ token: 'tok', documentName: doc }, deps)).rejects.toThrow(/no membership/)
    })

    it.each(['PENDING-REVIEW', 'CHANGE-REQUESTED', 'APPROVED', 'REJECTED', 'ARCHIVED'])(
        'admits an enclave member on a %s study',
        async (status) => {
            const { deps } = depsFor('do-org', status)
            await expect(authenticate({ token: 'tok', documentName: doc }, deps)).resolves.toBeDefined()
        },
    )

    it('refuses a member of neither org', async () => {
        const { deps } = depsFor('other-org', 'APPROVED')
        await expect(authenticate({ token: 'tok', documentName: doc }, deps)).rejects.toThrow(/no membership/)
    })

    it('admits an SI admin through the admin bypass', async () => {
        const { deps } = depsFor('safe-insights-org', 'DRAFT', true)
        await expect(authenticate({ token: 'tok', documentName: doc }, deps)).resolves.toBeDefined()
    })

    it('lists the enclave org only for a submitted study', () => {
        expect(studyEventsOrgIds({ org_id: 'do-org', submitted_by_org_id: 'lab-org', status: 'DRAFT' })).toEqual([
            'lab-org',
        ])
        expect(studyEventsOrgIds({ org_id: 'do-org', submitted_by_org_id: 'lab-org', status: 'APPROVED' })).toEqual([
            'lab-org',
            'do-org',
        ])
    })

    it('is never editable-gated, never persisted and read-only', async () => {
        const parsed: ParsedDocumentName = { kind: 'study-events', studyId: STUDY_ID }
        const db = { query: vi.fn() } as unknown as DbQuery
        expect(isDocumentEditable(parsed, { status: 'ARCHIVED' })).toBe(true)
        expect(await shouldPersistDocument(parsed, db)).toBe(false)
        expect(db.query).not.toHaveBeenCalled()
        expect(isReadOnlyDocument(parsed)).toBe(true)
    })

    it.each<ParsedDocumentName>([
        { kind: 'review-feedback', studyId: STUDY_ID, version: 1 },
        { kind: 'code-review-feedback', jobId: JOB_ID },
        { kind: 'outputs-review-feedback', jobId: JOB_ID },
        { kind: 'proposal-fields', studyId: STUDY_ID },
        { kind: 'proposal-text', studyId: STUDY_ID, slug: 'impact' },
        { kind: 'proposal-resubmission-note', studyId: STUDY_ID, version: 1 },
        { kind: 'code-submission', studyId: STUDY_ID },
    ])('leaves a $kind document writable', (parsed) => {
        expect(isReadOnlyDocument(parsed)).toBe(false)
    })
})
