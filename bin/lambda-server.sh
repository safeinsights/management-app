#!/bin/bash

set -e

[ ! -d '/tmp/cache' ] && mkdir -p /tmp/cache

export PORT=8080

exec node server.js
