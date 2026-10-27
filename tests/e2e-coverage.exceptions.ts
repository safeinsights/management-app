// Routes no e2e spec drives, each with the reason. `tests/e2e-coverage.ts --check` fails on a route
// that is neither covered nor listed here, and on an entry that is stale (covered after all, or gone).
// Keys are `Routes.<name>` for pages and `<METHOD> <path>` for API routes, as docs/e2e-coverage.md prints them.
export const E2E_COVERAGE_EXCEPTIONS: Record<string, string> = {
    'Routes.notFound': 'Not a page of its own: the not-found view is reached through an unknown URL.',
    'Routes.editorDemo': 'Listed among the anonymous routes but no page exists; it 404s.',
    'Routes.researcherStudies': 'No page exists; it 404s.',
    'Routes.studyResearcherAgreements': 'Hidden since OTTER-727; the page only redirects onward.',
    'Routes.studyReviewerAgreements': 'Hidden since OTTER-727; the page only redirects onward.',
    'POST /api/jobs': 'The SQS adapter (JOB_WORKER=t only); covered by src/app/api/jobs/route.test.ts.',
}
