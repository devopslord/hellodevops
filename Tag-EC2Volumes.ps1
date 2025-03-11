# Import necessary modules
Import-Module ImportExcel
Import-Module AWSPowerShell

# Set AWS credentials including session token
$accessKey = "YOUR_ACCESS_KEY"
$secretKey = "YOUR_SECRET_KEY"
$sessionToken = "YOUR_SESSION_TOKEN"

# Set AWS credentials with session token
Set-AWSCredential -AccessKey $accessKey -SecretKey $secretKey -SessionToken $sessionToken -StoreAs MyProfile

# Set AWS region to us-east-1
Set-DefaultAWSRegion -Region us-east-1

# Path to the Excel file containing the volume IDs
$excelFilePath = "C:\path\to\your\volume_ids.xlsx"

# Read the volume IDs from the Excel file
$volumeIds = Import-Excel -Path $excelFilePath

# Loop through each volume ID
foreach ($volumeId in $volumeIds) {
    # Get the volume details
    $volume = Get-EC2Volume -VolumeId $volumeId

    # Check if the volume is attached to an instance
    if ($volume.Attachments.InstanceId) {
        $instanceId = $volume.Attachments.InstanceId

        # Get the instance details
        $instance = Get-EC2Instance -InstanceId $instanceId

        # Check for the "pcm-project_number" tag on the instance
        $pcmProjectTag = $instance.Tags | Where-Object { $_.Key -eq "pcm-project_number" }

        if ($pcmProjectTag) {
            # If "pcm-project_number" tag is found, tag the volume with the same tag
            New-EC2Tag -Resource $volumeId -Tag @{ Key = "pcm-project_number"; Value = $pcmProjectTag.Value }
            Write-Output "Tagged volume $volumeId with pcm-project_number: $($pcmProjectTag.Value)"
        } else {
            # If "pcm-project_number" tag is not found, check for "project_number" tag
            $projectTag = $instance.Tags | Where-Object { $_.Key -eq "project_number" }

            if ($projectTag) {
                # If "project_number" tag is found, create a new tag "pcm-project_number" on both instance and volume
                New-EC2Tag -Resource $instanceId -Tag @{ Key = "pcm-project_number"; Value = $projectTag.Value }
                New-EC2Tag -Resource $volumeId -Tag @{ Key = "pcm-project_number"; Value = $projectTag.Value }
                Write-Output "Tagged instance $instanceId and volume $volumeId with pcm-project_number: $($projectTag.Value)"
            } else {
                Write-Output "No relevant tags found for instance $instanceId"
            }
        }
    } else {
        Write-Output "Volume $volumeId is not attached to any instance"
    }
}