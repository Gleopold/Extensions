# Registers the native messaging host with Chrome (current user only).
# Re-run this if you move the YTAudio folder.
$name = 'com.lggpl.ytaudio'
$extId = 'empmeechnohbocnfmhakgbimgifbkobn'
$manifestPath = Join-Path $PSScriptRoot "$name.json"

@{
    name            = $name
    description     = 'yt-dlp audio downloader'
    path            = (Join-Path $PSScriptRoot 'host.bat')
    type            = 'stdio'
    allowed_origins = @("chrome-extension://$extId/")
} | ConvertTo-Json | Set-Content -Path $manifestPath -Encoding ascii

$key = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$name"
New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name '(default)' -Value $manifestPath
"Registered $name -> $manifestPath"
