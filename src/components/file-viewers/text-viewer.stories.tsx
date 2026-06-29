import type { Story } from '@ladle/react'
import { Box } from '@mantine/core'
import { textViewer } from './text-viewer'

// textViewer is the fallback viewer: it renders any text verbatim in a scrollable
// monospace Code block, preserving whitespace and wrapping long lines.
const meta = { title: 'File viewers / Text viewer' }
export default meta

const paragraph = `This study examines treatment outcomes across two patient cohorts.

The analysis pipeline cleans the raw extract, fits a logistic regression model,
and produces summary statistics grouped by treatment arm. All personally
identifying fields are stripped before any output leaves the secure enclave.

Results are written to summary.csv and validated against the pre-registered
analysis plan.`

const requirementsTxt = `pandas==2.2.0
scikit-learn==1.4.0
numpy==1.26.4
pyarrow==15.0.0
`

export const Paragraph: Story = () => <Box p="xl">{textViewer('README.txt', paragraph)}</Box>

export const PlainList: Story = () => <Box p="xl">{textViewer('requirements.txt', requirementsTxt)}</Box>
