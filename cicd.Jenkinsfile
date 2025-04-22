pipeline {
    agent { label "jenkins" }

    stages {
        stage("Deploy") {
            steps {
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
