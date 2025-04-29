@Library('jenkins-shared-library@main') _
pipeline {
    agent { label "jenkins" }

    stages {
        stage("Deploy") {
            when {
                anyOf {
                    branch 'main'
                    branch 'PR-*'
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
