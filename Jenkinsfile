@Library('jenkins-shared-library@main') _
pipeline {
    agent { label "jenkins" }

    // Nightly reaper: sweep every PR preview whose GitHub PR is closed/merged. Every branch the
    // multibranch job tracks gets this timer, but the reaper stage's `when` gates it to main + a
    // timer cause, so the sweep runs once per night, not once per PR branch. (Passing a conditional
    // empty cron spec here would throw in some Jenkins versions, so the schedule is unconditional.)
    triggers {
        cron('H 2 * * *')
    }

    stages {
        // Nightly (timer-triggered) reap of orphaned PR previews. This is the self-healing backstop
        // for PRs closed without merging, whose teardown never runs on a push.
        stage("Reap PR previews") {
            when {
                allOf {
                    branch 'main'
                    triggeredBy 'TimerTrigger'
                }
            }
            steps {
                sh """
                    [ -d ./cicd ] && find ./cicd -maxdepth 1 -name '*.zip' -delete
                    aws s3 sync s3://si-mgmt-app-build/scripts ./cicd
                    cd cicd
                    unzip -o *.zip
                    REAP=1 ./deploy
                """
            }
        }

        stage("Deploy") {
            when {
                allOf {
                    // A timer-triggered build is handled by the reaper stage above; skip the deploy.
                    not { triggeredBy 'TimerTrigger' }
                    anyOf {
                        branch 'main'
                        branch 'PR-*'
                        tag 'v*'
                    }
                }
            }
            steps {
                script {
                    def commitMsg = sh(
                        script: "git log -1 --format=%B ${env.GIT_COMMIT}",
                        returnStdout: true
                    ).trim()

                    echo "Commit message:"
                    echo commitMsg
                    env.COMMIT_MESSAGE = commitMsg

                    // Merge detection only makes sense on the main build: that's where the merge/squash
                    // commit lands. A PR-* build checks out refs/pull/N/head (the PR's own head commit,
                    // never a merge), and its CHANGE_ID already drives a preview deploy — so looking for
                    // a merge there both never matches and would wrongly compete with the preview deploy.
                    if (env.BRANCH_NAME == 'main') {
                        // GitHub merge-commit messages: "Merge pull request #123 ...". GitHub
                        // squash/rebase merges instead append "(#123)" to the (usually first) line.
                        def merge = (commitMsg =~ /Merge pull request #(\d+)/)
                        def squash = (commitMsg =~ /\(#(\d+)\)/)
                        if (merge) {
                            env.MERGED_PR_NUMBER = merge[0][1]
                        } else if (squash) {
                            env.MERGED_PR_NUMBER = squash[0][1]
                        }
                        if (env.MERGED_PR_NUMBER) {
                            echo "Found merged PR number: ${env.MERGED_PR_NUMBER}"
                        } else {
                            echo "No merged PR number in commit message"
                        }
                    }
                }
                sh """
                    printenv
                    [ -d ./cicd ] && find ./cicd -maxdepth 1 -name '*.zip' -delete
                    aws s3 sync s3://si-mgmt-app-build/scripts ./cicd
                    cd cicd
                    unzip -o *.zip
                    ./deploy
                """
            }
        }
    }
}
