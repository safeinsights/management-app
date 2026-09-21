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
- `runner.ts` — claims the round, assembles the content, runs the agent under a deadline, and writes the outcome.
- `enqueue.ts` / `worker.ts` — the queue hop and the Lambda entry point on the far side of it.

## Where it runs

A submission asks for a review through `onStudyReviewRequested`, after the submitting transaction
commits. Where `REVIEW_QUEUE_URL` is set the request goes to SQS and a dedicated worker Lambda picks
it up (`bin/build-review-worker` bundles that entry point). Where it is not set — local development,
unit tests, PR previews, each with their own database — the review is generated in process instead.

A run first claims its round by writing a `study_review` row with `summary_started_at` and no
report, so a second request for the same round is refused rather than duplicated, and the reviewer
can be shown "still working" rather than a guess. The model call carries a deadline
(`STUDY_REVIEW_GENERATION_DEADLINE_MS`), and every ending — report, failure, abort, nothing to
analyze — leaves the row saying what happened.

## Customization

- **System prompt** — pass `systemPrompt` in `ReviewAgentConfig` to override the bundled default. Intended sourcing: SI Admin org-level config field.
- **Analysis prompt** — pass `analysisPromptTemplate` for the same pattern (placeholders preserved).
- **Model** — defaults to `claude-haiku-4-5`; override via `model` config or `ANTHROPIC_MODEL` env var.

## Structured output

Uses Anthropic tool-use with a `submit_analysis` tool. The schema is defined alongside `AnalysisReport` in `agent.ts`. Forces a single tool call per request — no JSON regex parsing.
