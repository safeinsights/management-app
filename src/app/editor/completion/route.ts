import {CompletionCopilot, CompletionRequestBody} from 'monacopilot';
import { NextResponse } from 'next/server';

const copilot = new CompletionCopilot(undefined, {
    // You don't need to set the provider if you are using a custom model.
    // provider: "openai",
    model: async (prompt) => {
        console.log(prompt)
        const response = await fetch(
            'https://api.openai.com/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                        {role: 'system', content: prompt.context},
                        {
                            role: 'user',
                            content: `${prompt.instruction}\n\n${prompt.fileContent}`,
                        },
                    ],
                    temperature: 0.2,
                    max_tokens: 256,
                }),
            },
        );

        const data = await response.json();

        return {
            text: data.choices[0].message.content,
        };
    },
});

// const copilot = new CompletionCopilot(process.env.MISTRAL_API_KEY, {
//     provider: 'mistral',
//     model: 'codestral',
// });

export const POST = async (req: Request) => {
     const body = await req.json() as CompletionRequestBody;

    //    if (!body) return NextResponse.json({ status: 'fail', error: 'Body not present' }, { status: 500 })

    //    return NextResponse
    const completion = await copilot.complete({
        body: body
    });

    //    res.json(completion);

    return Response.json(completion)

    //    return new NextResponse('ok', { status: 200 })
}

//              app.post('/code-completion', async (req, res) => {

// });
