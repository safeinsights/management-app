pipeline {
    agent { label "jenkins" }

    stages {
        stage("Deploy") {
            steps {
                sh """
                    printenv

                    aws sts get-caller-identity
                    read AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN <<< \$(
                    aws sts assume-role \
                        --role-arn arn:aws:iam::872515273917:role/SafeInsights-DevDeploy \
                        --role-session-name Session \
                        --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" \
                        --output text
                    )

                    export AWS_ACCESS_KEY_ID
                    export AWS_SECRET_ACCESS_KEY
                    export AWS_SESSION_TOKEN
                    aws sts get-caller-identity

                    aws s3 sync s3://si-mgmt-app-build/scripts ./cicd
                    cd cicd
                    unzip *.zip
                    npm install

                    node deploy.mjs --environment Dev --releaseSha=${COMMIT_SHA} --prNumber=${CHANGE_ID}
                """
            }
        }
    }
}
