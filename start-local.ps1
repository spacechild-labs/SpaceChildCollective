$env:DATABASE_URL="postgresql://spacechild:spacechild@localhost:5432/spacechild_collective"
$env:SESSION_SECRET="spacechild-dev-secret-local"
$env:ENABLE_TASK_DISPATCHER="true"
$env:NODE_ENV="development"
$env:PORT="5001"
Set-Location "C:\Users\nickf\Source\SpaceChildCollective"
npx tsx server/index.ts
