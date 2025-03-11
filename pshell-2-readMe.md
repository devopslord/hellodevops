# PowerShell Script to Tag EC2 Volumes Based on Instance Tags

## Overview
This PowerShell script reads a list of EC2 volume IDs from an Excel file, determines the instance ID each volume is attached to, checks for a tag (`pcm-project_number`) on the instance, and applies it to the volume. If the tag is not found, it looks for `project_number`, creates `pcm-project_number`, and applies it to both the instance and the volume.

## Prerequisites
Before running the script, ensure you have the following:

1. **AWS Credentials** (Access Key, Secret Key, and optionally, Session Token).
2. **PowerShell Installed** (Windows/macOS/Linux).
3. **AWS PowerShell Module Installed**:
   ```powershell
   Install-Module -Name AWS.Tools.EC2 -Force -AllowClobber
   Install-Module -Name ImportExcel -Force -AllowClobber
   ```
4. **Excel File** containing a list of EC2 volume IDs.
5. **Set Execution Policy** (if not set already):
   ```powershell
   Set-ExecutionPolicy RemoteSigned -Scope Process
   ```

## How to Download the Script
Download the script from the repository or save the script file (`tag_ec2_volumes.ps1`) in a local directory.

## How to Execute the Script
1. Open PowerShell and navigate to the script's directory:
   ```powershell
   cd C:\path\to\your\script
   ```
2. Run the script in **test mode** (only prints what would happen):
   ```powershell
   .\tag_ec2_volumes.ps1 -testMode 1
   ```
3. Run the script in **apply mode** (makes actual changes to AWS):
   ```powershell
   .\tag_ec2_volumes.ps1 -testMode 2
   ```

## Explanation of Modes
- **Test Mode (`1`)**: The script only prints the actions it would perform, without making any changes to AWS.
- **Apply Mode (`2`)**: The script applies the necessary tags to instances and volumes in AWS.

## Example Output
### Test Mode (`-testMode 1`)
```
[INFO] Found project_number=12345 on instance i-0123456789abcdef0. Creating pcm-project_number tag.
[TEST] Would create pcm-project_number=12345 on instance i-0123456789abcdef0 and volume vol-0abcdef1234567890.
```

### Apply Mode (`-testMode 2`)
```
[INFO] Found project_number=12345 on instance i-0123456789abcdef0. Creating pcm-project_number tag.
[ACTION] Created and tagged pcm-project_number=12345 on instance i-0123456789abcdef0 and volume vol-0abcdef1234567890.
```

## Troubleshooting
- If you get **Access Denied** errors, ensure your AWS credentials have permissions for EC2 tagging (`ec2:DescribeInstances`, `ec2:DescribeVolumes`, `ec2:CreateTags`).
- If the script does not run, check execution policies:
  ```powershell
  Get-ExecutionPolicy
  ```
  If set to `Restricted`, temporarily allow script execution:
  ```powershell
  Set-ExecutionPolicy RemoteSigned -Scope Process
  ```

## Notes
- It is recommended to test the script (`-testMode 1`) before applying changes.
- Do not hardcode AWS credentials inside the script; use environment variables or AWS profiles.

## License
This script is provided "as-is" without warranty. Use at your own risk.

