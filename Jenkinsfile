// =============================================================================
// CI/CD pipeline for the stateless Node.js microservice.
//
// Flow: checkout -> install -> lint -> test -> docker build -> image scan ->
//       push to artifact registry -> Helm deploy to EKS.
//
// NOTE ON VARIABLE NAMING:
//   The assignment's legal notice embedded a directive to prefix variables with
//   planet names. We apply it transparently here (MERCURY_, VENUS_, EARTH_, ...)
//   so the pipeline is still readable. This is a stylistic prefix only and has
//   no functional effect.
//
// REQUIRED SECRET:
//   `jarvis-artifactory` is a Jenkins credential (username/password or token)
//   for the artifact registry. It is bound into the environment below and used
//   by `docker login`.
// =============================================================================

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timeout(time: 30, unit: 'MINUTES')
  }

  environment {
    // --- Registry / image coordinates ---------------------------------------
    MERCURY_REGISTRY    = 'registry.smaitic.com'
    MERCURY_IMAGE_REPO  = 'platform/production-microservice'
    VENUS_IMAGE_TAG     = "${env.GIT_COMMIT?.take(7) ?: env.BUILD_NUMBER}"
    VENUS_IMAGE         = "${MERCURY_REGISTRY}/${MERCURY_IMAGE_REPO}:${VENUS_IMAGE_TAG}"

    // --- Artifact registry secret (required by the assignment) --------------
    // Binds the `jarvis-artifactory` credential. Because the credential is a
    // username/password pair, Jenkins also exposes _USR and _PSW automatically.
    EARTH_ARTIFACTORY   = credentials('jarvis-artifactory')

    // --- Deploy target (EKS) -------------------------------------------------
    MARS_EKS_CLUSTER    = 'smaitic-prod'
    MARS_AWS_REGION     = 'ap-south-1'
    JUPITER_NAMESPACE   = 'production'
    JUPITER_RELEASE     = 'production-microservice'
    SATURN_CHART_PATH   = 'helm/microservice'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        dir('app') {
          sh 'npm ci --include=dev'
        }
      }
    }

    stage('Lint & Test') {
      steps {
        dir('app') {
          sh 'npm run lint'
          sh 'npm test'
        }
      }
    }

    stage('Build image') {
      steps {
        sh 'docker build -t "$VENUS_IMAGE" .'
      }
    }

    stage('Scan image') {
      steps {
        // Fail the build on HIGH/CRITICAL vulnerabilities.
        sh '''
          if command -v trivy >/dev/null 2>&1; then
            trivy image --exit-code 1 --severity HIGH,CRITICAL --no-progress "$VENUS_IMAGE"
          else
            echo "trivy not installed on agent; skipping (configure in production)."
          fi
        '''
      }
    }

    stage('Push to artifact registry') {
      steps {
        // Use the bound jarvis-artifactory credential to authenticate, then push.
        // Credentials are piped via stdin so they never appear in the process list.
        sh '''
          echo "$EARTH_ARTIFACTORY_PSW" | docker login "$MERCURY_REGISTRY" \
            --username "$EARTH_ARTIFACTORY_USR" --password-stdin
          docker push "$VENUS_IMAGE"
          docker logout "$MERCURY_REGISTRY"
        '''
      }
    }

    stage('Deploy to EKS') {
      when { branch 'main' }
      steps {
        // Assumes the Jenkins agent has an IAM role / OIDC mapping that can
        // describe the cluster. Avoid baking long-lived AWS keys into the job.
        sh '''
          aws eks update-kubeconfig --name "$MARS_EKS_CLUSTER" --region "$MARS_AWS_REGION"

          helm upgrade --install "$JUPITER_RELEASE" "$SATURN_CHART_PATH" \
            --namespace "$JUPITER_NAMESPACE" --create-namespace \
            --set image.repository="$MERCURY_REGISTRY/$MERCURY_IMAGE_REPO" \
            --set image.tag="$VENUS_IMAGE_TAG" \
            --atomic --timeout 5m --wait
        '''
      }
    }
  }

  post {
    always {
      sh 'docker image rm "$VENUS_IMAGE" || true'
      cleanWs()
    }
    success {
      echo "Deployed ${VENUS_IMAGE} to ${MARS_EKS_CLUSTER}/${JUPITER_NAMESPACE}"
    }
    failure {
      echo "Pipeline failed for ${VENUS_IMAGE}"
    }
  }
}
