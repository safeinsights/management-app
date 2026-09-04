import type { Route } from 'next'
import { notFound } from 'next/navigation'
import { Box, Stack } from '@mantine/core'
import { SharedOutputsPanel } from '@/components/study/shared-outputs-panel'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { Routes } from '@/lib/routes'
import {
    isErroredOutputsSharedOutcome,
    isOutputsSharedOutcome,
    type ScreenId,
    type StudyState,
} from '@/lib/study-screen'
import { guardOutputsFeedbackScreen } from './outputs-feedback-guard'
import type { ScreenComponentProps } from './types'

type ShareScreenId = Extract<ScreenId, 'outputs-shared' | 'outputs-errored-shared'>

type ShareScreenConfig = {
    /** This screen's routing rule, re-checked by the guard so rendering cannot disagree with it. */
    matches: (state: StudyState) => boolean
    lockedBanner: { title: string; body: (dataPartner: string) => string }
}

/**
 * The reviewer released the outputs with "Share outputs and feedback". The researcher decrypts,
 * reads the outputs and feedback, then either resubmits or leaves.
 *
 * Two screens, one component, keyed by the screen the rule table picked — the same shape
 * `CodeDecisionScreen` uses for `code-approved`/`code-feedback`. They diverge only in the routing
 * predicate and the locked-phase copy; the unlocked banner below is shared outright, because both
 * phases end in the same place once the key has done its job.
 *
 * The third outcome, withheld outputs, is `outputs-feedback` (OTTER-695/697) and shows no key form
 * at all, so it is a genuinely different screen rather than a third entry here.
 */
const SHARE_SCREENS = {
    // OTTER-688: a clean run (RUN-COMPLETE + FILES-APPROVED, no JOB-ERRORED).
    'outputs-shared': {
        matches: isOutputsSharedOutcome,
        lockedBanner: {
            title: 'Decrypt to view your outputs',
            body: (dataPartner) =>
                `${dataPartner} has reviewed and shared the outputs. Use your security key to decrypt and review them.`,
        },
    },
    // OTTER-696: an errored run (JOB-ERRORED + FILES-APPROVED) the researcher decrypts to diagnose.
    'outputs-errored-shared': {
        matches: isErroredOutputsSharedOutcome,
        lockedBanner: {
            title: 'Decrypt outputs to view code error',
            body: (dataPartner) =>
                `${dataPartner} has shared the outputs and feedback. Enter your security key below to decrypt and diagnose the issue.`,
        },
    },
} as const satisfies Record<ShareScreenId, ShareScreenConfig>

const isShareScreen = (screen: ScreenId): screen is ShareScreenId => screen in SHARE_SCREENS

// Same state, same guard, both screens — so it lives here for the same reason UNLOCKED_BANNER does:
// per-entry copies are two places to edit and one drift away from disagreeing.
const NOT_FOUND = { title: 'Outputs not found', message: 'This study has no shared outputs to display yet.' }

// Identical for both screens, so it lives here rather than in each entry above: duplicating it into
// the config would preserve exactly the drift this consolidation removes.
const UNLOCKED_BANNER = {
    title: 'Outputs and feedback available',
    body: "Review the outputs and feedback below. If they don't meet your expectations, you can update your code and resubmit.",
}

export async function SharedOutputsScreen({
    descriptor,
    study,
    raw,
    orgSlug,
    dashboardHref,
    returnTo,
}: Pick<ScreenComponentProps, 'descriptor' | 'study' | 'raw' | 'orgSlug' | 'dashboardHref' | 'returnTo'>) {
    // A screen id routed here without a SHARE_SCREENS entry is a registry bug, not a data state, so
    // it 404s rather than reading `undefined.matches` a line later. Narrowing the prop to
    // ShareScreenId instead would be stricter but does not compile: SCREEN_COMPONENTS is typed
    // Record<ScreenId, ScreenComponent>, and under strictFunctionTypes a component accepting fewer
    // ids is not assignable to one accepting all of them — both entries fail, not just a new third.
    if (!isShareScreen(descriptor.screen)) return notFound()
    const config = SHARE_SCREENS[descriptor.screen]

    const result = await guardOutputsFeedbackScreen({
        study,
        raw,
        matches: config.matches,
        notFound: NOT_FOUND,
        // The reviewer's decision, not the run: FILES-APPROVED is written when they submit it.
        decisionStatus: 'FILES-APPROVED',
    })
    if (!('job' in result)) return result

    const { job, entries, feedbackLoadError, dataPartner, decidedAt } = result

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader study={study} />
                {/* Banner titles are undated on purpose — the panel appends the shared decision date
                    to both, so the two phases can never disagree about when it was made. */}
                <SharedOutputsPanel
                    studyTitle={study.title}
                    decidedAt={decidedAt}
                    banner={{
                        locked: {
                            title: config.lockedBanner.title,
                            body: config.lockedBanner.body(dataPartner),
                        },
                        unlocked: UNLOCKED_BANNER,
                    }}
                    job={job}
                    feedbackSection={
                        <FeedbackAndNotesSection entries={entries} loadError={feedbackLoadError} alwaysExpandLatest />
                    }
                    previousHref={Routes.studyViewCode({ orgSlug, studyId: study.id, returnTo }) as Route}
                    editCodeHref={Routes.studyResubmit({ orgSlug, studyId: study.id }) as Route}
                    dashboardHref={dashboardHref}
                />
            </Stack>
        </Box>
    )
}
