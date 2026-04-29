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
- `index.ts` — public exports.

## Customization

- **System prompt** — pass `systemPrompt` in `ReviewAgentConfig` to override the bundled default. Intended sourcing: SI Admin org-level config field.
- **Analysis prompt** — pass `analysisPromptTemplate` for the same pattern (placeholders preserved).
- **Model** — defaults to `claude-sonnet-4-6`; override via `model` config or `ANTHROPIC_MODEL` env var.

## Structured output

Uses Anthropic tool-use with a `submit_analysis` tool. The schema is defined alongside `AnalysisReport` in `agent.ts`. Forces a single tool call per request — no JSON regex parsing.
