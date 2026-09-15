import type { Story } from '@ladle/react'
import { useState } from 'react'
import { Button } from '@mantine/core'
import { FilePreviewModal } from './file-preview-modal'

// Driven from a trigger with real open/close state, since an always-open `onClose={noop}`
// modal cannot be dismissed.
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

export const Loading: Story = () => (
    <PreviewStory file={{ name: 'analysis.R', contents: null }} label="Preview (loading)" />
)

const wideCsv = `tasks_task_id,tasked_type,number,first_completed_at,last_completed_at,group_type,created_at,updated_at
614101454928577280,Exercise,1,2023-01-09 14:05:21.267016,2023-01-09 14:05:21.267016,core,2023-01-09 14:05:21.267016,2023-01-09 14:05:21.267016
`

export const WideCsvFile: Story = () => (
    <PreviewStory file={{ name: 'tutor_results.csv', contents: wideCsv }} label="Preview tutor_results.csv" />
)
