import type { FC } from 'react'
import { codeViewer } from './code-viewer'
import { csvViewer } from './csv-viewer'
import { logViewer } from './log-viewer'
import { textViewer } from './text-viewer'

export { CodeViewer } from './code-viewer'
export { ImageViewer } from './image-viewer'

// Most specific first. logViewer inspects content rather than extension, so it must precede
// codeViewer: run logs are written as .json, and matching on the extension alone would render a
// structured log as a single minified line instead of the timestamp/message table.
const viewers = [logViewer, codeViewer, csvViewer, textViewer]

export const FileViewer: FC<{ path: string; text: string }> = ({ path, text }) => {
    for (const viewer of viewers) {
        const result = viewer(path, text)
        if (result) return result
    }
    return null
}
