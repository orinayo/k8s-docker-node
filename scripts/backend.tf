# Sets the "backend" used to store Terraform state.
# This is required to make continous delivery work.

terraform {
    backend "azurerm" {
        resource_group_name  = "orinayobitbucket"
        storage_account_name = "orinayobitbucket"
        container_name       = "orinayobitbucket"
        key                  = "terraform.tfstate"
    }
}