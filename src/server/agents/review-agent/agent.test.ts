import { describe, it, expect, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { generateAnalysis } from './agent'
import type { AnalysisReport, ReviewContent } from './types'

const baseReport: AnalysisReport = {
    proposalSummary: 'summary',
    codeExplanation: 'explanation',
    alignmentCheck: { isAligned: true, findings: [] },
    complianceCheck: { isCompliant: true, findings: [] },
}

const baseContent: ReviewContent = {
    proposal: 'p',
    codeFiles: { 'main.r': 'print("hi")' },
    referenceDocs: { requirements: 'r', brcDocs: 'b', dataDocs: 'd', otherDocs: 'o' },
}

function makeClient(content: unknown) {
    const create = vi.fn().mockResolvedValue({ content })
    return { client: { messages: { create } } as unknown as Anthropic, create }
}

function makeClientWithSequence(responses: unknown[]) {
    const create = vi.fn()
    for (const r of responses) {
        create.mockResolvedValueOnce({ content: r })
    }
    return { client: { messages: { create } } as unknown as Anthropic, create }
}

const toolUseBlock = [{ type: 'tool_use', name: 'submit_analysis', id: '1', input: baseReport }]

const malformedToolUseBlock = [
    {
        type: 'tool_use',
        name: 'submit_analysis',
        id: '1',
        input: {
            proposalSummary: 'summary',
            codeExplanation: 'explanation',
            // Malformed: alignmentCheck/complianceCheck are strings, findings at top level.
            findings: ['top-level finding'],
            alignmentCheck: '\n<parameter name="isAligned">false',
            complianceCheck: '\n<parameter name="isCompliant">false',
        },
    },
]

describe('generateAnalysis', () => {
    it('returns the structured report from a tool_use block', async () => {
        const { client, create } = makeClient(toolUseBlock)

        const result = await generateAnalysis({ client }, baseContent)

        expect(result.report).toEqual(baseReport)
        expect(create).toHaveBeenCalledOnce()
    })

    it('returns a conversation seed (messages) for chat continuation', async () => {
        const { client } = makeClient(toolUseBlock)

        const { messages } = await generateAnalysis({ client }, baseContent)

        expect(messages).toHaveLength(2)
        expect(messages[0].role).toBe('user')
        expect(messages[0].content).toContain('main.r')
        expect(messages[1].role).toBe('assistant')
        expect(JSON.parse(messages[1].content)).toEqual(baseReport)
    })

    it('passes config overrides to the client', async () => {
        const { client, create } = makeClient(toolUseBlock)

        await generateAnalysis(
            { client, model: 'claude-opus-4-7', maxTokens: 1024, systemPrompt: 'custom system' },
            baseContent,
        )

        const args = create.mock.calls[0][0]
        expect(args.model).toBe('claude-opus-4-7')
        expect(args.max_tokens).toBe(1024)
        expect(args.system).toBe('custom system')
        expect(args.tool_choice).toEqual({ type: 'tool', name: 'submit_analysis' })
    })

    it('embeds code files and proposal in the user message', async () => {
        const { client, create } = makeClient(toolUseBlock)

        await generateAnalysis({ client }, baseContent)

        const userMessage = create.mock.calls[0][0].messages[0].content as string
        expect(userMessage).toContain('main.r')
        expect(userMessage).toContain('print("hi")')
        expect(userMessage).toContain('p')
    })

    it('includes test results section when present', async () => {
        const { client, create } = makeClient(toolUseBlock)

        await generateAnalysis({ client }, { ...baseContent, researcherTestResults: 'PASS' })

        const userMessage = create.mock.calls[0][0].messages[0].content as string
        expect(userMessage).toContain('Researcher Test Results')
        expect(userMessage).toContain('PASS')
    })

    it('throws when the model omits the tool call', async () => {
        const { client } = makeClient([{ type: 'text', text: 'no tool', citations: null }])

        await expect(generateAnalysis({ client }, baseContent)).rejects.toThrow(/structured analysis/)
    })

    it('throws when neither apiKey nor client is provided', async () => {
        await expect(generateAnalysis({}, baseContent)).rejects.toThrow(/apiKey or client/)
    })

    it('retries once with a stricter nudge when the first response fails validation', async () => {
        const { client, create } = makeClientWithSequence([malformedToolUseBlock, toolUseBlock])

        const result = await generateAnalysis({ client }, baseContent)

        expect(result.report).toEqual(baseReport)
        expect(create).toHaveBeenCalledTimes(2)

        const retryArgs = create.mock.calls[1][0]
        const retryMessages = retryArgs.messages as Array<{ role: string; content: string }>
        expect(retryMessages).toHaveLength(3)
        expect(retryMessages[1].role).toBe('assistant')
        expect(retryMessages[2].role).toBe('user')
        expect(retryMessages[2].content).toMatch(/submit_analysis/)
        expect(retryMessages[2].content).toMatch(/findings/)
    })

    it('throws when both the initial and retry responses fail validation', async () => {
        const { client, create } = makeClientWithSequence([malformedToolUseBlock, malformedToolUseBlock])

        await expect(generateAnalysis({ client }, baseContent)).rejects.toThrow()
        expect(create).toHaveBeenCalledTimes(2)
    })
})
