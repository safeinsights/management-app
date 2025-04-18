import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Member } from '@/schema/member'

import {
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    readTestSupportFile,
} from '@/tests/unit.helpers'
import { fireEvent, waitFor } from '@testing-library/react'

import { screen } from '@testing-library/react'
import { StudyResults } from './study-results'
import { fetchJobResultsEncryptedZipAction } from '@/server/actions/study-job.actions'
import { ResultsWriter } from 'si-encryption/job-results/writer'

import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import { StudyJobStatus, StudyStatus } from '@/database/types'

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchJobResultsCsvAction: vi.fn(() => 'Results\n42'),

    fetchJobResultsEncryptedZipAction: vi.fn(() => 'Encrypted Results'),
}))

describe('View Study Results', () => {
    let member: Member

    beforeEach(async () => {
        const resp = await mockSessionWithTestData()
        member = resp.member
    })

    const insertAndRender = async (studyStatus: StudyStatus, jobStatus: StudyJobStatus, fingerPrint = '1234') => {
        const { member } = await mockSessionWithTestData()
        const { latestJobithStatus: job } = await insertTestStudyJobData({ member, studyStatus, jobStatus })
        const helpers = renderWithProviders(<StudyResults job={job} fingerprint={fingerPrint} />)
        return { ...helpers, job, member }
    }

    it('shows appropriate message when user has no fingerprint', async () => {
        await insertAndRender('PENDING-REVIEW', 'RUN-COMPLETE', '')
        expect(screen.queryByText('You cannot view results without a private key')).toBeDefined()
    })

    it('shows empty results state when no job exists', async () => {
        renderWithProviders(<StudyResults job={null} fingerprint="asdf" />)
        expect(screen.queryByText('Study results are not available yet')).toBeDefined()
    })

    it('shows results rejected state', async () => {
        await insertAndRender('PENDING-REVIEW', 'RESULTS-REJECTED')
        expect(screen.queryByText('Latest results rejected')).toBeDefined()
    })

    it('renders the results if the job has been approved', async () => {
        await insertAndRender('APPROVED', 'RESULTS-APPROVED')
        await waitFor(() => {
            expect(screen.getByRole('link', { name: /Download/i })).toBeDefined()
        })
    })

    it('renders the form to unlock results', async () => {
        await insertAndRender('PENDING-REVIEW', 'RUN-COMPLETE')
        expect(screen.queryByText('Latest results rejected')).toBeDefined()
    })

    it('decrypts and displays the results', async () => {
        const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
        const fingerprint = await fingerprintKeyData(publicKey)
        const writer = new ResultsWriter([{ publicKey, fingerprint }])
        const csv = 'hello world this is a CSV'
        const csvBlob = Buffer.from(`title\n${csv}`, 'utf-8')
        await writer.addFile('test.data', csvBlob.buffer)
        const zip = await writer.generate()

        vi.mocked(fetchJobResultsEncryptedZipAction).mockResolvedValue(zip)

        const { latestJobithStatus: job } = await insertTestStudyJobData({
            member,
            jobStatus: 'RUN-COMPLETE',
        })
        renderWithProviders(<StudyResults job={job} fingerprint="asdf" />)

        const input = screen.getByPlaceholderText('Enter private key')

        const privateKey = await readTestSupportFile('private_key.pem')
        fireEvent.change(input, { target: { value: privateKey } })
        fireEvent.click(screen.getByRole('button', { name: /View Results/i }))

        await waitFor(() => {
            expect(screen.getByText(RegExp(csv))).toBeDefined()
            fireEvent.click(screen.getByRole('button', { name: /Download/i }))
        })
    })
})
