
Add-Type -AssemblyName System.Drawing

$sourceImage = "C:/Users/user/.gemini/antigravity/brain/05d5fce1-ce5d-422b-9b99-d43f34bd83a8/uploaded_image_1765250728333.jpg"
$androidResDir = "c:/cartaodepontoapp/app-ponto/android/app/src/main/res"

$iconSizes = @(
    @{ name = "mipmap-mdpi"; size = 48 },
    @{ name = "mipmap-hdpi"; size = 72 },
    @{ name = "mipmap-xhdpi"; size = 96 },
    @{ name = "mipmap-xxhdpi"; size = 144 },
    @{ name = "mipmap-xxxhdpi"; size = 192 }
)

if (-not (Test-Path $sourceImage)) {
    Write-Error "Source image not found: $sourceImage"
    exit 1
}

$image = [System.Drawing.Image]::FromFile($sourceImage)

foreach ($icon in $iconSizes) {
    $targetDir = Join-Path $androidResDir $icon.name
    if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    }

    $targetFile = Join-Path $targetDir "ic_launcher.png"
    $targetRoundFile = Join-Path $targetDir "ic_launcher_round.png"
    $targetForegroundFile = Join-Path $targetDir "ic_launcher_foreground.png"

    $bitmap = New-Object System.Drawing.Bitmap($icon.size, $icon.size)
    $graph = [System.Drawing.Graphics]::FromImage($bitmap)
    $graph.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graph.DrawImage($image, 0, 0, $icon.size, $icon.size)
    
    $bitmap.Save($targetFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Save($targetRoundFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Save($targetForegroundFile, [System.Drawing.Imaging.ImageFormat]::Png)
    
    Write-Host "Generated $targetFile, $targetRoundFile, $targetForegroundFile"
    
    $graph.Dispose()
    $bitmap.Dispose()
}

$image.Dispose()
Write-Host "Icon generation complete."
