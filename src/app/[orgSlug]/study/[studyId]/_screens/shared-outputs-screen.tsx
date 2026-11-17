import { semanticColor } from '@/theme/tokens'
import { notFound } from 'next/navigation'
import { Box } from '@mantine/core'
import { SharedOutputsPanel } from '@/components/study/shared-outputs-panel'
import { CodeRunFeedback } from '@/components/study/code-run-feedback'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { VERIFY_OUTPUTS_STEP } from '@/components/study/proposal-step-header'
import { latestRunFeedback } from '@/lib/outputs-review'
import { researcherSharedOutputsBanner } from '@/lib/study-banners'
import {
    isErroredOutputsSharedOutcome,
    isOutputsSharedOutcome,
    projectStudyState,
    resolvePillId,
    type ScreenId,
    type SharedOutputsScreenId,
    type StudyState,
} from '@/lib/study-screen'
import { guardOutputsFeedbackScreen } from './outputs-feedback-guard'
import type { ScreenComponentProps } from './types'
import { PageLayout } from '@/components/page-layout'

/**
 * The reviewer released the outputs with "Share outputs and feedback". The researcher reads the
 * latest run's feedback, decrypts its outputs, then either resubmits or leaves.
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

// Same rule table as the status badge, so the sentence and the badge never disagree.
const researcherKeyDescription = (state: StudyState): string =>
    resolvePillId('researcher', state) === 'outputs-reviewed'
        ? 'The outputs are encrypted. Enter your security key to view them again.'
        : 'Output files are encrypted. Enter your security key to access outputs from this and previous code runs.'

const NOT_FOUND = { title: 'Outputs not found', message: 'This study has no shared outputs to display yet.' }

export async function SharedOutputsScreen({
    descriptor,
    study,
    raw,
    phasedNav,
}: Pick<ScreenComponentProps, 'descriptor' | 'study' | 'raw' | 'phasedNav'>) {
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

    const banner = researcherSharedOutputsBanner(descriptor.screen, { dataPartner })

    return (
        <Box bg={semanticColor('surface.page')}>
            <PageLayout header={<StudyPageHeader study={study} step={VERIFY_OUTPUTS_STEP} />}>
                <SharedOutputsPanel
                    // Keyed by job so decrypted outputs can never carry over to another study's run.
                    key={job.id}
                    studyId={study.id}
                    decidedAt={decidedAt}
                    banner={banner}
                    job={{ id: job.id }}
                    keyDescription={researcherKeyDescription(projectStudyState(raw))}
                    feedbackSection={
                        <CodeRunFeedback
                            feedback={latestRunFeedback(entries, job.id)}
                            loadError={feedbackLoadError}
                            testId="latest-run-feedback"
                        />
                    }
                    nav={phasedNav}
                />
            </PageLayout>
        </Box>
    )
}
