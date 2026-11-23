'use client'

import { Alert, Collapse, Divider, Group, Loader, Skeleton, Stack, Text, Typography } from '@mantine/core'
import { RepeatIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import clsx from 'clsx'
import { AnalysisPanel, DetailsBox, ExpandableDetails, TextButton } from './analysis-panel'
import { SecurityScanPanel, isScanPending } from './security-scan-panel'
import { Children, cloneElement, isValidElement, useEffect, useState, type ComponentProps, type ReactNode } from 'react'
import Markdown, { type Components, type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useMutation, useQuery, useQueryClient } from '@/common'
import { isActionError } from '@/lib/errors'
import { STUDY_REVIEW_STALE_AFTER_MS, studyReviewState } from '@/lib/study-review'
import { getJobAnalysisAction, regenerateStudyReviewAction } from '@/server/actions/study-job.actions'
import type { JobAnalysis, StudyReviewWithMeta } from '@/server/db/queries'
import { fontWeight, semanticColor } from '@/theme/tokens'

// Figma 1995:19067: the expanded summary stops growing at this height and scrolls inside.
const AI_SUMMARY_EXPANDED_MAX_HEIGHT = 616

// Names that stay capitalized in a sentence-case heading, so they neither prove Title Case nor get lowercased.
const PROPER_NAMES = new Set(['Python', 'Excel', 'Google', 'Postgres', 'Jupyter', 'Spark', 'Stata', 'Julia'])
// Title Case styles keep these lowercase too, so they say nothing about how a heading was written.
const TITLE_CASE_LOWERCASE_WORDS = new Set([
    'about',
    'after',
    'from',
    'into',
    'over',
    'than',
    'that',
    'through',
    'with',
])
// Inline code and links keep their text as written.
const KEEP_AS_WRITTEN = new Set<unknown>(['code', 'a'])

const hasLetter = (word: string) => /[A-Za-z]/.test(word)
const isRecasable = (word: string) => /^[A-Z][a-z]+$/.test(word) && !PROPER_NAMES.has(word)
const isSentenceCaseWord = (word: string) => /^[a-z]{4,}$/.test(word) && !TITLE_CASE_LOWERCASE_WORDS.has(word)

// Judges "(Main.R):" by "Main.R", so brackets and punctuation never decide a word's case.
function splitWord(token: string) {
    const [, prefix = '', core = '', suffix = ''] = /^([(["']*)(.*?)([)\]"'.,:;!?]*)$/.exec(token) ?? []
    return { prefix, core, suffix }
}

function plainText(children: ReactNode): string {
    return Children.toArray(children)
        .map((node) => {
            if (typeof node === 'string') return node
            if (!isValidElement<{ children?: ReactNode }>(node) || KEEP_AS_WRITTEN.has(node.type)) return ''
            return plainText(node.props.children)
        })
        .join('')
}

// A sentence-case heading keeps its long words lowercase. The first word ("1." skipped) proves nothing.
function looksTitleCase(text: string): boolean {
    const laterWords = text
        .split(/\s+/)
        .map((token) => splitWord(token).core)
        .filter(hasLetter)
        .slice(1)
    return laterWords.some(isRecasable) && !laterWords.some(isSentenceCaseWord)
}

// Skips headings the model already wrote in sentence case, so their proper nouns survive.
function sentenceCaseChildren(children: ReactNode): ReactNode {
    if (!looksTitleCase(plainText(children))) return children
    let isFirstWord = true
    const recaseToken = (token: string) => {
        const { prefix, core, suffix } = splitWord(token)
        if (!hasLetter(core)) return token
        const keep = isFirstWord || !isRecasable(core)
        isFirstWord = false
        return keep ? token : `${prefix}${core.toLowerCase()}${suffix}`
    }
    const recase = (node: ReactNode): ReactNode => {
        if (typeof node === 'string') return node.replace(/\S+/g, recaseToken)
        if (!isValidElement<{ children?: ReactNode }>(node)) return node
        if (KEEP_AS_WRITTEN.has(node.type)) {
            isFirstWord = false
            return node
        }
        return cloneElement(node, undefined, Children.map(node.props.children, recase))
    }
    return Children.map(children, recase)
}

// A paragraph that is nothing but bold text is a heading the model wrote as a bold lead-in.
function sentenceCaseLeadIn(children: ReactNode): ReactNode {
    const parts = Children.toArray(children)
    const [only] = parts
    if (parts.length !== 1 || !isValidElement<{ children?: ReactNode }>(only) || only.type !== 'strong') {
        return children
    }
    return cloneElement(only, undefined, sentenceCaseChildren(only.props.children))
}

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

function sentenceCaseHeading(Tag: HeadingTag) {
    return function SentenceCaseHeading({ node: _node, children, ...props }: ComponentProps<HeadingTag> & ExtraProps) {
        return <Tag {...props}>{sentenceCaseChildren(children)}</Tag>
    }
}

const AI_SUMMARY_MARKDOWN_COMPONENTS: Components = {
    // The feedback editor's list classes (globals.css), so summary lists indent like reviewer feedback
    // rather than with Typography's wider defaults.
    ul: ({ node: _node, className, ...props }) => <ul className={clsx('editable-text-ul', className)} {...props} />,
    ol: ({ node: _node, className, ...props }) => <ol className={clsx('editable-text-ol', className)} {...props} />,
    p: ({ node: _node, children, ...props }) => <p {...props}>{sentenceCaseLeadIn(children)}</p>,
    h1: sentenceCaseHeading('h1'),
    h2: sentenceCaseHeading('h2'),
    h3: sentenceCaseHeading('h3'),
    h4: sentenceCaseHeading('h4'),
    h5: sentenceCaseHeading('h5'),
    h6: sentenceCaseHeading('h6'),
}

function AiSummaryContent({ summary }: { summary: string }) {
    return (
        <ExpandableDetails
            testId="ai-summary"
            showLabel="View full AI summary"
            hideLabel="Hide full AI summary"
            expandedMaxHeight={AI_SUMMARY_EXPANDED_MAX_HEIGHT}
            scrollLabel="Full AI summary"
        >
            <Typography fz="sm">
                <Markdown remarkPlugins={[remarkGfm]} components={AI_SUMMARY_MARKDOWN_COMPONENTS}>
                    {summary}
                </Markdown>
            </Typography>
        </ExpandableDetails>
    )
}

const ANALYSIS_POLL_INTERVAL_MS = 5_000

// Only for a round with no row yet: queued, or a run that died before it could claim anything.
// Measured from submission, not page open, so opening late does not reset the clock.
const AI_SUMMARY_TIMEOUT_MS = STUDY_REVIEW_STALE_AFTER_MS

// `since` is read once on mount and later prop changes are ignored, so a new submission must
// arrive via a fresh server render or an explicit reset().
function useElapsedSince(since: Date | string, ms: number) {
    const initialSinceMs = new Date(since).getTime()
    const [startedAt, setStartedAt] = useState(initialSinceMs)
    const [elapsed, setElapsed] = useState(() => Date.now() - initialSinceMs >= ms)
    useEffect(() => {
        const remaining = Math.max(0, ms - (Date.now() - startedAt))
        const id = setTimeout(() => setElapsed(true), remaining)
        return () => clearTimeout(id)
    }, [startedAt, ms])
    return {
        elapsed,
        reset: () => {
            setStartedAt(Date.now())
            setElapsed(false)
        },
    }
}

// A resubmit reuses the job id, so keying on it alone lets the cache serve the previous round as
// current — the same defect the server-side round rule closes, reintroduced on the client by a 60s
// staleTime over a singleton query client (OTTER-775 review).
const jobAnalysisKey = (studyJobId: string, submittedAt: Date | string) =>
    ['job-analysis', studyJobId, new Date(submittedAt).getTime()] as const

type JobAnalysisUpdate = JobAnalysis

// The server drops a review belonging to a previous round, so a null review here means
// "generating", never "last round's" (OTTER-775).
//
// The backstops deliberately do not appear here: they decide what a panel renders, not whether the
// poll runs. 8.4% of measured generations finish past the summary backstop, and stopping there
// stranded a report that was already in the database until a reload (OTTER-775 review).
function useJobAnalysisPoll(
    studyJobId: string,
    submittedAt: Date | string,
    initialAnalysis: JobAnalysis,
    intervalMs: number,
) {
    return useQuery({
        queryKey: jobAnalysisKey(studyJobId, submittedAt),
        queryFn: async (): Promise<JobAnalysisUpdate> => {
            const response = await getJobAnalysisAction({ studyJobId })
            if (isActionError(response)) throw new Error('Unable to load analysis')
            return response
        },
        initialData: initialAnalysis,
        // The server render is already stale by the time it reaches the browser; without this the
        // seeded value counts as fresh and the first interval tick is skipped.
        initialDataUpdatedAt: 0,
        refetchInterval: (query) => {
            if (query.state.error) return false
            const review = query.state.data?.review
            return review == null || studyReviewState(review) === 'pending' || isScanPending(query.state.data?.scan)
                ? intervalMs
                : false
        },
    })
}

function AiSummaryPending() {
    return (
        <DetailsBox gap="sm" testId="ai-summary-pending">
            <Stack gap="xs" aria-hidden>
                <Skeleton height={12} radius="sm" data-testid="ai-summary-skeleton-line" />
                <Skeleton height={12} radius="sm" width="85%" data-testid="ai-summary-skeleton-line" />
            </Stack>
            <Group gap="xxs" role="status">
                <Loader size={12} color={semanticColor('text.disabled')} />
                <Text size="sm" fw={fontWeight.semibold} c={semanticColor('text.disabled')}>
                    Generating summary
                </Text>
            </Group>
        </DetailsBox>
    )
}

function RetryIcon({ isRetrying }: { isRetrying: boolean }) {
    if (isRetrying) return <Loader size={14} />
    return <RepeatIcon size={14} />
}

function AiSummaryError({ onRetry, isRetrying }: { onRetry: () => void; isRetrying: boolean }) {
    return (
        <DetailsBox gap="sm" testId="ai-summary-error">
            <Alert color="red" icon={<WarningCircleIcon size={20} weight="fill" />}>
                <Text size="sm" c={semanticColor('text.primary')}>
                    The AI summary failed to generate.
                </Text>
            </Alert>
            <TextButton
                onClick={onRetry}
                testId="ai-summary-retry"
                disabled={isRetrying}
                aria-busy={isRetrying}
                leftSection={<RetryIcon isRetrying={isRetrying} />}
            >
                Retry
            </TextButton>
        </DetailsBox>
    )
}

function AiSummaryEmpty() {
    return (
        <Text size="sm" c="dimmed" data-testid="ai-summary-empty">
            No AI summary available yet.
        </Text>
    )
}

function useRetryStudyReview(studyJobId: string, analysisKey: readonly unknown[], onRetryStarted: () => void) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () => regenerateStudyReviewAction({ studyJobId }),
        onSuccess: (result) => {
            // The server refuses to restart a run that is still alive, and there is nothing to
            // restart for a report that has already landed. Either way the row on screen is the
            // one to re-read, and the clock it is judged against must not move.
            if (isActionError(result) || result.status !== 'restarted') {
                queryClient.invalidateQueries({ queryKey: [...analysisKey] })
                return
            }
            // Must be the poll's own key, round included, or this clears an entry nothing reads and
            // the panel keeps rendering the failure it just retried.
            queryClient.setQueryData(analysisKey, (prev: JobAnalysisUpdate | undefined) =>
                prev ? { ...prev, review: null } : prev,
            )
            onRetryStarted()
        },
    })
}

type AiSummaryProps = {
    studyJobId: string
    analysisKey: readonly unknown[]
    review: StudyReviewWithMeta | null
    hasError: boolean
    timedOut: boolean
    onRetryStarted: () => void
}

function AiSummaryCollapsible({ studyJobId, analysisKey, review, hasError, timedOut, onRetryStarted }: AiSummaryProps) {
    const retry = useRetryStudyReview(studyJobId, analysisKey, onRetryStarted)
    const summary = review?.report?.codeExplanation ?? null

    const onRetry = () => retry.mutate()
    const errorState = <AiSummaryError onRetry={onRetry} isRetrying={retry.isPending} />

    // A summary already on screen outranks a failed tick: a failure stops the poll, so replacing
    // good content the reviewer is reading would never come back (OTTER-775 review).
    const renderBody = () => {
        if (review != null) {
            const state = studyReviewState(review)
            if (state === 'failed') return errorState
            // An error stops the poll, so a run still pending when one lands has nothing left to
            // report its own outcome to this page. Offering the retry beats a spinner that can no
            // longer resolve, and unlike a landed report there is nothing here worth protecting.
            if (state === 'pending') return timedOut || hasError ? errorState : <AiSummaryPending />
            if (!summary) return <AiSummaryEmpty />
            return <AiSummaryContent summary={summary} />
        }
        if (hasError || timedOut) return errorState
        return <AiSummaryPending />
    }

    return (
        <AnalysisPanel
            title="AI Summary of submitted code files"
            description="AI-generated summary, which may contain errors. Review the submitted code before making your decision."
            testId="ai-summary"
        >
            {renderBody()}
        </AnalysisPanel>
    )
}

export type JobAnalysisPanelsProps = {
    studyJobId: string
    initialAnalysis: JobAnalysis
    // Anchors the summary backstop so opening the page late does not restart the clock.
    submittedAt: Date | string
    // Overridable so tests can exercise the backstop and polling without faking timers.
    summaryTimeoutMs?: number
    pollIntervalMs?: number
    detailsExpanded?: boolean
    expandToggle?: ReactNode
    // Blocks above the scan and summary; they count toward the collapsed preview.
    leadingBlocks?: SubmissionDetailBlock[]
    children: ReactNode
}

// The collapsed section previews whatever blocks come first, so adding, removing or reordering a
// block never needs a change here (OTTER-865).
const SUBMISSION_DETAILS_PREVIEW_COUNT = 2

export type SubmissionDetailBlock = {
    key: string
    isVisible?: boolean
    alwaysCollapsed?: boolean
    content: ReactNode
}

export function splitPreviewBlocks(blocks: SubmissionDetailBlock[], previewCount: number) {
    const shown = blocks.filter((block) => block.isVisible !== false)
    const preview = shown.filter((block) => !block.alwaysCollapsed).slice(0, previewCount)
    return { preview, rest: shown.filter((block) => !preview.includes(block)) }
}

function BlockDivider({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <Divider />
}

function DetailBlockRow({ content, withDivider }: { content: ReactNode; withDivider: boolean }) {
    return (
        <>
            <BlockDivider isVisible={withDivider} />
            {content}
        </>
    )
}

function DividedBlocks({ blocks }: { blocks: SubmissionDetailBlock[] }) {
    return blocks.map((block, index) => (
        <DetailBlockRow key={block.key} content={block.content} withDivider={index > 0} />
    ))
}

function CollapsibleRest({
    isVisible,
    blocks,
    expanded,
    expandToggle,
}: {
    isVisible: boolean
    blocks: SubmissionDetailBlock[]
    expanded: boolean
    expandToggle?: ReactNode
}) {
    if (!isVisible) return null
    // The toggle is a sibling of the Collapse so a closed panel does not leave flex-gap above it.
    return (
        <>
            <Divider />
            <Stack gap={0}>
                {expandToggle}
                <Collapse expanded={expanded} keepMounted>
                    <Stack gap="xl">
                        <DividedBlocks blocks={blocks} />
                    </Stack>
                </Collapse>
            </Stack>
        </>
    )
}

function SubmissionDetailBlocks({
    blocks,
    detailsExpanded,
    expandToggle,
}: {
    blocks: SubmissionDetailBlock[]
    detailsExpanded: boolean
    expandToggle?: ReactNode
}) {
    const { preview, rest } = splitPreviewBlocks(blocks, SUBMISSION_DETAILS_PREVIEW_COUNT)
    // Figma sets the divider above the collapsed opener tighter (lg) than the gap between blocks (xl).
    return (
        <Stack gap={detailsExpanded ? 'xl' : 'lg'}>
            <Stack gap="xl">
                <DividedBlocks blocks={preview} />
            </Stack>
            <CollapsibleRest
                isVisible={rest.length > 0}
                blocks={rest}
                expanded={detailsExpanded}
                expandToggle={expandToggle}
            />
        </Stack>
    )
}

// Owns the analysis poll the AI summary reads from.
export function JobAnalysisPanels({
    studyJobId,
    initialAnalysis,
    submittedAt,
    summaryTimeoutMs = AI_SUMMARY_TIMEOUT_MS,
    pollIntervalMs = ANALYSIS_POLL_INTERVAL_MS,
    detailsExpanded = true,
    expandToggle,
    leadingBlocks = [],
    children,
}: JobAnalysisPanelsProps) {
    const summaryTimeout = useElapsedSince(submittedAt, summaryTimeoutMs)
    const { data, error } = useJobAnalysisPoll(studyJobId, submittedAt, initialAnalysis, pollIntervalMs)
    const review = data?.review ?? null
    // The server judges a row it has; the submission clock only covers a run that never wrote one.
    const summaryGaveUp = review ? review.isStale : summaryTimeout.elapsed

    const blocks: SubmissionDetailBlock[] = [
        ...leadingBlocks,
        { key: 'security-scan', content: <SecurityScanPanel scan={data?.scan ?? null} hasError={error != null} /> },
        {
            key: 'ai-summary',
            content: (
                <AiSummaryCollapsible
                    studyJobId={studyJobId}
                    analysisKey={jobAnalysisKey(studyJobId, submittedAt)}
                    review={review}
                    hasError={error != null}
                    timedOut={summaryGaveUp}
                    onRetryStarted={summaryTimeout.reset}
                />
            ),
        },
        // The code viewer holds the section's closer, so it must never land in the preview.
        { key: 'code-files', alwaysCollapsed: true, content: children },
    ]

    return <SubmissionDetailBlocks blocks={blocks} detailsExpanded={detailsExpanded} expandToggle={expandToggle} />
}
