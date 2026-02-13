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

$appBase = $null
$appPatch = $null
$appData = $null
$option = $null
$delta = '1'
$result = $null
$signal = $null
$done = $null

for ($i = 0; $i -lt $args.Length; $i++) {
    $key = $args[$i]
    switch ($key) {
        '--base' { $appBase = $args[$i + 1]; $i++ }
        '--patch' { $appPatch = $args[$i + 1]; $i++ }
        '--appdata' { $appData = $args[$i + 1]; $i++ }
        '--option' { $option = $args[$i + 1]; $i++ }
        '--delta' { $delta = $args[$i + 1]; $i++ }
        '--result' { $result = $args[$i + 1]; $i++ }
        '--signal' { $signal = $args[$i + 1]; $i++ }
        '--done' { $done = $args[$i + 1]; $i++ }
    }
}

if (-not $appBase -or -not $appPatch -or -not $appData -or -not $option -or -not $result -or -not $signal -or -not $done) {
    Write-Result $false $null $null 'Missing arguments' $result
    exit 1
}

if (-not (Test-Path $appBase)) {
    Write-Result $false $null $null "App base VHD not found: $appBase" $result
    exit 1
}
if (-not (Test-Path $appPatch)) {
    Write-Result $false $null $null "App patch VHD not found: $appPatch" $result
    exit 1
}
if (-not (Test-Path $appData)) {
    Write-Result $false $null $null "AppData VHD not found: $appData" $result
    exit 1
}
if (-not (Test-Path $option)) {
    Write-Result $false $null $null "Option VHD not found: $option" $result
    exit 1
}

if (Test-Path 'X:\' -or Test-Path 'Y:\' -or Test-Path 'Z:\') {
    Write-Result $false $null $null 'Drive X:, Y:, or Z: is already in use. Please eject or change the assigned drives.' $result
    exit 1
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

try {
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
