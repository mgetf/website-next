# Replace the local Docker Postgres database with a dump of production.
#
# Credentials are never stored in this file. The script reads DATABASE_PUBLIC_URL
# from the Railway CLI (your logged-in session) and passes it only as a process
# environment variable for the duration of pg_dump.
#
# Requires:
#   - Railway CLI, logged in, with this repo linked to the mge.tf project
#   - Docker, with the local Postgres container already running
#
# Usage:
#   .\scripts\refresh-local-db.ps1
#   .\scripts\refresh-local-db.ps1 -Yes
#
# Drops the local database and restores the dump in place. Constraint errors
# in the dump (orphan foreign keys, for example) are printed and ignored.

[CmdletBinding()]
param(
  [string]$RailwayService = 'postgres-website',
  [string]$RailwayEnvironment = 'production',
  [string]$ExpectedProject = 'mge.tf',
  [string]$LocalContainer = 'mgetf-postgres',
  [string]$LocalUser = 'postgres',
  [string]$LocalDatabase = 'mgetf',
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-LastExit {
  param([string]$Message)
  if ($LASTEXITCODE -ne 0) {
    throw $Message
  }
}

function Join-NativeOutput {
  param($Output)
  return (@($Output) -join "`n")
}

function Assert-SafeName {
  param([string]$Value, [string]$Label)
  if ($Value -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
    throw "$Label must be a plain identifier (letters, numbers, underscore)."
  }
}

function Assert-SafeToken {
  param([string]$Value, [string]$Label)
  if ($Value -notmatch '^[A-Za-z0-9_.-]+$') {
    throw "$Label contains unsupported characters."
  }
}

function Invoke-LocalPsql {
  param([string]$Database, [string]$Sql)
  & docker exec $LocalContainer psql -U $LocalUser -d $Database -v ON_ERROR_STOP=1 -q -c $Sql
  Assert-LastExit "psql failed against local database '$Database'."
}

Assert-SafeName $LocalUser 'LocalUser'
Assert-SafeName $LocalDatabase 'LocalDatabase'
Assert-SafeToken $LocalContainer 'LocalContainer'
Assert-SafeToken $RailwayService 'RailwayService'
Assert-SafeToken $RailwayEnvironment 'RailwayEnvironment'
Assert-SafeToken $ExpectedProject 'ExpectedProject'

if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
  throw "Railway CLI is not on PATH. Install it and run 'railway login'."
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is not on PATH."
}

$containerRunning = & docker inspect -f '{{.State.Running}}' $LocalContainer 2>$null
if ($LASTEXITCODE -ne 0 -or ([string]$containerRunning).Trim() -ne 'true') {
  throw "Container '$LocalContainer' is not running. Start local Postgres before refreshing."
}

Write-Host "Checking linked Railway project..."
$statusJson = Join-NativeOutput (& railway status --json)
Assert-LastExit "Could not read Railway status. Run 'railway login' and link this repo to $ExpectedProject."
$linkedProject = ($statusJson | ConvertFrom-Json).name
if ($linkedProject -ne $ExpectedProject) {
  throw "Linked Railway project is '$linkedProject', expected '$ExpectedProject'. Run 'railway link' in this repo."
}

if (-not $Yes) {
  Write-Host ""
  Write-Host "This downloads $RailwayEnvironment/$RailwayService, deletes local database '$LocalDatabase' in container '$LocalContainer', and restores the dump over it."
  $answer = Read-Host "Continue? [y/N]"
  if ($answer -notmatch '^(y|yes)$') {
    Write-Host "Cancelled."
    exit 1
  }
}

Write-Host "Reading the production connection string from Railway..."
$variableJson = Join-NativeOutput (& railway variable list --service $RailwayService --environment $RailwayEnvironment --json)
Assert-LastExit "Could not read variables for $RailwayEnvironment/$RailwayService."
$variables = $variableJson | ConvertFrom-Json
$prodUrl = [string]$variables.DATABASE_PUBLIC_URL
if ([string]::IsNullOrWhiteSpace($prodUrl)) {
  throw "DATABASE_PUBLIC_URL is empty on $RailwayEnvironment/$RailwayService. The public TCP proxy has to be enabled."
}
if ($prodUrl -notmatch '^postgres(ql)?://') {
  throw "DATABASE_PUBLIC_URL is not a Postgres URL."
}
if ($prodUrl -notmatch 'sslmode=') {
  if ($prodUrl.Contains('?')) {
    $prodUrl += '&sslmode=require'
  } else {
    $prodUrl += '?sslmode=require'
  }
}

$dumpPath = '/tmp/mgetf-prod.dump'
$previousUrl = $env:MGETF_PROD_DATABASE_URL

try {
  $env:MGETF_PROD_DATABASE_URL = $prodUrl
  # Clear the local copy so later errors cannot print it by accident.
  $prodUrl = $null
  $variableJson = $null
  $variables = $null

  Write-Host "Dumping production into the local container (this can take a few minutes)..."
  # Single-quoted so PowerShell does not expand the URL onto the docker command line.
  # The container shell reads it from the environment variable passed with -e.
  $dumpCommand = 'pg_dump --dbname="$MGETF_PROD_DATABASE_URL" --format=custom --no-owner --no-acl --file=' + $dumpPath
  & docker exec -e MGETF_PROD_DATABASE_URL $LocalContainer sh -c $dumpCommand
  Assert-LastExit "pg_dump failed. Local database '$LocalDatabase' was not changed."

  Write-Host "Dropping local database '$LocalDatabase'..."
  Invoke-LocalPsql 'postgres' "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('$LocalDatabase', '${LocalDatabase}_incoming', '${LocalDatabase}_previous') AND pid <> pg_backend_pid();"
  Invoke-LocalPsql 'postgres' "DROP DATABASE IF EXISTS ${LocalDatabase}_incoming;"
  Invoke-LocalPsql 'postgres' "DROP DATABASE IF EXISTS ${LocalDatabase}_previous;"
  Invoke-LocalPsql 'postgres' "DROP DATABASE IF EXISTS $LocalDatabase;"
  Invoke-LocalPsql 'postgres' "CREATE DATABASE $LocalDatabase;"

  Write-Host "Restoring dump into '$LocalDatabase'..."
  # No --exit-on-error: production has rows that violate foreign keys. Keep going.
  & docker exec $LocalContainer pg_restore -U $LocalUser --no-owner --no-acl --jobs=4 --dbname=$LocalDatabase $dumpPath
  if ($LASTEXITCODE -gt 1) {
    throw "pg_restore failed (exit $LASTEXITCODE)."
  }
  if ($LASTEXITCODE -eq 1) {
    Write-Host "Restore finished with errors. Data is loaded; some constraints were skipped."
  }

  Write-Host "Local database '$LocalDatabase' now matches $RailwayEnvironment/$RailwayService."
  Write-Host "Restart the dev server if it was connected while the database was dropped."
} finally {
  & docker exec $LocalContainer rm -f $dumpPath 2>$null | Out-Null
  if ($null -eq $previousUrl) {
    Remove-Item Env:MGETF_PROD_DATABASE_URL -ErrorAction SilentlyContinue
  } else {
    $env:MGETF_PROD_DATABASE_URL = $previousUrl
  }
}
