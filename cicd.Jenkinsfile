pipeline {
    agent { label "jenkins" }

    stages {
        stage("Deploy") {
            steps {
                sh """
                    printenv

                    aws s3 sync s3://si-mgmt-app-build/scripts ./cicd
                    cd cicd
                    unzip *.zip
                    ./deploy
                """
            }
        }
    }
}
