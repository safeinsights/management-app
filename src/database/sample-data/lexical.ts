const paragraph = (text: string) => ({
    type: 'paragraph',
    format: '',
    indent: 0,
    version: 1,
    direction: null,
    textStyle: '',
    textFormat: 0,
    children: [{ mode: 'normal', text, type: 'text', style: '', detail: 0, format: 0, version: 1 }],
})

export type LexicalDoc = ReturnType<typeof lexical>

export function lexical(...paragraphs: string[]) {
    return {
        root: {
            type: 'root',
            format: '',
            indent: 0,
            version: 1,
            direction: null,
            children: paragraphs.map(paragraph),
        },
    }
}
