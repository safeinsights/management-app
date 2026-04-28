import Anthropic from '@anthropic-ai/sdk'
import { buildAnalysisPrompt, DEFAULT_SYSTEM_INSTRUCTION } from './prompts'
import type { AnalysisReport, ReviewAgentConfig, ReviewContent } from './types'

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'
const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_MAX_RETRIES = 3

const ANALYSIS_TOOL_NAME = 'submit_analysis'

const ANALYSIS_TOOL: Anthropic.Messages.Tool = {
    name: ANALYSIS_TOOL_NAME,
    description: 'Submit the structured review of the research proposal. Always call this tool exactly once with the full report.',
    input_schema: {
        type: 'object',
        properties: {
            proposalSummary: { type: 'string' },
            codeExplanation: { type: 'string' },
            resultsSummary: { type: 'string' },
            alignmentCheck: {
                type: 'object',
                properties: {
                    isAligned: { type: 'boolean' },
                    findings: { type: 'array', items: { type: 'string' } },
                },
                required: ['isAligned', 'findings'],
            },
            complianceCheck: {
                type: 'object',
                properties: {
                    isCompliant: { type: 'boolean' },
                    findings: { type: 'array', items: { type: 'string' } },
                },
                required: ['isCompliant', 'findings'],
            },
        },
        required: ['proposalSummary', 'codeExplanation', 'alignmentCheck', 'complianceCheck'],
    },
}

interface Message {
    role: 'user' | 'assistant'
    content: string
}

export class ReviewAgent {
    private client: Anthropic
    private model: string
    private maxTokens: number
    private content: ReviewContent | null = null
    private conversationHistory: Message[] = []
    private systemInstruction: string
    private analysisPromptTemplate?: string

    constructor(config: ReviewAgentConfig) {
        const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES

        if (config.client) {
            this.client = config.client
        } else if (config.apiKey) {
            this.client = new Anthropic({ apiKey: config.apiKey, maxRetries })
        } else {
            throw new Error('Either apiKey or client must be provided.')
        }

        this.model = config.model ?? DEFAULT_MODEL
        this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS
        this.systemInstruction = config.systemPrompt ?? DEFAULT_SYSTEM_INSTRUCTION
        this.analysisPromptTemplate = config.analysisPromptTemplate
    }

    public loadContent(content: ReviewContent): void {
        this.content = content
        this.conversationHistory = []
    }

    public async generateAnalysis(): Promise<AnalysisReport> {
        if (!this.content) {
            throw new Error('Load content before generating an analysis.')
        }

        const codeFormatted = Object.entries(this.content.codeFiles)
            .map(([path, content]) => '```' + path + '\n' + content + '\n' + '```')
            .join('\n\n')

        const testResultsSection = this.content.researcherTestResults
            ? `\n**Researcher Test Results:**\n<TestResults>\n${this.content.researcherTestResults}\n</TestResults>`
            : ''

        const analysisPrompt = buildAnalysisPrompt(
            {
                proposal: this.content.proposal,
                code: codeFormatted,
                requirements: this.content.referenceDocs.requirements,
                brcDocs: this.content.referenceDocs.brcDocs,
                dataDocs: this.content.referenceDocs.dataDocs,
                otherDocs: this.content.referenceDocs.otherDocs,
                testResultsSection,
            },
            this.analysisPromptTemplate,
        )

        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: this.maxTokens,
            system: this.systemInstruction,
            tools: [ANALYSIS_TOOL],
            tool_choice: { type: 'tool', name: ANALYSIS_TOOL_NAME },
            messages: [...this.conversationHistory, { role: 'user', content: analysisPrompt }],
        })

        const toolUse = response.content.find(
            (block): block is Anthropic.Messages.ToolUseBlock =>
                block.type === 'tool_use' && block.name === ANALYSIS_TOOL_NAME,
        )

        if (!toolUse) {
            throw new Error('The model did not return a structured analysis.')
        }

        const report = toolUse.input as AnalysisReport

        this.conversationHistory.push({ role: 'user', content: analysisPrompt })
        this.conversationHistory.push({ role: 'assistant', content: JSON.stringify(report) })

        return report
    }

    /**
     * Follow-up chat. Currently descoped per Slack discussion (Apr 2026)
     * but retained for upcoming re-introduction (target: before Oct 2026).
     */
    public async chat(message: string): Promise<string> {
        if (this.conversationHistory.length === 0) {
            throw new Error('Chat session not initialized. Please load content and generate an analysis first.')
        }

        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: this.maxTokens,
            system: this.systemInstruction,
            messages: [...this.conversationHistory, { role: 'user', content: message }],
        })

        const responseText = response.content[0].type === 'text' ? response.content[0].text : null

        if (!responseText) {
            throw new Error('The model did not return a response.')
        }

        this.conversationHistory.push({ role: 'user', content: message })
        this.conversationHistory.push({ role: 'assistant', content: responseText })

        return responseText
    }
}
