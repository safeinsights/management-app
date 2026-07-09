import type { Story } from '@ladle/react'
import { Box } from '@mantine/core'
import { CodeViewer } from './code-viewer'

// CodeViewer is presentational: it takes raw code + a highlight.js language and
// renders syntax-highlighted source inside a scrollable pre block. No fetching,
// so it stories directly with inline fixtures.
const meta = { title: 'File viewers / Code viewer' }
export default meta

const rSnippet = `# Cohort summary statistics
library(dplyr)

patients <- read.csv("patients.csv")

summary <- patients %>%
    filter(age >= 18) %>%
    group_by(treatment_group) %>%
    summarise(
        n = n(),
        mean_age = mean(age, na.rm = TRUE),
        sd_age = sd(age, na.rm = TRUE)
    )

print(summary)
`

const pythonSnippet = `import pandas as pd
from sklearn.linear_model import LogisticRegression


def fit_model(df: pd.DataFrame) -> LogisticRegression:
    """Fit a logistic regression on the cohort features."""
    features = df[["age", "bmi", "systolic_bp"]]
    target = df["outcome"]

    model = LogisticRegression(max_iter=1000)
    model.fit(features, target)
    return model


if __name__ == "__main__":
    cohort = pd.read_parquet("cohort.parquet")
    clf = fit_model(cohort)
    print(f"Score: {clf.score(cohort[['age', 'bmi', 'systolic_bp']], cohort['outcome']):.3f}")
`

const sqlSnippet = `SELECT
    treatment_group,
    COUNT(*) AS n_patients,
    AVG(age) AS mean_age
FROM patients
WHERE age >= 18
GROUP BY treatment_group
ORDER BY n_patients DESC;
`

export const RScript: Story = () => (
    <Box p="xl">
        <CodeViewer code={rSnippet} language="r" fileName="analysis.R" />
    </Box>
)

export const PythonScript: Story = () => (
    <Box p="xl">
        <CodeViewer code={pythonSnippet} language="python" fileName="model.py" />
    </Box>
)

// Without a fileName the header line is omitted.
export const NoFilenameHeader: Story = () => (
    <Box p="xl">
        <CodeViewer code={sqlSnippet} language="sql" />
    </Box>
)
