resource "aws_ssm_parameter" "LIVEPOLL_USE_INSECURE_HTTP" {
  name  = "${local.parameter_store_prefix}/LIVEPOLL_USE_INSECURE_HTTP"
  type  = "SecureString"
  value = "true" # initial value only, updates not handled in terraform

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "LIVEPOLL_PASSWORD" {
  name  = "${local.parameter_store_prefix}/LIVEPOLL_PASSWORD"
  type  = "SecureString"
  value = "replace_me" # initial value only, updates not handled in terraform

  lifecycle {
    ignore_changes = [value]
  }
}