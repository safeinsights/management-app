'use server'

import { strToZod } from '@/lib/util'
import { userAction, z } from '@/server/actions/wrappers'
import OpenAI from 'openai'

// Set up your OpenAI client
const client = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});


const inputSchema = z.object({
    code: z.string(),
    history: z.array(z.object({
        sender: z.enum(['user', 'assistant']),
        code: z.string().optional(),
        message: z.string(),
    }))
})

const outputSchema = z.preprocess(strToZod, z.object({
    updated_code: z.string().optional(),
    questions: z.array(z.string()).optional(),
    description: z.string().optional(),
}))


const messageToStr = (isAi: boolean, message: string, code: string) => {
    if (isAi) return `Reply: ${message}\n\n`

    let str = `Question: ${message}\n\n`
    if (code) str += `Code\n##############\n${code}`
    return str
}

// Function to send a question + code
export const getEditorAssistedCodeAction = userAction(async ({ history, code }) => {
    const systemPrompt = `
You are an expert R programmer assisting a researcher inside RStudio. Your role is to analyze the researcher's code and question, and either:

1. Provide an improved or modified version of the R code to address the question.
2. Ask clarifying questions if more context is needed before making any changes.

Always respond with a JSON object containing:
- updated_code: the modified R code.  (empty if no change were performed).
- questions: an array of strings with clarifying questions (empty if none needed).
- description: a description of the changes made to the code. (empty if no changes were performed).

Only respond in valid JSON.
  `.trim()

    const messages: Array<OpenAI.Chat.ChatCompletionMessageParam> = [
        { role: 'system', content: systemPrompt },
        ...history.map((msg, i) => ({
            role: msg.sender, content: messageToStr(msg.sender == 'assistant', msg.message, i == history.length - 1 ? code : ''),
        }))
    ]
    console.dir(messages)
    try {
        const response = await client.chat.completions.create({
            model: 'gemini-2.5-flash-preview-05-20', //o3-mini',
            messages,
        });

        // https://discuss.ai.google.dev/t/a-json-response-should-be-json-parsable/233
        const content = (response.choices[0].message.content || '')
            .replace("```json", "")
            .replace("```", "")

        console.log(content)
        console.log(JSON.stringify(JSON.parse(content), null, 4))

        return outputSchema.parse(content)
    } catch (err) {
        console.log(err)
        throw err
    }
}, inputSchema)
