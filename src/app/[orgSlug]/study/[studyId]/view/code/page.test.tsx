import { describe, it, expect } from 'vitest'
import {
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
} from '@/tests/unit.helpers'
import { db } from '@/database'
import type { StudyJobStatus } from '@/database/types'
import StudyViewCode from './page'
import { CodePostDecisionView } from '../code-post-decision-view'

// OTTER-614: /view/code is the read-only code step — reachable from a results study (whose /view
// shows the results screen) and 404s for any study that hasn't reached the code stage.

const addJobStatus = async (studyId: string, status: StudyJobStatus) => {
    const job = await db.selectFrom('studyJob').select('id').where('studyId', '=', studyId).executeTakeFirstOrThrow()
    const last = await db
        .selectFrom('jobStatusChange')
        .select('createdAt')
        .where('studyJobId', '=', job.id)
        .orderBy('createdAt', 'desc')
        .executeTakeFirst()
    const base = last?.createdAt ? new Date(last.createdAt).getTime() : Date.now()
    await db
        .insertInto('jobStatusChange')
        .values({ status, studyJobId: job.id, createdAt: new Date(base + 1000) })
        .execute()
}

// A CODE-APPROVED study with the given trailing job statuses appended (execution/results substatuses).
const seedCodeStudy = async (statuses: StudyJobStatus[]) => {
    const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
    const { study, job } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        studyStatus: 'APPROVED',
        jobStatus: 'CODE-SUBMITTED',
    })
    await db
        .insertInto('studyJobFile')
        .values({
            studyJobId: job.id,
            name: 'main.R',
            path: `studies/${study.id}/${job.id}/main.R`,
            fileType: 'MAIN-CODE',
        })
        .execute()
    await addJobStatus(study.id, 'CODE-APPROVED')
    for (const status of statuses) await addJobStatus(study.id, status)
    return { org, study, job }
}

const seedResultsStudy = () => seedCodeStudy(['FILES-APPROVED'])

describe('StudyViewCode (/view/code)', () => {
    it('shows the approved-code page with a "Proceed to step 5" forward for a results study', async () => {
        const { org, study } = await seedResultsStudy()

        const page = await StudyViewCode({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({}),
        })

        expect(page?.type).toBe(CodePostDecisionView)
        // Forward goes to plain /view, which resolves to the results screen for a results study.
        expect(page?.props.resultsHref).toBe(`/${org.slug}/study/${study.id}/view`)

        renderWithProviders(page!)
        expect(screen.getByTestId('cta-proceed-to-results')).toHaveTextContent('Proceed to step 5')
        expect(screen.queryByTestId('cta-go-to-dashboard')).not.toBeInTheDocument()
    })

    it('threads returnTo=org onto the forward link and dashboardHref', async () => {
        const { org, study } = await seedResultsStudy()

        const page = await StudyViewCode({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ returnTo: 'org' }),
        })

        expect(page?.props.dashboardHref).toBe(`/${org.slug}/dashboard`)
        expect(page?.props.resultsHref).toBe(`/${org.slug}/study/${study.id}/view?returnTo=org`)
    })

    // OTTER-640: submitted code stays accessible behind the collapsed control while execution or an
    // unreviewed error is presented as "Code approved".
    it.each([
        ['the code is provisioning', ['JOB-PROVISIONING']],
        ['the code is packaging', ['JOB-PACKAGING']],
        ['the code is ready for the enclave', ['JOB-READY']],
        ['the code is running in the enclave', ['JOB-RUNNING']],
        [
            'the run errored after starting, before the reviewer recorded a files decision',
            ['JOB-RUNNING', 'JOB-ERRORED'],
        ],
        ['the run errored before any enclave execution, before a files decision', ['JOB-ERRORED']],
    ] as const)('shows the submitted-code control when %s', async (_description, statuses) => {
        const { org, study } = await seedCodeStudy([...statuses])

        const page = await StudyViewCode({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({}),
        })

        expect(page?.type).toBe(CodePostDecisionView)

        renderWithProviders(page!)
        const toggle = screen.getByTestId('study-code-toggle')
        expect(toggle).toHaveTextContent('View submitted study code')
        await userEvent.setup().click(toggle)
        expect(await screen.findByTestId('submitted-code-table')).toBeInTheDocument()
        expect(screen.getByText('main.R')).toBeInTheDocument()
    })

    it('shows a stable empty state when the submitted job has no code files', async () => {
        const { org, study, job } = await seedCodeStudy(['JOB-RUNNING'])
        await db.deleteFrom('studyJobFile').where('studyJobId', '=', job.id).execute()

        const page = await StudyViewCode({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({}),
        })

        renderWithProviders(page!)
        await userEvent.setup().click(screen.getByTestId('study-code-toggle'))
        expect(await screen.findByText('No code files were uploaded.')).toBeInTheDocument()
        expect(screen.queryByTestId('submitted-code-table')).not.toBeInTheDocument()
        expect(screen.getByTestId('study-code-toggle-collapse')).toHaveTextContent('Hide submitted study code')
    })

    it('404s for an APPROVED study that has not submitted code (cannot jump ahead)', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        await expect(
            StudyViewCode({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: Promise.resolve({}),
            }),
        ).rejects.toThrow()
    })
})
