# Review Agent

Code & Compliance Auditor used by the management app to review research submissions before approval.

Originally lived in [crate-do-review-agent](https://github.com/safeinsights/crate-do-review-agent); inlined here April 2026 (no other consumer planned, simpler to evolve in-tree).

## What it does

Given a `ReviewContent` (proposal text + code files + reference docs), calls Claude with a single tool-use round trip and returns a structured `AnalysisReport`:

- `proposalSummary` — what the researcher says they want to do
- `codeExplanation` — what the code actually does
- `resultsSummary` — interpretation of researcher-supplied test results (optional)
- `alignmentCheck` — does the code match the proposal? findings if not
- `complianceCheck` — does the submission violate org rules? findings if so

## Files

- `agent.ts` — `ReviewAgent` class. Constructor takes API key or injected client. `generateAnalysis()` returns the report; `chat()` reserved for future follow-up Q&A (descoped now, planned by Oct 2026).
- `types.ts` — `ReviewContent`, `ReviewAgentConfig`, `AnalysisReport`, `ReferenceDocs`.
- `prompts.ts` — `DEFAULT_SYSTEM_INSTRUCTION`, `DEFAULT_ANALYSIS_PROMPT_TEMPLATE`, single-pass `buildAnalysisPrompt(...)` (placeholder injection-safe).
- `runner.ts` (claims the round, assembles the content, runs the agent under a deadline, writes the outcome)
- `enqueue.ts` / `worker.ts` (the queue hop, and the Lambda entry point on the far side of it)

## Where it runs

A submission asks for a review through `onStudyReviewRequested`, after the submitting transaction
commits. Where `REVIEW_QUEUE_URL` is set the request goes to SQS and a dedicated worker Lambda picks
it up (`bin/build-review-worker` bundles that entry point). Where it is not set, the review is
generated in process instead: local development, unit tests and PR previews each run against their
own database, which the shared worker cannot reach.

On the queue path a `study_review` row is written _before_ the message is sent, with no
`summary_started_at`, so a round waiting for a worker reads as pending rather than as one nothing
ever picked up. A send that fails marks that row failed, because an in-process fallback in a
deployed environment would put generation back in the request path this design moved it out of.

The worker then claims the round, stamping `summary_started_at` on that row. A second request for
the same round is refused rather than duplicated, and both writes at the end of a run are fenced to
the claim they own, so a run that comes back after a takeover can neither publish a stale report nor
fail its replacement. The deadline (`STUDY_REVIEW_GENERATION_DEADLINE_MS`) starts before the content
is assembled, not at the model call, so the whole run stays inside the worker's own timeout. Every
ending leaves the row saying what happened: report, failure, abort, or nothing to analyze.

Two clocks decide when the reviewer is offered a retry: `STUDY_REVIEW_STALE_AFTER_MS` for a run that
started, and the longer `STUDY_REVIEW_QUEUE_STALE_AFTER_MS` for one still waiting on the queue. A
message that outlives the second is dropped by the worker rather than run.

## Customization

- **System prompt** — pass `systemPrompt` in `ReviewAgentConfig` to override the bundled default. Intended sourcing: SI Admin org-level config field.
- **Analysis prompt** — pass `analysisPromptTemplate` for the same pattern (placeholders preserved).
- **Model** — defaults to `claude-haiku-4-5`; override via `model` config or `ANTHROPIC_MODEL` env var.

## Structured output

Uses Anthropic tool-use with a `submit_analysis` tool. The schema is defined alongside `AnalysisReport` in `agent.ts`. Forces a single tool call per request — no JSON regex parsing.
