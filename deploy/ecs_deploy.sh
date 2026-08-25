#!/bin/bash
#
# This script:
#   - deploys a docker image to an ECS environment
#
# Required environment variables:
#   - GITHUB_WORKFLOW           - provided by GHA
#   - GITHUB_RUN_NUMBER         - provided by GHA
#   - GITHUB_RUN_ATTEMPT        - provided by GHA
#   - GITHUB_SHA                - provided by GHA

set -euox pipefail

export AWS_ECR_IMAGE_TAG=gha-tree-$(git rev-parse HEAD:)
export VERSION_LABEL=gha-build-$GITHUB_WORKFLOW-$GITHUB_RUN_NUMBER-$GITHUB_RUN_ATTEMPT

while [[ $# -gt 0 ]]; do
  case $1 in
	-c|--cluster-name)
      ECS_CLUSTER_NAME="$2"
      shift # past argument
      shift # past value
      ;;
	-s|--ssm-prefix)
      SSM_PREFIX="$2"
      shift # past argument
      shift # past value
      ;;
	-n|--account-number)
    AWS_CI_ACCOUNT="$2"
    shift # past argument
    shift # past value
    ;;
  -p|--project-name)
    PROJECT_NAME="$2"
    shift
    shift
    ;;
  -*|--*)
    echo "Unknown option $1"
    exit 1
    ;;
  esac
done

ECS_SERVICE_NAME="${ECS_CLUSTER_NAME}"
ECR_REPOSITORY="${PROJECT_NAME}"
CONTAINER_NAME="${PROJECT_NAME}"

echo -e "\n============================================================"
echo "  Beginning deployment to AWS Fargate environment: $ECS_CLUSTER_NAME $ECS_SERVICE_NAME"
echo -e "============================================================\n"

# Deploy the latest image to Fargate for the webapp
docker run -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN \
 fabfuel/ecs-deploy:1.15.0 ecs deploy --region us-west-2 --no-deregister --timeout 600 --rollback \
 -i ${CONTAINER_NAME} $AWS_CI_ACCOUNT.dkr.ecr.us-west-2.amazonaws.com/$ECR_REPOSITORY:$AWS_ECR_IMAGE_TAG \
 -e ${CONTAINER_NAME} PARAMETER_STORE_PREFIX_LIST ${SSM_PREFIX} \
 -e ${CONTAINER_NAME} AWS_REGION us-west-2 \
 $ECS_CLUSTER_NAME $ECS_SERVICE_NAME
