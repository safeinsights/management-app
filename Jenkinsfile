@Library('jenkins-shared-library@main') _
pipeline {
    agent { label "jenkins" }

    // PR previews, their teardown and the nightly reaper run in GitHub Actions
    // (.github/workflows/deploy-preview.yml). Jenkins deploys only main and release tags.
    stages {
        stage("Deploy") {
            when {
                anyOf {
                    branch 'main'
                    tag 'v*'
                }
            }
            steps {
                // The deploy reports URLs back to GitHub, which needs a token in the environment. 'github-app-safeinsights' is the GitHub App the Branch Source plugin
                // already uses to post build statuses; the plugin exchanges the app key for a
                // short-lived installation token, exposed here as the password.
                //
                // Do not add `printenv` to this step: it would echo the token into the build log.
                withCredentials([usernamePassword(
                    credentialsId: 'github-app-safeinsights',
                    usernameVariable: 'GITHUB_APP_USER',
                    passwordVariable: 'GITHUB_TOKEN'
                )]) {
                    sh """
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
}
