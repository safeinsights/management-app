// Helpers that combine DB fixture setup with server action calls.
// These live in a separate file (not unit.helpers.tsx) because unit.helpers is
// imported by vitest.setup.ts. Top-level imports of server action modules there
// would load the entire server module graph (events, mailer, aws, config) during
// setup, breaking test-file-level vi.mock() calls for those modules.
import { actionResult } from '@/lib/utils'
import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import { insertTestStudyJobData, insertTestStudyOnly, mockSessionWithTestData } from '@/tests/unit.helpers'

export type { SelectedStudy }

export async function setupStudyAction({
    orgSlug,
    orgType,
    createJob = true,
}: {
    orgSlug?: string
    orgType?: 'enclave' | 'lab'
    createJob?: boolean
} = {}) {
    const { org, user } = await mockSessionWithTestData({ orgSlug, orgType })
    if (createJob) {
        const { study: dbStudy, latestJobWithStatus } = await insertTestStudyJobData({ org, researcherId: user.id })
        const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        return { org, user, study, latestJob: latestJobWithStatus }
    }
    const { study: dbStudy } = await insertTestStudyOnly({ org, researcherId: user.id })
    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    return { org, user, study, latestJob: null }
}
