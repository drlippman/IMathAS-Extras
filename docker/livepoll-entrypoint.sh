#!/bin/bash
set -eo pipefail

# Required environment variables:
# - PARAMETER_STORE_PREFIX_LIST: Comma-separated list of paths in SSM Parameter Store from which environment variables are pulled.
#                                If items from multiple paths conflict, the later one is used.

# https://www.geekcafe.com/blog/how-to-load-parameter-store-values-into-an-ec2s-environment-variables
setup_parameter_store() {
    PREFIX=$1

    parameters=$(aws ssm get-parameters-by-path \
        --path "${PREFIX}" \
        --region ${AWS_REGION} \
        --with-decrypt \
        )
    success=$?

    if [ $success -eq 0 ]; then
        # bail if no parameters found
        param_count=$(echo "$parameters" | jq '.Parameters | length')
        if [ $param_count -eq 0 ]; then
            echo "No parameters found in '${PREFIX}!'"
            exit 1
        fi

        # split("/")[-1] will grab the last token as the "name" for the env variable
        export_statement=$(echo "$parameters" \
            | jq -r '.Parameters[] | "echo \"Pulling from " + .Name + "\"; export " + (.Name | split("/")[-1]) + "=\"" + .Value + "\""' \
        )
        sorted=$(echo "$export_statement" | sort)

        # eval the export strings
        eval "$sorted"
    else
        echo "Failed to retrieve AWS SSM Parameters from '${PREFIX}!'"
        exit 1
    fi
}

if [ ! -z ${PARAMETER_STORE_PREFIX_LIST} ]; then
    prefixes=$(echo $PARAMETER_STORE_PREFIX_LIST | tr "," "\n")

    for prefix in $prefixes
        do
            setup_parameter_store $prefix
        done
    
else
    echo "PARAMETER_STORE_PREFIX_LIST is not set, skipping parameter store setup."
fi

# Then exec the container's main process (what's set as CMD in the Dockerfile).
exec "$@"