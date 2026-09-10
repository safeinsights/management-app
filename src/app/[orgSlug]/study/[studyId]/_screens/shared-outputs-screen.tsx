import { notFound } from 'next/navigation'
import { Box, Stack } from '@mantine/core'
import { SharedOutputsPanel } from '@/components/study/shared-outputs-panel'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { STATUS_ALERT_VARIANT, type StatusAlertVariant } from '@/components/study/status-alert'
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

type ShareScreenId = Extract<ScreenId, 'outputs-shared' | 'outputs-errored-shared'>

type BannerPhase = {
    variant: StatusAlertVariant
    title: string
}

type ShareScreenConfig = {
    /** This screen's routing rule, re-checked by the guard so rendering cannot disagree with it. */
    matches: (state: StudyState) => boolean
    lockedBanner: BannerPhase & { body: (dataPartner: string) => string }
    unlockedBanner: BannerPhase & { body: string }
}

/**
 * The reviewer released the outputs with "Share outputs and feedback". The researcher decrypts,
 * reads the outputs and feedback, then either resubmits or leaves.
 *
 * Two screens, one component, keyed by the screen the rule table picked — the same shape
 * `CodeDecisionScreen` uses for `code-approved`/`code-feedback`. They diverge in the routing
 * predicate and in both banner phases: a clean share concludes, an errored share still needs a
 * resubmit (OTTER-781).
 *
 * The third outcome, withheld outputs, is `outputs-feedback` (OTTER-695/697) and shows no key form
 * at all, so it is a genuinely different screen rather than a third entry here.
 */
const SHARE_SCREENS = {
    // OTTER-688: a clean run (RUN-COMPLETE + FILES-APPROVED, no JOB-ERRORED).
    'outputs-shared': {
        matches: isOutputsSharedOutcome,
        lockedBanner: {
            variant: STATUS_ALERT_VARIANT.action,
            title: 'Decrypt to view your outputs',
            body: (dataPartner) =>
                `${dataPartner} has reviewed and shared the outputs. Use your security key to decrypt and review them.`,
        },
        unlockedBanner: {
            variant: STATUS_ALERT_VARIANT.success,
            title: 'Outputs and feedback available',
            body: "Review the outputs and feedback below. If they don't meet your expectations, you can update your code and resubmit.",
        },
    },
    // OTTER-696 / OTTER-781: an errored run the researcher decrypts to diagnose, then resubmits.
    'outputs-errored-shared': {
        matches: isErroredOutputsSharedOutcome,
        lockedBanner: {
            variant: STATUS_ALERT_VARIANT.action,
            title: 'Decrypt outputs to view code error',
            body: (dataPartner) =>
                `${dataPartner} has shared the outputs and feedback. Enter your security key below to decrypt and diagnose the issue.`,
        },
        unlockedBanner: {
            variant: STATUS_ALERT_VARIANT.action,
            title: 'Resolve the code error to proceed',
            body: 'Review the outputs and reviewer feedback below to understand why the code run failed, then update your code and resubmit.',
        },
    },
} as const satisfies Record<ShareScreenId, ShareScreenConfig>

const isShareScreen = (screen: ScreenId): screen is ShareScreenId => screen in SHARE_SCREENS

const NOT_FOUND = { title: 'Outputs not found', message: 'This study has no shared outputs to display yet.' }

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
    const nav = resolvePhasedStepNav(descriptor.screen, projectStudyState(raw), {
        orgSlug,
        studyId: study.id,
        dashboardHref,
        returnTo,
    })

    const banner = {
        locked: {
            variant: config.lockedBanner.variant,
            title: config.lockedBanner.title,
            body: config.lockedBanner.body(dataPartner),
        },
        unlocked: config.unlockedBanner,
    }

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
