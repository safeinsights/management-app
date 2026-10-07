import { describe, expect, it, mockStudyRow } from '@/tests/unit.helpers'
import type { StudyJobStatus, StudyStatus } from '@/database/types'
import { buildRowModel } from './row-model'
import type { Audience, StudyRow } from './types'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'
const ORG_SLUG = 'test-org'

const model = (overrides: Partial<StudyRow>, audience: Audience = 'researcher', userId = 'researcher-1') =>
    buildRowModel(mockStudyRow(overrides), audience, { orgSlug: ORG_SLUG, userId })

const changes = (...statuses: StudyJobStatus[]) => statuses.map((status) => ({ status, userId: null }))

describe('buildRowModel', () => {
    describe('title link', () => {
        it.each<[string, Partial<StudyRow>, string]>([
            ['a DRAFT to the Step 1 editor', { status: 'DRAFT' }, 'edit'],
            ['a Step 2 DRAFT to the proposal editor', { status: 'DRAFT', piUserId: 'pi-1' }, 'proposal'],
            [
                'a DRAFT with only a Step 2 document to the proposal editor',
                { status: 'DRAFT', hasStep2CollabDoc: true },
                'proposal',
            ],
            [
                'a PENDING-REVIEW study without jobs to the submitted page',
                { status: 'PENDING-REVIEW', jobStatusChanges: [] },
                'submitted',
            ],
            [
                'a CHANGE-REQUESTED study without jobs to the submitted page',
                { status: 'CHANGE-REQUESTED', jobStatusChanges: [] },
                'submitted',
            ],
            [
                'a PENDING-REVIEW study with job activity to the view page',
                { status: 'PENDING-REVIEW', jobStatusChanges: changes('CODE-SUBMITTED') },
                'view',
            ],
            [
                'an APPROVED study without jobs to the submitted page',
                { status: 'APPROVED', jobStatusChanges: [] },
                'submitted',
            ],
            [
                'an APPROVED study with only a baseline job to the code page',
                { status: 'APPROVED', jobStatusChanges: changes('INITIATED') },
                'code',
            ],
            [
                'an APPROVED study after code submission to the view page',
                { status: 'APPROVED', jobStatusChanges: changes('INITIATED', 'CODE-SUBMITTED') },
                'view',
            ],
        ])('links %s', (_, overrides, page) => {
            expect(model(overrides).href).toBe(`/${ORG_SLUG}/study/${STUDY_ID}/${page}`)
        })

        it('uses the submitting lab slug when the row carries one', () => {
            const row = model({ status: 'PENDING-REVIEW' as StudyStatus, submittedByOrgSlug: 'lab-org' })
            expect(row.href).toBe(`/lab-org/study/${STUDY_ID}/submitted`)
        })

        it('links reviewers to the review page of the study org', () => {
            expect(model({ orgSlug: 'review-org' }, 'reviewer').href).toBe(`/review-org/study/${STUDY_ID}/review`)
        })
    })

    it.each([null, '', '   '])('titles an untitled draft (%j) so its link has a name', (title) => {
        expect(model({ status: 'DRAFT', title }).title).toBe('Untitled study')
    })

    describe('draft bin', () => {
        it('shows only to the draft author', () => {
            expect(model({ status: 'DRAFT' }).canDeleteDraft).toBe(true)
            expect(model({ status: 'DRAFT' }, 'researcher', 'someone-else').canDeleteDraft).toBe(false)
            expect(model({ status: 'PENDING-REVIEW' }).canDeleteDraft).toBe(false)
            expect(model({ status: 'DRAFT' }, 'reviewer').canDeleteDraft).toBe(false)
        })
    })

    describe('columns', () => {
        it('shows Not submitted for a draft in Submitted to and Submitted by', () => {
            const row = model({ status: 'DRAFT', reviewingEnclaveName: 'OpenStax' })
            expect(row.submittedTo).toBeNull()
            expect(row.submittedBy.name).toBeNull()
            expect(row.submittedBy.lines).toEqual(['Proposal: Not submitted', 'Code: Not submitted'])
        })

        it('names the newer of the proposal and code submitters, with a fixed two-line tooltip', () => {
            const row = model({
                status: 'APPROVED',
                proposalAuditName: 'Avery',
                proposalAuditAt: new Date('2026-09-01'),
                codeSubmitterName: 'Blake',
                codeSubmittedAt: new Date('2026-09-05'),
            })
            expect(row.submittedBy.name).toBe('Blake')
            expect(row.submittedBy.lines).toEqual(['Proposal: Avery', 'Code: Blake'])
        })

        it('takes a later resubmission over the first proposal submission', () => {
            const row = model({
                status: 'PENDING-REVIEW',
                proposalAuditName: 'Avery',
                proposalAuditAt: new Date('2026-09-01'),
                proposalResubmitterName: 'Casey',
                proposalResubmittedAt: new Date('2026-09-03'),
            })
            expect(row.submittedBy.lines[0]).toBe('Proposal: Casey')
        })

        it('falls back to the creator for a submitted study with no submission record', () => {
            const row = model({ status: 'PENDING-REVIEW', createdBy: 'Researcher Name' })
            expect(row.submittedBy.name).toBe('Researcher Name')
        })

        it('names the newest decider with a fixed three-line tooltip', () => {
            const row = model(
                {
                    proposalReviewerName: 'Dana',
                    proposalReviewedAt: new Date('2026-09-01'),
                    codeReviewerName: 'Eli',
                    codeReviewedAt: new Date('2026-09-04'),
                },
                'reviewer',
            )
            expect(row.reviewedBy.name).toBe('Eli')
            expect(row.reviewedBy.lines).toEqual(['Proposal: Dana', 'Code: Eli', 'Outputs: Not reviewed'])
        })

        it('names the recorded reviewer of a proposal decided before per-stage decision records', () => {
            const row = model(
                { status: 'APPROVED', reviewerName: 'Fran', approvedAt: new Date('2026-08-01') },
                'reviewer',
            )
            expect(row.reviewedBy.name).toBe('Fran')
            expect(row.reviewedBy.lines).toEqual(['Proposal: Fran', 'Code: Not reviewed', 'Outputs: Not reviewed'])
        })

        it('does not credit the proposal to the recorded reviewer once a later decision overwrote it', () => {
            const row = model(
                {
                    reviewerName: 'Eli',
                    approvedAt: new Date('2026-08-01'),
                    codeReviewerName: 'Eli',
                    codeReviewedAt: new Date('2026-09-04'),
                },
                'reviewer',
            )
            expect(row.reviewedBy.name).toBe('Eli')
            expect(row.reviewedBy.lines[0]).toBe('Proposal: Not reviewed')
        })

        it('does not name a reviewer for an undecided proposal', () => {
            const row = model({ status: 'PENDING-REVIEW', reviewerName: 'Fran' }, 'reviewer')
            expect(row.reviewedBy.name).toBeNull()
        })

        it('reads Belongs to as the lab for researchers and the data partner for reviewers', () => {
            const overrides = { submittingLabName: 'Kinetic', orgName: 'OpenStax', submittedByOrgSlug: 'kinetic' }
            expect(model(overrides).belongsTo).toBe('Kinetic')
            expect(model(overrides, 'reviewer').belongsTo).toBe('OpenStax')
        })
    })

    describe('last activity', () => {
        it('takes the newest of the status time, the badge change and own edits', () => {
            const row = model({
                status: 'APPROVED',
                lastUpdatedAt: new Date('2026-09-01'),
                jobStatusChanges: [{ status: 'CODE-SUBMITTED', createdAt: '2026-09-02T00:00:00.000Z' }],
                ownEditsAt: new Date('2026-09-03'),
            })
            expect(row.lastActivityAt).toEqual(new Date('2026-09-03'))
        })
    })
})
