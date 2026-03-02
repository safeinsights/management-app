import type { FC } from 'react'
import { CsvViewer } from './csv-viewer'
import { TextViewer } from './text-viewer'

export { CsvViewer } from './csv-viewer'
export { TextViewer } from './text-viewer'

function isCsvPath(path: string): boolean {
    return path.toLowerCase().endsWith('.csv')
}

export const FileViewer: FC<{ path: string; text: string }> = ({ path, text }) =>
    isCsvPath(path) ? <CsvViewer text={text} /> : <TextViewer text={text} />
