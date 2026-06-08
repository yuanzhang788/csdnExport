# Markdown 文件目录
$mdFolder = "C:\Users\24372\IdeaProjects\csdnExport\articles"
$assetsFolder = "C:\Users\24372\IdeaProjects\csdnExport\assets"

# 获取所有 md 文件
$mdFiles = Get-ChildItem -Path $mdFolder -Filter *.md
$totalFiles = $mdFiles.Count
$fileIndex = 1

foreach ($md in $mdFiles) {
    $mdFile = $md.FullName
    # 清理文件名中的特殊字符，只保留字母、数字、中文、下划线和连字符
    $mdName = [System.IO.Path]::GetFileNameWithoutExtension($mdFile)
    $mdName = $mdName -replace '[^\w\s\u4e00-\u9fa5-]', '' -replace '\s+', ''

    # 读取文件
    $content = Get-Content $mdFile -Raw -Encoding UTF8

    # 匹配所有 Markdown 图片
    $pattern = '!\[[^\]]*\]\((https?:\/\/[^)]+)\)'
    $matches = [regex]::Matches($content, $pattern)
    $totalImgs = $matches.Count

    if ($totalImgs -eq 0) {
        Write-Host "[$fileIndex/$totalFiles] 跳过(无图片): $($md.Name)"
        $fileIndex++
        continue
    }

    # 创建图片文件夹
    $imgFolder = Join-Path $assetsFolder $mdName
    if (-not (Test-Path $imgFolder)) {
        New-Item -Path $imgFolder -ItemType Directory | Out-Null
    }

    Write-Host "[$fileIndex/$totalFiles] 处理文件: $($md.Name) 发现 $totalImgs 张图片"

    $imgIndex = 1
    foreach ($match in $matches) {
        $url = $match.Groups[1].Value
        $fileName = [System.IO.Path]::GetFileName($url)
        $localPath = Join-Path $imgFolder $fileName

        if (-not (Test-Path $localPath)) {
            try {
                Invoke-WebRequest -Uri $url -OutFile $localPath -UseBasicParsing
                Write-Host "  [$imgIndex/$totalImgs] 下载完成: $fileName"
            } catch {
                Write-Warning "  [$imgIndex/$totalImgs] 下载失败: $url"
            }
        } else {
            Write-Host "  [$imgIndex/$totalImgs] 已存在，跳过: $fileName"
        }

        # 替换 Markdown 图片路径为 Hexo 可用路径
        $relativePath = "/assets/$mdName/$fileName"
        $content = $content -replace [regex]::Escape($url), $relativePath

        $imgIndex++
    }

    # 保存修改后的 Markdown
    Set-Content -Path $mdFile -Value $content -Encoding UTF8
    Write-Host "  文件更新完成: $($md.Name)"

    $fileIndex++
}

Write-Host "所有文件处理完成！"