@Library('jenkins-shared-library@main') _
pipeline {
    agent { label "jenkins" }

    stages {
        stage("Deploy") {
            steps {
                script {
                    env.COMMIT_MESSAGE = git.getCommitMessage(env.GIT_COMMIT)
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
