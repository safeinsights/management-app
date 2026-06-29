import type { Story } from '@ladle/react'
import { useState } from 'react'
import { Button } from '@mantine/core'
import { FilePreviewModal } from './file-preview-modal'

// FilePreviewModal renders an always-open AppModal whose body picks the right viewer for the
// file (by extension/content) and offers a download link. The modal portals into the document
// body, so each story drives it from a trigger button with real open/close state — that way the
// X, Escape and overlay-click actually dismiss it (an always-open `onClose={noop}` modal can't be
// escaped). `contents: null` shows the loading state.
const meta = { title: 'File viewers / File preview modal' }
export default meta

const rCode = `# Cohort summary statistics
library(dplyr)

patients <- read.csv("patients.csv")

summary <- patients %>%
    filter(age >= 18) %>%
    group_by(treatment_group) %>%
    summarise(n = n(), mean_age = mean(age, na.rm = TRUE))

print(summary)
`

const csv = `patient_id,age,treatment_group,outcome
1001,42,control,0
1002,57,treatment,1
1003,29,treatment,0
1004,63,control,1
`

type PreviewFile = { name: string; contents: string | null }

function PreviewStory({ file, label }: { file: PreviewFile; label: string }) {
    const [open, setOpen] = useState(true)
    return (
        <div style={{ padding: 24 }}>
            <Button onClick={() => setOpen(true)}>{label}</Button>
            {open && <FilePreviewModal file={file} onClose={() => setOpen(false)} />}
        </div>
    )
}

export const CodeFile: Story = () => (
    <PreviewStory file={{ name: 'analysis.R', contents: rCode }} label="Preview analysis.R" />
)

export const CsvFile: Story = () => (
    <PreviewStory file={{ name: 'results.csv', contents: csv }} label="Preview results.csv" />
)

// Before contents have loaded the modal shows a centered loader.
export const Loading: Story = () => (
    <PreviewStory file={{ name: 'analysis.R', contents: null }} label="Preview (loading)" />
)
