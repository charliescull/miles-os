[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('init', 'plan', 'run', 'review', 'status', 'verify')]
  [string]$Mode,

  [string]$BrainDumpFile,
  [string]$RunId,
  [ValidateSet('auto', 'claude', 'codex')]
  [string]$Planner,
  [ValidateSet('auto', 'claude', 'codex')]
  [string]$Implementer,
  [ValidateSet('auto', 'claude', 'codex')]
  [string]$Reviewer,
  [ValidateSet('auto', 'claude', 'codex')]
  [string]$Learner,
  [ValidateRange(1, 20)]
  [int]$MaxIterations,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$CflRoot = Join-Path $Root '.ai\closed-feedback-loop'
$RunsRoot = Join-Path $Root '.ai\runs'
$WorktreesRoot = Join-Path $Root '.ai\worktrees'
$Config = Get-Content (Join-Path $CflRoot 'config.json') -Raw | ConvertFrom-Json
$MemoryRoot = Join-Path $Root ($Config.memoryDirectory -replace '/', '\')

if (-not $Planner) { $Planner = $Config.defaultPlanner }
if (-not $Implementer) { $Implementer = $Config.defaultImplementer }
if (-not $Reviewer) { $Reviewer = $Config.defaultReviewer }
if (-not $Learner) { $Learner = $Config.defaultLearner }
if (-not $MaxIterations) { $MaxIterations = [int]$Config.maxIterations }

function Ensure-Directory([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Get-RunDirectory([string]$Id) {
  if (-not $Id) { throw 'RunId is required for this mode.' }
  $dir = Join-Path $RunsRoot $Id
  if (-not (Test-Path -LiteralPath $dir)) { throw "Run '$Id' does not exist." }
  return $dir
}

function Save-State([string]$Dir, [hashtable]$State) {
  $State.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  $State | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $Dir 'state.json') -Encoding utf8
}

function Convert-ToHashtable($Object) {
  $table = @{}
  foreach ($property in $Object.PSObject.Properties) {
    $table[$property.Name] = $property.Value
  }
  return $table
}

function Get-ProviderCandidates([string]$Preferred, [ValidateSet('planner', 'implementer', 'reviewer', 'learner')][string]$Role) {
  if ($Preferred -and $Preferred -ne 'auto') { return @($Preferred) }
  return @($Config.providerOrder.$Role)
}

function Invoke-Agent([string]$Provider, [string]$Prompt, [string]$WorkingDirectory, [string]$OutputPath, [ValidateSet('read-only', 'workspace-write')][string]$Sandbox = 'read-only', [ValidateSet('planner', 'implementer', 'reviewer', 'learner')][string]$Role = 'implementer') {
  $promptPath = "$OutputPath.prompt.md"
  $Prompt | Set-Content -LiteralPath $promptPath -Encoding utf8
  $candidates = Get-ProviderCandidates $Provider $Role
  if ($DryRun) {
    "DRY RUN: $($candidates -join ', ') agent prompt saved to $promptPath" | Set-Content -LiteralPath $OutputPath -Encoding utf8
    return $true
  }

  foreach ($candidate in $candidates) {
    $command = Get-Command $candidate -ErrorAction SilentlyContinue
    if (-not $command) { continue }
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Push-Location $WorkingDirectory
    try {
      if ($candidate -eq 'claude') {
        $permission = if ($Sandbox -eq 'workspace-write') { 'acceptEdits' } else { 'plan' }
        $result = $Prompt | & claude -p --output-format text --permission-mode $permission --add-dir $WorkingDirectory 2>&1 | Out-String
        $exitCode = $LASTEXITCODE
        $result | Set-Content -LiteralPath $OutputPath -Encoding utf8
        if ($result -match '(?i)not logged in|please run /login|authentication failed') { $exitCode = 1 }
      } else {
        $result = $Prompt | & codex exec --cd $WorkingDirectory --sandbox $Sandbox -o $OutputPath - 2>&1 | Out-String
        $exitCode = $LASTEXITCODE
        if ($result.Trim()) { $result | Set-Content -LiteralPath "$OutputPath.log" -Encoding utf8 }
      }
    } finally {
      Pop-Location
      $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($exitCode -eq 0) { return $true }
    Add-Content -LiteralPath "$OutputPath.log" -Value "`nProvider $candidate failed; trying the next available provider." -Encoding utf8
  }
  "No configured provider completed this node. Candidates: $($candidates -join ', ')" | Set-Content -LiteralPath $OutputPath -Encoding utf8
  return $false
}

function Get-MemoryContext {
  if (-not (Test-Path -LiteralPath $MemoryRoot)) { return 'No prior lessons are available.' }
  $files = Get-ChildItem -LiteralPath $MemoryRoot -File -Filter '*.md' | Sort-Object LastWriteTime -Descending | Select-Object -First ([int]$Config.maxLessonsInPrompt)
  if (-not $files) { return 'No prior lessons are available.' }
  $parts = foreach ($file in $files) {
    "--- MEMORY: $($file.Name) ---`n$(Get-Content $file.FullName -Raw)"
  }
  return ($parts -join "`n`n")
}

function Invoke-Learning([string]$Dir, [string]$Outcome, [string]$Review) {
  Ensure-Directory $MemoryRoot
  $learnerTemplate = Get-Content (Join-Path $CflRoot 'prompts\learner.md') -Raw
  $artifacts = "OUTCOME: $Outcome`n`nBRAIN DUMP:`n$(Get-Content (Join-Path $Dir 'brain-dump.md') -Raw)`n`nPLAN:`n$(Get-Content (Join-Path $Dir 'plan.md') -Raw)`n`nLATEST REVIEW:`n$Review"
  $lessonPath = Join-Path $Dir 'lesson.md'
  $ok = Invoke-Agent $Learner "$learnerTemplate`n`n$artifacts" $Root $lessonPath 'read-only' 'learner'
  if ($DryRun) { return $null }
  $lesson = if (Test-Path -LiteralPath $lessonPath) { Get-Content $lessonPath -Raw } else { '' }
  $memoryName = if ($ok -and $lesson -match '(?im)^# Lesson\b') { "lesson-$($Dir | Split-Path -Leaf).md" } else { "evidence-$($Dir | Split-Path -Leaf).md" }
  if (-not $ok -or $lesson -notmatch '(?im)^# Lesson\b') {
    $lesson = "# Lesson`n## Situation`nClosed Feedback Loop run completed with outcome: $Outcome.`n## What went wrong or worked`nThe detailed evidence remains in the run artifacts.`n## Evidence`nRun directory: $Dir`n## Better heuristic for next time`nHave the next available learning-capable provider review this evidence before making similar decisions.`n## Applicability`nFuture runs in this repository.`n## Confidence`nLow until synthesized by a learning node."
  }
  $lesson | Set-Content -LiteralPath (Join-Path $MemoryRoot $memoryName) -Encoding utf8
  return $memoryName
}

function Invoke-Verification([string]$WorkingDirectory, [string]$OutputPath) {
  $allPassed = $true
  $lines = [System.Collections.Generic.List[string]]::new()
  foreach ($command in $Config.verificationCommands) {
    $lines.Add("## $command")
    Push-Location $WorkingDirectory
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $output = Invoke-Expression "$command 2>&1" | Out-String
      $code = $LASTEXITCODE
    } finally {
      Pop-Location
      $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($code -ne 0) { $allPassed = $false }
    $lines.Add("Exit code: $code")
    $lines.Add('```text')
    $lines.Add($output.TrimEnd())
    $lines.Add('```')
  }
  $lines -join [Environment]::NewLine | Set-Content -LiteralPath $OutputPath -Encoding utf8
  return $allPassed
}

function New-Run {
  Ensure-Directory $RunsRoot
  if (-not $BrainDumpFile) { throw 'init requires -BrainDumpFile.' }
  $source = (Resolve-Path $BrainDumpFile).Path
  $id = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
  $dir = Join-Path $RunsRoot $id
  Ensure-Directory $dir
  Copy-Item -LiteralPath $source -Destination (Join-Path $dir 'brain-dump.md')
  $state = @{
    id = $id; status = 'initialized'; iteration = 0; planner = $Planner
    implementer = $Implementer; reviewer = $Reviewer; learner = $Learner; maxIterations = $MaxIterations
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
  }
  Save-State $dir $state
  Write-Output "Created Closed Feedback Loop run: $id"
  Write-Output "Next: .\scripts\closed-feedback-loop.ps1 plan -RunId $id"
}

function New-Plan {
  $dir = Get-RunDirectory $RunId
  $brainDump = Get-Content (Join-Path $dir 'brain-dump.md') -Raw
  $template = Get-Content (Join-Path $CflRoot 'prompts\architect.md') -Raw
  $principles = ($Config.operatingPrinciples -join "`n- ")
  $prompt = "$template`n`nWORKFLOW PRINCIPLES:`n- $principles`n`nPRIOR MEMORY:`n$(Get-MemoryContext)`n`n$brainDump"
  $ok = Invoke-Agent $Planner $prompt $Root (Join-Path $dir 'plan.md') 'read-only' 'planner'
  if (-not $ok) { throw 'Architect agent failed. Inspect plan.md and its prompt file.' }
  $state = Convert-ToHashtable (Get-Content (Join-Path $dir 'state.json') -Raw | ConvertFrom-Json)
  $state.status = 'planned'; $state.planner = $Planner
  $hash = (Get-FileHash (Join-Path $dir 'plan.md')).Hash
  $state.planHash = $hash
  Save-State $dir $state
  Write-Output "Plan written to $dir\plan.md"
}

function Start-Loop {
  $dir = Get-RunDirectory $RunId
  $state = Convert-ToHashtable (Get-Content (Join-Path $dir 'state.json') -Raw | ConvertFrom-Json)
  if (-not (Test-Path (Join-Path $dir 'plan.md'))) { throw 'Run has no plan.md. Run plan first.' }
  Ensure-Directory $WorktreesRoot
  $worktree = Join-Path $WorktreesRoot $RunId
  if (-not (Test-Path -LiteralPath $worktree)) {
    $branch = "cfl/$RunId"
    & git worktree add -b $branch $worktree HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated Git worktree.' }
  }
  $state.worktree = $worktree; $state.status = 'running'; Save-State $dir $state
  $plan = Get-Content (Join-Path $dir 'plan.md') -Raw
  $review = ''
  $startIteration = if ($state.iteration) { ([int]$state.iteration + 1) } else { 1 }
  for ($i = $startIteration; $i -le $MaxIterations; $i++) {
    $state.iteration = $i; Save-State $dir $state
    $implementerPrompt = Get-Content (Join-Path $CflRoot 'prompts\implementer.md') -Raw
    $principles = ($Config.operatingPrinciples -join "`n- ")
    $implementerPrompt += "`n`nWORKFLOW PRINCIPLES:`n- $principles`n`nPRIOR MEMORY:`n$(Get-MemoryContext)`n`nPROJECT PLAN (ADAPTABLE):`n$plan`n`nPREVIOUS REVIEW/VERIFICATION:`n$review"
    $implementerOk = Invoke-Agent $Implementer $implementerPrompt $worktree (Join-Path $dir "iteration-$i-implementer.md") 'workspace-write' 'implementer'
    $verifyOk = Invoke-Verification $worktree (Join-Path $dir "iteration-$i-verification.md")
    $diff = (& git -C $worktree diff --stat | Out-String)
    $reviewPrompt = Get-Content (Join-Path $CflRoot 'prompts\reviewer.md') -Raw
    $reviewPrompt += "`n`nWORKFLOW PRINCIPLES:`n- $principles`n`nPROJECT PLAN (ADAPTABLE):`n$plan`n`nVERIFICATION:`n$(Get-Content (Join-Path $dir "iteration-$i-verification.md") -Raw)`n`nDIFF STAT:`n$diff"
    $reviewOk = Invoke-Agent $Reviewer $reviewPrompt $worktree (Join-Path $dir "iteration-$i-review.md") 'read-only' 'reviewer'
    $review = Get-Content (Join-Path $dir "iteration-$i-review.md") -Raw
    if ($implementerOk -and $verifyOk -and $reviewOk -and $review -match '(?im)^# Verdict\s*\r?\n\s*PASS\b') {
      $state.status = 'passed'; Save-State $dir $state
      $memoryName = Invoke-Learning $dir 'passed' $review
      $state.memory = $memoryName; Save-State $dir $state
      Write-Output "Closed Feedback Loop passed on iteration $i. Worktree: $worktree"
      return
    }
    if ($review -match '(?im)^# Verdict\s*\r?\n\s*HUMAN_REQUIRED\b') {
      $state.status = 'human_required'; Save-State $dir $state
      $memoryName = Invoke-Learning $dir 'human_required' $review
      $state.memory = $memoryName; Save-State $dir $state
      Write-Output "Loop paused for a human decision. Read $dir\iteration-$i-review.md"
      return
    }
    if ($review -match '(?im)^# Verdict\s*\r?\n\s*PLAN_CHANGE_RECOMMENDED\b') {
      $state.lastDecision = 'plan_change_recommended'; Save-State $dir $state
      $evolverPrompt = Get-Content (Join-Path $CflRoot 'prompts\evolver.md') -Raw
      $evolverPrompt += "`n`nCURRENT PLAN:`n$plan`n`nIMPLEMENTER SUMMARY:`n$(Get-Content (Join-Path $dir "iteration-$i-implementer.md") -Raw)`n`nVERIFICATION:`n$(Get-Content (Join-Path $dir "iteration-$i-verification.md") -Raw)`n`nREVIEW:`n$review"
      $revisedPlanPath = Join-Path $dir "plan-revision-$i.md"
      if (Invoke-Agent $Planner $evolverPrompt $Root $revisedPlanPath 'read-only' 'planner') {
        $plan = Get-Content $revisedPlanPath -Raw
        $state.planHash = (Get-FileHash $revisedPlanPath).Hash
        $state.planRevision = $i
        Save-State $dir $state
      }
    }
  }
  $state.status = 'max_iterations_reached'; Save-State $dir $state
  $memoryName = Invoke-Learning $dir 'max_iterations_reached' $review
  $state.memory = $memoryName; Save-State $dir $state
  Write-Output "Loop stopped after $MaxIterations iterations. Inspect artifacts in $dir and worktree $worktree"
}

function Review-Run {
  $dir = Get-RunDirectory $RunId
  $state = Convert-ToHashtable (Get-Content (Join-Path $dir 'state.json') -Raw | ConvertFrom-Json)
  if (-not $state.worktree) { throw 'Run has no worktree. Run the loop first.' }
  $verification = Get-ChildItem $dir -File -Filter '*-verification.md' | Sort-Object Name | Select-Object -Last 1
  if (-not $verification) { throw 'Run has no verification artifact.' }
  $plan = Get-Content (Join-Path $dir 'plan.md') -Raw
  $diff = (& git -C $state.worktree diff --stat | Out-String)
  $reviewPrompt = Get-Content (Join-Path $CflRoot 'prompts\reviewer.md') -Raw
  $reviewPrompt += "`n`nPRIOR MEMORY:`n$(Get-MemoryContext)`n`nPROJECT PLAN:`n$plan`n`nVERIFICATION:`n$(Get-Content $verification.FullName -Raw)`n`nDIFF STAT:`n$diff"
  $reviewPath = Join-Path $dir 'final-review.md'
  $ok = Invoke-Agent $Reviewer $reviewPrompt $state.worktree $reviewPath 'read-only' 'reviewer'
  $review = if (Test-Path $reviewPath) { Get-Content $reviewPath -Raw } else { '' }
  if ($ok -and $review -match '(?im)^# Verdict\s*\r?\n\s*PASS\b') { $state.status = 'passed' }
  elseif ($ok -and $review -match '(?im)^# Verdict\s*\r?\n\s*HUMAN_REQUIRED\b') { $state.status = 'human_required' }
  else { $state.status = 'review_failed_or_fix_required' }
  $state.memory = Invoke-Learning $dir $state.status $review
  Save-State $dir $state
  Write-Output "Final review written to $reviewPath. Worktree: $($state.worktree)"
}

switch ($Mode) {
  'init' { New-Run }
  'plan' { New-Plan }
  'run' { Start-Loop }
  'review' { Review-Run }
  'verify' {
    $dir = Get-RunDirectory $RunId
    $state = Get-Content (Join-Path $dir 'state.json') -Raw | ConvertFrom-Json
    if (-not $state.worktree) { throw 'Run has no worktree. Run the loop first.' }
    Invoke-Verification $state.worktree (Join-Path $dir 'verification.md') | Out-Null
    Write-Output "Verification written to $dir\verification.md"
  }
  'status' {
    $dir = Get-RunDirectory $RunId
    Get-Content (Join-Path $dir 'state.json')
  }
}
