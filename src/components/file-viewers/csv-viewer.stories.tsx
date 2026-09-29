import type { Story } from '@ladle/react'
import { Box } from '@mantine/core'
import { csvViewer } from './csv-viewer'

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

const headersOnlyCsv = `patient_id,age,treatment_group,outcome
`

export const Typical: Story = () => <Box p="xl">{csvViewer('results.csv', typicalCsv)}</Box>

export const SingleRow: Story = () => <Box p="xl">{csvViewer('summary.csv', singleRowCsv)}</Box>

export const HeadersOnly: Story = () => <Box p="xl">{csvViewer('empty-results.csv', headersOnlyCsv)}</Box>

const wideCsv = `tasks_task_id,tasked_type,number,first_completed_at,last_completed_at,group_type,created_at,updated_at
614101454928577280,Exercise,1,2023-01-09 14:05:21.267016,2023-01-09 14:05:21.267016,core,2023-01-09 14:05:21.267016,2023-01-09 14:05:21.267016
614101454928577281,Reading,2,2023-01-10 09:12:03.100000,2023-01-11 10:44:59.000000,personalized,2023-01-10 09:12:03.100000,2023-01-11 10:44:59.000000
`

export const WideSingleRow: Story = () => <Box p="xl">{csvViewer('tutor_results.csv', wideCsv)}</Box>
