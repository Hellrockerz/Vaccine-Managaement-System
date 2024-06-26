pipeline {
    agent any
    environment {
        PROJECT_NAME = 'Vaccine Management System'
        GIT_REPO = 'https://github.com/Hellrockerz/Vaccine-Management-System.git'
        BUILD_STATUS = '#'
    }
    stages {
        stage('Checkout') {
            steps {
                script {
                    try {
                        // Clone the repository
                        git url: env.GIT_REPO, branch: 'main'
                    } catch (Exception e) {
                        env.BUILD_STATUS = 'FAILURE'
                        throw e
                    }
                }
            }
        }
        stage('Install Dependencies') {
            steps {
                script {
                    try {
                        // Install project dependencies
                        bat 'npm install'
                    } catch (Exception e) {
                        env.BUILD_STATUS = 'FAILURE'
                        throw e
                    }
                }
            }
        }
        stage('Install PM2') {
            steps {
                script {
                    try {
                        // Install PM2 globally
                        bat 'npm install -g pm2'
                    } catch (Exception e) {
                        env.BUILD_STATUS = 'FAILURE'
                        throw e
                    }
                }
            }
        }
        stage('Deploy') {
            steps {
                script {
                    try {
                        // Restart the application using PM2
                        bat 'pm2 restart index.js'
                        // Set the build status to SUCCESS
                        env.BUILD_STATUS = 'SUCCESS'
                    } catch (Exception e) {
                        // Set the build status to FAILURE if any command fails
                        env.BUILD_STATUS = 'FAILURE'
                        throw e
                    }
                }
            }
        }
    }
}
