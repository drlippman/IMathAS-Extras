locals {
  service_name                  = "pandoc"
  parameter_store_prefix        = "/lumen-services/${var.region}/${var.environment}/${local.service_name}"
  parameter_store_prefix_webapp = "${local.parameter_store_prefix}/webapp"
}