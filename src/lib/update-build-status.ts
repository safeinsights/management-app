import { Octokit } from '@octokit/rest'
import minimist from 'minimist'
import { fileURLToPath } from 'url'

type BuildNDeployStatus = {
    success: boolean
    error: string
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
        const url = st.success ? `[Preview Link](https://pr${this.prNumber}.dev.safeinsights.org/)` : ''

        const comment = `${COMMENT_HEADING} ${st.success ? '✅' : '❌'}\n\n${url}\n\n${st.error || ''}`
        const { data: comments } = await this.octokit.issues.listComments({
            owner: this.owner,
            repo: this.repo,
            issue_number: this.prNumber,
        })

        const buildStatusComment = comments.find((comment) => comment.body?.startsWith(COMMENT_HEADING))

        if (buildStatusComment) {
            await this.octokit.issues.updateComment({
                owner: this.owner,
                repo: this.repo,
                comment_id: buildStatusComment.id,
                body: comment,
            })
        } else {
            await this.octokit.issues.createComment({
                owner: this.owner,
                repo: this.repo,
                issue_number: this.prNumber,
                body: comment,
            })
        }
    }
}

const __filename = fileURLToPath(import.meta.url)
if (process.argv[1] === __filename) {
    const args = minimist(process.argv.slice(2))
    const { token, prNum, success, error } = args

    if (!token || !prNum) {
        console.error('Usage: node <script> --token <token> --prNum <buildStatus>') // eslint-disable-line no-console -- auto-added while upgrading
        process.exit(1)
    }

    const manager = new BuildStatusUpdater(token, prNum)
    manager
        .update({
            success: success != null || !error,
            error,
        })
        .catch((error) => {
            console.error('Operation failed:', error) // eslint-disable-line no-console -- auto-added while upgrading
            process.exit(1)
        })
}
