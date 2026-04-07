#!/bin/bash
set -e

echo "************************************************************************************"
echo "**************************** Hyperledger Explorer **********************************"
echo "************************************************************************************"

export LOG_LEVEL_APP=debug
export LOG_LEVEL_DB=debug
export LOG_LEVEL_CONSOLE=info
export LOG_CONSOLE_STDOUT=true
export DISCOVERY_AS_LOCALHOST=false
export EXPLORER_APP_ROOT=app

cd /opt/explorer

echo "Waiting for database to be ready..."
for i in {1..30}; do
    if PGPASSWORD=password pg_isready -h explorerdb.mynetwork.com -p 5432 -U hppoc -d fabricexplorer >/dev/null 2>&1; then
        echo "Database is ready!"
        break
    fi
    echo "Waiting for database... ($i/30)"
    sleep 2
done

echo "Running database sync to initialize tables..."
# Run sync to initialize database - this creates the tables
node app/sync.js || echo "Sync completed with warnings or will retry on restart"

echo "Starting Explorer application..."
exec node app/main.js
