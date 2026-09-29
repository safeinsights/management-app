import type { FC } from 'react'
import { codeViewer } from './code-viewer'
import { csvViewer } from './csv-viewer'
import { logViewer } from './log-viewer'
import { textViewer } from './text-viewer'

export { CodeViewer } from './code-viewer'
export { ImageViewer } from './image-viewer'

// Most specific first: logViewer inspects content rather than extension and must precede
// codeViewer, since run logs are written as .json.
const viewers = [logViewer, codeViewer, csvViewer, textViewer]

export const FileViewer: FC<{ path: string; text: string }> = ({ path, text }) => {
    for (const viewer of viewers) {
        const result = viewer(path, text)
        if (result) return result
    }
    return null
}
