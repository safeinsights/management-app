import type { Story } from '@ladle/react'
import { Box } from '@mantine/core'
import { csvViewer } from './csv-viewer'

// csvViewer parses CSV text (header row + data rows) and renders a Mantine
// DataTable. It returns null for non-.csv paths or empty content, so every story
// passes a .csv path and inline CSV text.
const meta = { title: 'File viewers / Csv viewer' }
export default meta

const typicalCsv = `patient_id,age,treatment_group,outcome
1001,42,control,0
1002,57,treatment,1
1003,29,treatment,0
1004,63,control,1
1005,48,treatment,1
1006,35,control,0
`

const singleRowCsv = `metric,value
total_patients,1240
`

// A header row only — DataTable renders the columns with an empty body.
const headersOnlyCsv = `patient_id,age,treatment_group,outcome
`

export const Typical: Story = () => <Box p="xl">{csvViewer('results.csv', typicalCsv)}</Box>

export const SingleRow: Story = () => <Box p="xl">{csvViewer('summary.csv', singleRowCsv)}</Box>

export const HeadersOnly: Story = () => <Box p="xl">{csvViewer('empty-results.csv', headersOnlyCsv)}</Box>
