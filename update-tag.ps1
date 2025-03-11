# AWS Credentials (Use IAM roles or environment variables instead of hardcoding)
$awsAccessKey = "YOUR_ACCESS_KEY"
$awsSecretKey = "YOUR_SECRET_KEY"
$awsSessionToken = "YOUR_SESSION_TOKEN"  # Optional for temporary credentials
$awsRegion = "us-east-1"  # Change to your AWS region

# Mode selection: 1 = Test Mode (No changes), 2 = Apply Mode (Makes changes)
$testMode = 1  

# Import AWS Tools
Import-Module AWS.Tools.EC2
Import-Module ImportExcel  

# Define Excel file path and sheet name
$excelFilePath = "C:\path\to\your\file.xlsx"
$sheetName = "Sheet1"  # Change if necessary

# Read volume IDs from Excel file
$volumes = Import-Excel -Path $excelFilePath -WorksheetName $sheetName

# Loop through each volume
foreach ($volume in $volumes) {
    $volumeId = $volume.VolumeId  

    if (-not $volumeId) {
        Write-Host "[INFO] Skipping empty volume entry."
        continue
    }

    # Get volume details
    $volumeDetails = Get-EC2Volume -VolumeId $volumeId -Region $awsRegion -AccessKey $awsAccessKey -SecretKey $awsSecretKey -SessionToken $awsSessionToken

    if ($volumeDetails -and $volumeDetails.Attachments) {
        $instanceId = $volumeDetails.Attachments[0].InstanceId

        if ($instanceId) {
            # Get instance details
            $instance = Get-EC2Instance -InstanceId $instanceId -Region $awsRegion -AccessKey $awsAccessKey -SecretKey $awsSecretKey -SessionToken $awsSessionToken
            $instanceTags = $instance.Instances.Tags

            # Check for "pcm-project_number" tag
            $pcmTag = $instanceTags | Where-Object { $_.Key -eq "pcm-project_number" }
            $projectTag = $instanceTags | Where-Object { $_.Key -eq "project_number" }

            if ($pcmTag) {
                Write-Host "[INFO] Found pcm-project_number=$($pcmTag.Value) on instance $instanceId. Applying to volume $volumeId."

                if ($testMode -eq 1) {
                    Write-Host "[TEST] Would tag volume $volumeId with pcm-project_number=$($pcmTag.Value)"
                }
                elseif ($testMode -eq 2) {
                    New-EC2Tag -Resources $volumeId -Tags @{ Key="pcm-project_number"; Value=$pcmTag.Value } -Region $awsRegion -AccessKey $awsAccessKey -SecretKey $awsSecretKey -SessionToken $awsSessionToken
                    Write-Host "[ACTION] Tagged volume $volumeId with pcm-project_number=$($pcmTag.Value)"
                }
            }
            elseif ($projectTag) {
                Write-Host "[INFO] Found project_number=$($projectTag.Value) on instance $instanceId. Creating pcm-project_number tag."

                if ($testMode -eq 1) {
                    Write-Host "[TEST] Would create pcm-project_number=$($projectTag.Value) on instance $instanceId and volume $volumeId"
                }
                elseif ($testMode -eq 2) {
                    # Tag the instance
                    New-EC2Tag -Resources $instanceId -Tags @{ Key="pcm-project_number"; Value=$projectTag.Value } -Region $awsRegion -AccessKey $awsAccessKey -SecretKey $awsSecretKey -SessionToken $awsSessionToken
                    
                    # Tag the volume
                    New-EC2Tag -Resources $volumeId -Tags @{ Key="pcm-project_number"; Value=$projectTag.Value } -Region $awsRegion -AccessKey $awsAccessKey -SecretKey $awsSecretKey -SessionToken $awsSessionToken

                    Write-Host "[ACTION] Created and tagged pcm-project_number=$($projectTag.Value) on instance $instanceId and volume $volumeId."
                }
            }
            else {
                Write-Host "[WARNING] Instance $instanceId has no pcm-project_number or project_number tag. Skipping."
            }
        } 
        else {
            Write-Host "[INFO] Volume $volumeId is not attached to any instance."
        }
    } 
    else {
        Write-Host "[INFO] Volume $volumeId not found or unattached."
    }
}