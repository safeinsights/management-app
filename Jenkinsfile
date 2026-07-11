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

                    // try two common patterns: "Merge pull request #123" or any "#123"
                    def prMatcher = (commitMsg =~ /Merge pull request #(\d+)/)

                    if (prMatcher) {
                        // the first capturing group is the number
                        env.MERGED_PR_NUMBER = prMatcher[0][1]
                        echo "Found merged PR number: ${env.MERGED_PR_NUMBER}"
                    } else {
                        echo "Not a merge commit"
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
