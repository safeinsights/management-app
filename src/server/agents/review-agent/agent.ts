import Anthropic from '@anthropic-ai/sdk'
import { buildAnalysisPrompt, DEFAULT_SYSTEM_INSTRUCTION } from './prompts'
import { analysisReportSchema } from './types'
import type { AnalysisReport, AnalysisResult, ReviewAgentConfig, ReviewContent, ReviewMessage } from './types'

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5'
// Realistic worst case is ~2K tokens (codeExplanation ~300 words ≈ 400
// tokens, plus other narrative fields and ~10 findings per check × 2 checks ×
// ~50 tokens). 16K still gives ~8× headroom — schema property `description`
// strings carry the actual length guidance to the model; this cap is just a
// runaway bound.
const DEFAULT_MAX_TOKENS = 16_000
const DEFAULT_MAX_RETRIES = 3

const ANALYSIS_TOOL_NAME = 'submit_analysis'

// `strict: true` opts into Anthropic's constrained-decoding tool mode. The
// model can no longer emit a shape that violates `input_schema` — the class of
// "alignmentCheck came back as an XML-tag string fragment" prod bug is fixed
// at the API boundary, not in our app. Requires `additionalProperties: false`
// at every object level. Docs:
//   https://platform.claude.com/docs/en/build-with-claude/structured-outputs
const ANALYSIS_TOOL: Anthropic.Messages.Tool = {
    name: ANALYSIS_TOOL_NAME,
    description:
        'Submit the structured review of the research proposal. Always call this tool exactly once with the full report.',
    strict: true,
    input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            proposalSummary: {
                type: 'string',
                description: 'Concise summary of the proposal goals. 2-3 sentences, ~80 words max.',
            },
            codeExplanation: {
                type: 'string',
                description:
                    'What the code does in plain language, referencing file paths. Up to two paragraphs, ~300 words max. Use numbered steps if helpful.',
            },
            resultsSummary: {
                type: 'string',
                description:
                    'Summary of researcher test results if provided. One paragraph, ~150 words max. Omit this field entirely when no results are provided.',
            },
            alignmentCheck: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    isAligned: { type: 'boolean' },
                    findings: {
                        type: 'array',
                        items: { type: 'string' },
                        description:
                            'Specific discrepancies between proposal and code. At most 10 items, ordered by severity. Each finding 1-2 sentences. Empty array when fully aligned.',
                    },
                },
                required: ['isAligned', 'findings'],
            },
            complianceCheck: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    isCompliant: { type: 'boolean' },
                    findings: {
                        type: 'array',
                        items: { type: 'string' },
                        description:
                            'Specific violations of the reference documents or org requirements. At most 10 items, ordered by severity. Each finding 1-2 sentences. Empty array when fully compliant.',
                    },
                },
                required: ['isCompliant', 'findings'],
            },
        },
        required: ['proposalSummary', 'codeExplanation', 'alignmentCheck', 'complianceCheck'],
    },
}

function resolveClient(config: ReviewAgentConfig): Anthropic {
    if (config.client) return config.client
    if (config.apiKey) {
        return new Anthropic({ apiKey: config.apiKey, maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES })
    }
    throw new Error('Either apiKey or client must be provided.')
}

function formatCodeFiles(codeFiles: Record<string, string>): string {
    return Object.entries(codeFiles)
        .map(([path, content]) => '```' + path + '\n' + content + '\n' + '```')
        .join('\n\n')
}

function buildPromptForContent(content: ReviewContent, templateOverride?: string): string {
    const testResultsSection = content.researcherTestResults
        ? `\n**Researcher Test Results:**\n<TestResults>\n${content.researcherTestResults}\n</TestResults>`
        : ''

    return buildAnalysisPrompt(
        {
            proposal: content.proposal,
            code: formatCodeFiles(content.codeFiles),
            requirements: content.referenceDocs.requirements,
            brcDocs: content.referenceDocs.brcDocs,
            dataDocs: content.referenceDocs.dataDocs,
            otherDocs: content.referenceDocs.otherDocs,
            testResultsSection,
        },
        templateOverride,
    )
}

function extractReport(response: Anthropic.Messages.Message): AnalysisReport {
    // Structured-outputs doc explicitly calls out two degenerate paths where the
    // response can be 200 OK but the tool_use block is missing or partial:
    //   - `stop_reason: 'refusal'` — safety refusal takes precedence over schema
    //   - `stop_reason: 'max_tokens'` — output truncated mid-tool-call
    // Surface both with specific messages so Sentry alerts are actionable.
    if (response.stop_reason === 'refusal') {
        throw new Error('The model refused to generate an analysis.')
    }
    if (response.stop_reason === 'max_tokens') {
        throw new Error('The model response was truncated by max_tokens — raise the limit.')
    }

    const toolUse = response.content.find(
        (block): block is Anthropic.Messages.ToolUseBlock =>
            block.type === 'tool_use' && block.name === ANALYSIS_TOOL_NAME,
    )

    if (!toolUse) {
        throw new Error('The model did not return a structured analysis.')
    }

    return analysisReportSchema.parse(toolUse.input)
}

// Append additionalContext to the system prompt rather than replacing it.
function buildSystemPrompt(config: ReviewAgentConfig): string {
    const base = config.systemPrompt ?? DEFAULT_SYSTEM_INSTRUCTION
    const extra = config.additionalContext?.trim()
    return extra ? `${base}\n\n${extra}` : base
}

export async function generateAnalysis(config: ReviewAgentConfig, content: ReviewContent): Promise<AnalysisResult> {
    const client = resolveClient(config)
    const prompt = buildPromptForContent(content, config.analysisPromptTemplate)

    const response = await client.messages.create({
        model: config.model ?? DEFAULT_MODEL,
        max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: buildSystemPrompt(config),
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: 'tool', name: ANALYSIS_TOOL_NAME },
        messages: [{ role: 'user', content: prompt }],
    })

    const report = extractReport(response)
    const messages: ReviewMessage[] = [
        { role: 'user', content: prompt },
        { role: 'assistant', content: JSON.stringify(report) },
    ]
    return { report, messages }
}
