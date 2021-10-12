# Creates an RSA key we'll use as credentials for our Kubernetes cluster.

resource "tls_private_key" "key" {
    algorithm = "RSA"
}