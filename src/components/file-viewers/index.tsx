import type { FC } from 'react'
import { codeViewer } from './code-viewer'
import { csvViewer } from './csv-viewer'
import { logViewer } from './log-viewer'
import { textViewer } from './text-viewer'

export { CodeViewer } from './code-viewer'

const viewers = [codeViewer, csvViewer, logViewer, textViewer]

export const FileViewer: FC<{ path: string; text: string }> = ({ path, text }) => {
    for (const viewer of viewers) {
        const result = viewer(path, text)
        if (result) return result
    }
    return null
}
