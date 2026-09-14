import { notFound } from 'next/navigation'
import { Box, Stack } from '@mantine/core'
import { SharedOutputsPanel } from '@/components/study/shared-outputs-panel'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { researcherSharedOutputsBanner, type SharedOutputsScreenId } from '@/lib/study-banners'
import {
    isErroredOutputsSharedOutcome,
    isOutputsSharedOutcome,
    projectStudyState,
    resolvePhasedStepNav,
    type ScreenId,
    type StudyState,
} from '@/lib/study-screen'
import { guardOutputsFeedbackScreen } from './outputs-feedback-guard'
import type { ScreenComponentProps } from './types'

/**
 * The reviewer released the outputs with "Share outputs and feedback". The researcher decrypts,
 * reads the outputs and feedback, then either resubmits or leaves.
 *
 * Two screens, one component, keyed by the screen the rule table picked — the same shape
 * `CodeDecisionScreen` uses for `code-approved`/`code-feedback`. Routing (below), banner
 * (`researcherSharedOutputsBanner`), and phased nav are all keyed off that id.
 *
 * The third outcome, withheld outputs, is `outputs-feedback` (OTTER-695/697) and shows no key form
 * at all, so it is a genuinely different screen rather than a third entry here.
 */
const SHARE_SCREENS = {
    // OTTER-688: a clean run (RUN-COMPLETE + FILES-APPROVED, no JOB-ERRORED).
    'outputs-shared': isOutputsSharedOutcome,
    // OTTER-696 / OTTER-781: an errored run the researcher decrypts to diagnose, then resubmits.
    'outputs-errored-shared': isErroredOutputsSharedOutcome,
} as const satisfies Record<SharedOutputsScreenId, (state: StudyState) => boolean>

const isShareScreen = (screen: ScreenId): screen is SharedOutputsScreenId => screen in SHARE_SCREENS

const NOT_FOUND = { title: 'Outputs not found', message: 'This study has no shared outputs to display yet.' }

export async function SharedOutputsScreen({
    descriptor,
    study,
    raw,
    orgSlug,
    dashboardHref,
    returnTo,
}: Pick<ScreenComponentProps, 'descriptor' | 'study' | 'raw' | 'orgSlug' | 'dashboardHref' | 'returnTo'>) {
    // A screen id routed here without a SHARE_SCREENS entry is a registry bug, not a data state, so it
    // 404s rather than passing an undefined predicate to the guard. Narrowing the prop itself does not
    // compile: SCREEN_COMPONENTS is Record<ScreenId, ScreenComponent> and strictFunctionTypes rejects
    // a component accepting fewer ids (PR #1003 review).
    if (!isShareScreen(descriptor.screen)) return notFound()

    const result = await guardOutputsFeedbackScreen({
        study,
        raw,
        matches: SHARE_SCREENS[descriptor.screen],
        notFound: NOT_FOUND,
        // The reviewer's decision, not the run: FILES-APPROVED is written when they submit it.
        decisionStatus: 'FILES-APPROVED',
    })
    if (!('job' in result)) return result

    const { job, entries, feedbackLoadError, dataPartner, decidedAt } = result
    const nav = resolvePhasedStepNav(descriptor.screen, projectStudyState(raw), {
        orgSlug,
        studyId: study.id,
        dashboardHref,
        returnTo,
    })

    const banner = researcherSharedOutputsBanner(descriptor.screen, { dataPartner })

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader study={study} />
                <SharedOutputsPanel
                    decidedAt={decidedAt}
                    banner={banner}
                    job={job}
                    feedbackSection={
                        <FeedbackAndNotesSection entries={entries} loadError={feedbackLoadError} alwaysExpandLatest />
                    }
                    nav={nav}
                />
            </Stack>
        </Box>
    )
}
