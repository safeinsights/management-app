import { beforeEach, describe, expect, it } from 'vitest'
import {
    faker,
    fireEvent,
    insertTestStudyJobData,
    mockSessionWithTestData,
    readTestSupportFile,
    renderWithProviders,
    screen,
    waitFor,
    within,
} from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/lexical'
import { type Org } from '@/schema/org'
import { latestJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
import { seedEncryptedArtifact } from '@/tests/artifact.helpers'
import { type CodeRunFeedbackRow } from './code-run-feedback'
import { DecryptAndViewOutputs } from './decrypt-and-view-outputs'

const feedbackRow = (text: string): CodeRunFeedbackRow => ({
    id: faker.string.uuid(),
    body: JSON.parse(lexicalJson(text)),
    createdAt: new Date('2026-03-05T12:00:00Z'),
    round: 1,
    authorName: 'Jessica Walters',
})

describe('DecryptAndViewOutputs', () => {
    let org: Org
    let job: NonNullable<LatestJobForStudy>

    const renderView = ({
        hasDecryptableOutputs = true,
        latestFeedback = [] as CodeRunFeedbackRow[],
        feedbackLoadError = false,
    } = {}) =>
        renderWithProviders(
            <DecryptAndViewOutputs
                job={job}
                priorRuns={[]}
                hasDecryptableOutputs={hasDecryptableOutputs}
                latestFeedback={latestFeedback}
                feedbackLoadError={feedbackLoadError}
            />,
        )

    beforeEach(async () => {
        const resp = await mockSessionWithTestData()
        org = resp.org
        const { study } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        job = (await latestJobForStudy(study.id))!

        await seedEncryptedArtifact(job.id, {
            fileType: 'ENCRYPTED-RESULT',
            files: [{ name: 'summary.csv', content: 'a,b\n1,2' }],
        })
    })

    it('renders the code run key form with the view-again copy', async () => {
        renderView()

        await screen.findByRole('button', { name: 'View files' })

        expect(screen.getByRole('heading', { name: /^code run /i })).toBeInTheDocument()
        expect(
            screen.getByText('The outputs are encrypted. Enter your security key to view them again.'),
        ).toBeInTheDocument()
        expect(screen.queryByTestId('code-run-outputs')).not.toBeInTheDocument()
    })

    it('puts the latest run feedback inside the code run card, below the output files', async () => {
        renderView({ latestFeedback: [feedbackRow('Run 2 outputs are clean.')] })

        await screen.findByRole('button', { name: 'View files' })

        const card = screen.getByTestId('code-run-card')
        const feedback = within(card).getByTestId('latest-run-feedback')
        expect(feedback).toHaveTextContent('Reviewer feedback (v1.0)')
        expect(await within(feedback).findByText('Run 2 outputs are clean.')).toBeInTheDocument()
        const keyForm = within(card).getByTestId('security-key-form')
        expect(keyForm.compareDocumentPosition(feedback) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    // Otherwise a run with nothing to decrypt asks for a key that could never open anything
    // (OTTER-524). The card stays, so the feedback is not hidden with the key form.
    it('keeps the card and its feedback but no key form when the job holds no artifact a key could open', async () => {
        renderView({ hasDecryptableOutputs: false, latestFeedback: [feedbackRow('Nothing to share.')] })

        expect(screen.getByRole('heading', { name: /^code run /i })).toBeInTheDocument()
        expect(screen.queryByTestId('security-key-form')).not.toBeInTheDocument()
        expect(await screen.findByText('Nothing to share.')).toBeInTheDocument()
    })

    it('says so when no feedback was recorded for the latest run', () => {
        renderView()

        expect(screen.getByTestId('latest-run-feedback')).toHaveTextContent('No feedback was shared for this run.')
    })

    it('shows a load error in place of the feedback when it could not be loaded', () => {
        renderView({ feedbackLoadError: true })

        expect(
            within(screen.getByTestId('code-run-card')).getByText('Feedback could not be loaded'),
        ).toBeInTheDocument()
    })

    it('keeps the card header and feedback and shows the output files table after a successful decrypt', async () => {
        const privateKeyPem = await readTestSupportFile('private_key.pem')
        renderView({ latestFeedback: [feedbackRow('Run 2 outputs are clean.')] })

        await screen.findByRole('button', { name: 'View files' })
        // The read-only feedback editor is a textbox too.
        fireEvent.change(within(screen.getByTestId('security-key-form')).getByRole('textbox'), {
            target: { value: privateKeyPem },
        })
        fireEvent.click(screen.getByRole('button', { name: 'View files' }))

        const card = screen.getByTestId('code-run-card')
        await waitFor(() => {
            expect(within(card).getByTestId('code-run-outputs')).toBeInTheDocument()
        })
        expect(within(card).getByRole('heading', { name: /^code run /i })).toBeInTheDocument()
        expect(screen.queryByTestId('security-key-form')).not.toBeInTheDocument()
        expect(within(card).getByText('summary.csv')).toBeInTheDocument()
        expect(within(card).getByText('Run 2 outputs are clean.')).toBeInTheDocument()
        expect(screen.getByText('Output files')).toHaveFocus()
        expect(await screen.findByText('Outputs decrypted.')).toBeInTheDocument()
    })
})
