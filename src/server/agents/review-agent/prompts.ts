/**
 * Default system instruction. Sourced from CRATE DO Review Agent.
 * Override via `ReviewAgentConfig.systemPrompt` (e.g. SI Admin org-level config).
 */
export const DEFAULT_SYSTEM_INSTRUCTION = `You are a strict and meticulous Code & Compliance Auditor for an education research data organization.
Your primary function is to analyze a researcher's submission, which includes a research proposal and associated code, focusing on education data.
You must compare this submission against the organization's established requirements and documentation for handling student and school data.
Your analysis must be thorough, objective, and precise, with a focus on ethical data handling in an educational context.

You will be provided with several sets of documents:
1.  **Requirements:** Organizational requirements and compliance rules. This is the source of truth for all compliance checks.
2.  **BRC Documents:** Base Research Container documentation — the technical environment created by the data organization that supports the researcher's analysis code.
3.  **Data Documents:** Data schemas, dictionaries, and related documentation.
4.  **Other Documents:** Any additional reference documentation (API docs, etc.).
5.  **Researcher Submission:** The researcher's proposal and code.
6.  **Your Task:** A specific request to analyze the submission or answer a question.

When generating an analysis, you must return a structured JSON object adhering to the 'AnalysisReport' interface.
Do not add any commentary outside of the requested JSON structure.
`

/**
 * Default analysis prompt template. Override via `ReviewAgentConfig.analysisPromptTemplate`.
 * Placeholders (single-pass replaced — no cross-injection): {{proposal}}, {{code}},
 * {{requirements}}, {{brcDocs}}, {{dataDocs}}, {{otherDocs}}, {{testResultsSection}}.
 */
export const DEFAULT_ANALYSIS_PROMPT_TEMPLATE = `
Please perform a full analysis of the provided research submission.
The output must be a single JSON object that conforms to the AnalysisReport interface.

**Reference Documents:**
<Requirements>
{{requirements}}
</Requirements>
<BRCDocs>
{{brcDocs}}
</BRCDocs>
<DataDocs>
{{dataDocs}}
</DataDocs>
<OtherDocs>
{{otherDocs}}
</OtherDocs>

**Researcher Submission:**
<Proposal>
{{proposal}}
</Proposal>
<Code>
{{code}}
</Code>
{{testResultsSection}}

**Task:**
Generate the JSON 'AnalysisReport'.
- **proposalSummary**: Briefly summarize the researcher's stated goals.
- **codeExplanation**: Explain what the code actually does, referencing file paths.
- **resultsSummary**: If test results were provided above, summarize what the results show — key outputs, patterns, and whether they appear reasonable given the proposal and code. If no test results were provided, omit this field from the JSON.
- **alignmentCheck**: Determine if the code faithfully implements the proposal. List specific discrepancies as findings.
- **complianceCheck**: Determine if the proposal or code violates any requirements or guidelines from the reference documents. List specific violations as findings.
`

interface PromptData {
    proposal: string
    code: string
    requirements: string
    brcDocs: string
    dataDocs: string
    otherDocs: string
    testResultsSection: string
}

/**
 * Populate the analysis prompt template using a single-pass replacement strategy.
 * Prevents user content containing placeholder strings (e.g. "{{code}}") from
 * being substituted by a later replacement.
 */
export function buildAnalysisPrompt(data: PromptData, templateOverride?: string): string {
    const template = templateOverride ?? DEFAULT_ANALYSIS_PROMPT_TEMPLATE

    const placeholders: Record<string, string> = {
        '{{proposal}}': data.proposal,
        '{{code}}': data.code,
        '{{requirements}}': data.requirements,
        '{{brcDocs}}': data.brcDocs,
        '{{dataDocs}}': data.dataDocs,
        '{{otherDocs}}': data.otherDocs,
        '{{testResultsSection}}': data.testResultsSection,
    }

    return template.replace(/\{\{[^}]+\}\}/g, (match) => {
        return Object.prototype.hasOwnProperty.call(placeholders, match) ? placeholders[match] : match
    })
}
