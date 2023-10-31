#!/bin/bash

sudo rm -rf /usr/local/go
wget https://go.dev/dl/go1.21.3.linux-amd64.tar.gz -O go.tar.gz
sudo tar -C /usr/local -xzf go.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc