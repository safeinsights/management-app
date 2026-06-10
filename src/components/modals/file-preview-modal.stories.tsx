import type { Story } from '@ladle/react'
import { FilePreviewModal } from './file-preview-modal'

// FilePreviewModal renders an always-open AppModal whose body picks the right
// viewer for the file (by extension/content) and offers a download link. It
// portals into the document body, which is fine in Ladle. Passing a non-null
// `file` opens it; `contents: null` shows the loading state.
const meta = { title: 'File viewers / File preview modal' }
export default meta

const noop = () => {}

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

export const CodeFile: Story = () => <FilePreviewModal file={{ name: 'analysis.R', contents: rCode }} onClose={noop} />

export const CsvFile: Story = () => <FilePreviewModal file={{ name: 'results.csv', contents: csv }} onClose={noop} />

// Before contents have loaded the modal shows a centered loader.
export const Loading: Story = () => <FilePreviewModal file={{ name: 'analysis.R', contents: null }} onClose={noop} />
