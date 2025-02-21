import { Octokit } from '@octokit/rest'
import minimist from 'minimist'
import { fileURLToPath } from 'url'

type BuildNDeployStatus = {
    pass: boolean
    error: string
    deployURL?: string
}

const COMMENT_HEADING = '### BUILD STATUS'

export class BuildStatusUpdater {
    private octokit: Octokit
    private owner = 'safeinsights'
    private repo = 'management-app'
    private prNumber: number

    constructor(authToken: string, prNumber: number) {
        this.octokit = new Octokit({ auth: authToken })
        this.prNumber = prNumber
    }

    public async update(st: BuildNDeployStatus): Promise<void> {
        const url = st.deployURL ? `[Preview Link](${st.deployURL})` : ''
        const comment = `${COMMENT_HEADING} ${st.pass ? '✅' : '❌'}\n\n${url}\n\n${st.error}`
        try {
            const { data: comments } = await this.octokit.issues.listComments({
                owner: this.owner,
                repo: this.repo,
                issue_number: this.prNumber,
            })

            const buildStatusComment = comments.find((comment) => comment.body?.startsWith(COMMENT_HEADING))

            if (buildStatusComment) {
                // Update the existing comment
                await this.octokit.issues.updateComment({
                    owner: this.owner,
                    repo: this.repo,
                    comment_id: buildStatusComment.id,
                    body: comment,
                })
            } else {
                // Create a new comment on the PR
                await this.octokit.issues.createComment({
                    owner: this.owner,
                    repo: this.repo,
                    issue_number: this.prNumber,
                    body: comment,
                })
            }
        } catch (error) {
            throw error
        }
    }
}

const __filename = fileURLToPath(import.meta.url)
if (process.argv[1] === __filename) {
    const args = minimist(process.argv.slice(2))
    const { token, prNum, success, error, url } = args

    if (!token || !prNum) {
        console.error('Usage: node <script> --token <token> --prNum <buildStatus>')
        process.exit(1)
    }

    const manager = new BuildStatusUpdater(token, prNum)
    manager
        .update({
            pass: success != null || !error,
            error,
            deployURL: url,
        })
        .catch((error) => {
            console.error('Operation failed:', error)
            process.exit(1)
        })
}
