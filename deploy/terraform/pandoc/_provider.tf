provider "aws" {
  region = var.region

  assume_role {
    role_arn = "arn:aws:iam::${var.account}:role/ci-role"
  }

  default_tags {
    tags = {
      Environment       = var.environment
      Terraform         = "true"
      Terraform_Project = local.service_name
      Service           = local.service_name
    }
  }
}

terraform {
  required_version = ">= 1.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 4.0"
    }
  }
  backend "s3" {
    encrypt        = true
    bucket         = "lumen-terraform-state"
    dynamodb_table = "lumen-terraform-state-lock"
    region         = "us-west-2"
    role_arn       = "arn:aws:iam::824635284302:role/terraform"
  }
}
