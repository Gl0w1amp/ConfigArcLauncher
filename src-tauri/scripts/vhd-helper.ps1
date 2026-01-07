$ErrorActionPreference = 'Stop'

function Write-Result {
    param(
        [bool]$Ok,
        [string]$MountPath,
        [string]$RuntimePath,
        [string]$ErrorMessage,
        [string]$ResultPath
    )

    $payload = [ordered]@{
        ok = $Ok
        mount_path = $MountPath
        runtime_path = $RuntimePath
        error = $ErrorMessage
    }
    $json = $payload | ConvertTo-Json -Compress
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($ResultPath, $json, $utf8NoBom)
}

$base = $null
$patch = $null
$delta = '1'
$result = $null
$signal = $null
$done = $null

for ($i = 0; $i -lt $args.Length; $i++) {
    $key = $args[$i]
    switch ($key) {
        '--base' { $base = $args[$i + 1]; $i++ }
        '--patch' { $patch = $args[$i + 1]; $i++ }
        '--delta' { $delta = $args[$i + 1]; $i++ }
        '--result' { $result = $args[$i + 1]; $i++ }
        '--signal' { $signal = $args[$i + 1]; $i++ }
        '--done' { $done = $args[$i + 1]; $i++ }
    }
}

if (-not $patch -or -not $result -or -not $signal -or -not $done) {
    Write-Result $false $null $null 'Missing arguments' $result
    exit 1
}

if (Test-Path 'X:\') {
    Write-Result $false $null $null 'Drive X: is already in use. Please eject or change the assigned drive.' $result
    exit 1
}

$mountPath = $patch
$runtimePath = $null

try {
    if ($delta -eq '1' -or $delta -eq 'true' -or $delta -eq 'True') {
        $parentDir = Split-Path $patch -Parent
        $stem = [System.IO.Path]::GetFileNameWithoutExtension($patch)
        $ext = [System.IO.Path]::GetExtension($patch)
        if ([string]::IsNullOrWhiteSpace($ext)) {
            $ext = '.vhd'
        }
        $runtimePath = Join-Path $parentDir "$stem-runtime$ext"

        Dismount-DiskImage -ImagePath $runtimePath -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
        if (Test-Path $runtimePath) {
            Remove-Item $runtimePath -Force -ErrorAction SilentlyContinue
        }

        $dpPath = Join-Path $env:TEMP ("configarc_vhd_diskpart_{0}.txt" -f $PID)
        $dpScript = "create vdisk file=`"$runtimePath`" parent=`"$patch`"`n"
        Set-Content -Path $dpPath -Value $dpScript -Encoding ASCII
        & diskpart.exe /s $dpPath | Out-Null
        Remove-Item $dpPath -Force -ErrorAction SilentlyContinue

        if (-not (Test-Path $runtimePath)) {
            throw 'Failed to create runtime VHD'
        }

        $mountPath = $runtimePath
    }

    Mount-DiskImage -ImagePath $mountPath -StorageType VHD -NoDriveLetter -Passthru -Access ReadWrite -Confirm:$false -ErrorAction Stop |
        Get-Disk |
        Get-Partition |
        Where-Object { ($_ | Get-Volume) -ne $Null } |
        Add-PartitionAccessPath -AccessPath 'X:\' -ErrorAction Stop |
        Out-Null

    try {
        Start-Sleep -Milliseconds 300
        $shell = New-Object -ComObject Shell.Application
        $shell.Windows() | Where-Object {
            $_.LocationURL -like 'file:///X:*' -or $_.LocationURL -like 'file:///X:/*'
        } | ForEach-Object { $_.Quit() }
    } catch {
    }

    Write-Result $true $mountPath $runtimePath $null $result
} catch {
    Write-Result $false $null $null $_.Exception.Message $result
    exit 1
}

while (-not (Test-Path $signal)) {
    Start-Sleep -Milliseconds 500
}

try {
    Dismount-DiskImage -ImagePath $mountPath -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
} catch {
}

if ($runtimePath) {
    try {
        Dismount-DiskImage -ImagePath $runtimePath -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    } catch {
    }
    if (Test-Path $runtimePath) {
        Remove-Item $runtimePath -Force -ErrorAction SilentlyContinue
    }
}

Set-Content -Path $done -Value '1' -Encoding ASCII
