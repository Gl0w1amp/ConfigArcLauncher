
param(
    [string]$ConfigPath
)

$ErrorActionPreference = 'Stop'

function Write-Result {
    param(
        [bool]$Ok,
        [string]$AppMountPath,
        [string]$AppRuntimePath,
        [string]$ErrorMessage,
        [string]$ResultPath
    )

    $payload = [ordered]@{
        ok = $Ok
        app_mount_path = $AppMountPath
        app_runtime_path = $AppRuntimePath
        error = $ErrorMessage
    }
    $json = $payload | ConvertTo-Json -Compress
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($ResultPath, $json, $utf8NoBom)
}

if (-not $ConfigPath -or -not (Test-Path $ConfigPath)) {
    # Try to write to a fallback log if we can't determine the result path
    $fallbackLog = "$env:TEMP\configarc_vhd_helper_error.log"
    "Missing ConfigPath argument. Args: $($args | Out-String)" | Out-File -FilePath $fallbackLog -Append -Encoding utf8
    exit 1
}

# Read params from JSON
try {
    $paramsContent = Get-Content -Path $ConfigPath -Raw -Encoding UTF8
    $params = $paramsContent | ConvertFrom-Json
} catch {
    $fallbackLog = "$env:TEMP\configarc_vhd_helper_error.log"
    "Failed to read/parse params JSON: $_" | Out-File -FilePath $fallbackLog -Append -Encoding utf8
    exit 1
}

$appBase = $params.app_base
$appPatch = $params.app_patch
$appData = $params.app_data
$option = $params.option
$delta = $params.delta
$result = $params.result_path
$signal = $params.signal_path
$done = $params.done_path


try {
    if (-not (Test-Path $appBase)) { throw "App base VHD not found: $appBase" }
    if (-not (Test-Path $appPatch)) { throw "App patch VHD not found: $appPatch" }
    if (-not (Test-Path $appData)) { throw "AppData VHD not found: $appData" }
    if (-not (Test-Path $option)) { throw "Option VHD not found: $option" }

    if ((Test-Path 'X:\') -or (Test-Path 'Y:\') -or (Test-Path 'Z:\')) {
        throw 'Drive X:, Y:, or Z: is already in use. Please eject or change the assigned drives.'
    }

    function Mount-ToDrive {
    param(
        [string]$ImagePath,
        [string]$DrivePath
    )

    Mount-DiskImage -ImagePath $ImagePath -StorageType VHD -NoDriveLetter -Passthru -Access ReadWrite -Confirm:$false -ErrorAction Stop |
        Get-Disk |
        Get-Partition |
        Where-Object { ($_ | Get-Volume) -ne $Null } |
        Add-PartitionAccessPath -AccessPath $DrivePath -ErrorAction Stop |
        Out-Null
}

function Dismount-Image {
    param([string]$ImagePath)
    if ([string]::IsNullOrWhiteSpace($ImagePath)) {
        return
    }
    try {
        Dismount-DiskImage -ImagePath $ImagePath -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    } catch {
    }
}


$appMountPath = $appPatch
$appRuntimePath = $null
$mountedApp = $false
$mountedAppdata = $false
$mountedOption = $false

    if ($delta -eq '1' -or $delta -eq 'true' -or $delta -eq 'True') {
        $parentDir = Split-Path $appPatch -Parent
        $stem = [System.IO.Path]::GetFileNameWithoutExtension($appPatch)
        $ext = [System.IO.Path]::GetExtension($appPatch)
        if ([string]::IsNullOrWhiteSpace($ext)) {
            $ext = '.vhd'
        }
        $appRuntimePath = Join-Path $parentDir "$stem-runtime$ext"

        Dismount-Image -ImagePath $appRuntimePath
        if (Test-Path $appRuntimePath) {
            Remove-Item $appRuntimePath -Force -ErrorAction SilentlyContinue
        }

        $dpPath = Join-Path $env:TEMP ("configarc_vhd_diskpart_{0}.txt" -f $PID)
        $dpScript = "create vdisk file=`"$appRuntimePath`" parent=`"$appPatch`"`n"
        Set-Content -Path $dpPath -Value $dpScript -Encoding ASCII
        & diskpart.exe /s $dpPath | Out-Null
        Remove-Item $dpPath -Force -ErrorAction SilentlyContinue

        if (-not (Test-Path $appRuntimePath)) {
            throw 'Failed to create runtime VHD'
        }

        $appMountPath = $appRuntimePath
    }

    Mount-ToDrive -ImagePath $appMountPath -DrivePath 'X:\'
    $mountedApp = $true
    Mount-ToDrive -ImagePath $appData -DrivePath 'Y:\'
    $mountedAppdata = $true
    Mount-ToDrive -ImagePath $option -DrivePath 'Z:\'
    $mountedOption = $true

    try {
        Start-Sleep -Milliseconds 300
        $shell = New-Object -ComObject Shell.Application
        $shell.Windows() | Where-Object {
            $_.LocationURL -like 'file:///X:*' -or $_.LocationURL -like 'file:///X:/*' -or
            $_.LocationURL -like 'file:///Y:*' -or $_.LocationURL -like 'file:///Y:/*' -or
            $_.LocationURL -like 'file:///Z:*' -or $_.LocationURL -like 'file:///Z:/*'
        } | ForEach-Object { $_.Quit() }
    } catch {
    }

    Write-Result $true $appMountPath $appRuntimePath $null $result
} catch {
    $e = $_
    $fallbackLog = "$env:TEMP\configarc_vhd_helper_error.log"
    try {
        "$(Get-Date) - Error occurred" | Out-File -FilePath $fallbackLog -Append -Encoding utf8
        $e | Out-String | Out-File -FilePath $fallbackLog -Append -Encoding utf8
    } catch {}

    if ($mountedOption) {
        Dismount-Image -ImagePath $option
    }
    if ($mountedAppdata) {
        Dismount-Image -ImagePath $appData
    }
    if ($mountedApp) {
        Dismount-Image -ImagePath $appMountPath
    }
    if ($appRuntimePath) {
        Dismount-Image -ImagePath $appRuntimePath
        if (Test-Path $appRuntimePath) {
            Remove-Item $appRuntimePath -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Result $false $null $null $_.Exception.Message $result
    exit 1
}

while (-not (Test-Path $signal)) {
    Start-Sleep -Milliseconds 500
}

try {
    Dismount-Image -ImagePath $option
    Dismount-Image -ImagePath $appData
    Dismount-Image -ImagePath $appMountPath
    if ($appRuntimePath) {
        Dismount-Image -ImagePath $appRuntimePath
        if (Test-Path $appRuntimePath) {
            Remove-Item $appRuntimePath -Force -ErrorAction SilentlyContinue
        }
    }
} catch {
}

Set-Content -Path $done -Value '1' -Encoding ASCII
