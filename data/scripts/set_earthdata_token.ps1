# Saves an Earthdata user token to your Windows user environment (HKCU\Environment).
# The token is typed into a hidden prompt; nothing is printed, logged or written to disk elsewhere.
$secure = Read-Host -Prompt "Paste your Earthdata token (input is hidden), then press Enter" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ([string]::IsNullOrWhiteSpace($plain)) { Write-Host "Nothing entered. No change made."; exit 1 }
[Environment]::SetEnvironmentVariable('EARTHDATA_TOKEN', $plain.Trim(), 'User')
$plain = $null
$ok = [bool][Environment]::GetEnvironmentVariable('EARTHDATA_TOKEN','User')
Write-Host ("Saved to your user environment: " + $ok)
