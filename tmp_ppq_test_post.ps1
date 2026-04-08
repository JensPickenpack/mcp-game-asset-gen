$envPath = 'c:\godot\the-silent-choir-of-the-rift\tools\game-asset-mcp\.env'
if (-not (Test-Path $envPath)) { Write-Output "ENV_NOT_FOUND: $envPath"; exit 2 }
$keyLine = Get-Content $envPath | Where-Object { $_ -match '^PPQ_API_KEY=' } | Select-Object -First 1
if (-not $keyLine) { Write-Output 'NO_KEY_LINE'; exit 2 }
$key = ($keyLine -replace '^PPQ_API_KEY=', '').Trim()
if ([string]::IsNullOrWhiteSpace($key)) { Write-Output 'NO_KEY'; exit 2 }
$headers = @{ Authorization = "Bearer $key"; 'Content-Type' = 'application/json' }
$json = '{"model":"gpt-image-1","prompt":"Test small sprite: single dark circle, transparent background","n":1,"size":"256x256","quality":"low"}'
try {
  $r = Invoke-RestMethod -Uri 'https://api.ppq.ai/v1/images/generations' -Method Post -Headers $headers -Body $json -TimeoutSec 90
  Write-Output 'HTTP_OK'
  $r | ConvertTo-Json -Depth 10
} catch {
  Write-Output ('ERROR: ' + $_.Exception.Message)
  if ($_.Exception.Response -ne $null) {
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    Write-Output 'BODY:'
    Write-Output $reader.ReadToEnd()
  }
  exit 1
}