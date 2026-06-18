import type { Story } from '@ladle/react'
import { Box } from '@mantine/core'
import { logViewer } from './log-viewer'

// logViewer parses a JSON array of { timestamp, message } entries and renders a
// two-column (time / message) table. It returns null for anything that is not a
// non-empty JSON array, so the fixtures below are JSON strings built from arrays.
const meta = { title: 'File viewers / Log viewer' }
export default meta

const baseTime = Date.parse('2026-06-02T14:30:00.000Z')
const at = (offsetSeconds: number) => baseTime + offsetSeconds * 1000

const runLog = JSON.stringify([
    { timestamp: at(0), message: 'Starting job runner for study cohort-2026-06' },
    { timestamp: at(2), message: 'Pulling container image safeinsights/r-runner:latest' },
    { timestamp: at(11), message: 'Mounting workspace files: main.R, helpers.R, data-prep.py' },
    { timestamp: at(12), message: 'Executing main.R' },
    { timestamp: at(48), message: 'Wrote results to /workspace/output/summary.csv' },
    { timestamp: at(49), message: 'Job completed successfully (exit code 0)' },
])

const errorLog = JSON.stringify([
    { timestamp: at(0), message: 'Starting job runner for study cohort-2026-06' },
    { timestamp: at(3), message: 'Executing main.R' },
    {
        timestamp: at(7),
        message: 'Error in read.csv("patients.csv") : cannot open file \'patients.csv\': No such file or directory',
    },
    { timestamp: at(7), message: 'Execution halted' },
    { timestamp: at(8), message: 'Job failed (exit code 1)' },
])

const longMessageLog = JSON.stringify([
    { timestamp: at(0), message: 'Validation report follows' },
    {
        timestamp: at(1),
        message:
            'Warning: 14 rows were dropped during cleaning because the systolic_bp column contained values outside the plausible physiological range (40-300 mmHg); these rows have been excluded from all downstream summary statistics and the fitted model. Review the source extract if this count is unexpected.',
    },
])

export const RunLog: Story = () => <Box p="xl">{logViewer('run.log', runLog)}</Box>

export const ErrorLog: Story = () => <Box p="xl">{logViewer('run.log', errorLog)}</Box>

// A long message exercises the wrapping / pre-wrap behaviour of the message cell.
export const LongMessage: Story = () => <Box p="xl">{logViewer('run.log', longMessageLog)}</Box>
