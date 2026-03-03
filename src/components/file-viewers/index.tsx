import type { FC } from 'react'
import { csvViewer } from './csv-viewer'
import { logViewer } from './log-viewer'
import { textViewer } from './text-viewer'

const viewers = [csvViewer, logViewer, textViewer]

export const FileViewer: FC<{ path: string; text: string }> = ({ path, text }) => {
    for (const viewer of viewers) {
        const result = viewer(path, text)
        if (result) return result
    }
    return null
}
