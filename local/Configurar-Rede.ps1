param(
  [Parameter(Mandatory=$true)][string]$ServerIPv4,
  [ValidateRange(1024,65535)][int]$Port=8443
)
$ErrorActionPreference='Stop'
$installationRoot=Split-Path -Parent $PSScriptRoot
$privatePath=Join-Path $installationRoot 'private'
$configPath=Join-Path $privatePath 'config.private.json'
if(-not (Test-Path -LiteralPath $configPath)){throw 'Inicialize primeiro pelo Iniciar-Imperium.cmd.'}
$parsedIP=$null
if(-not [Net.IPAddress]::TryParse($ServerIPv4,[ref]$parsedIP) -or $parsedIP.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $ServerIPv4 -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'){throw 'Use o IPv4 fixo privado do servidor na rede do condominio.'}
if(Test-Path -LiteralPath (Join-Path $privatePath 'server.pfx')){throw 'Ja existe certificado. Nao sobrescrever uma instalacao existente.'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $privatePath /inheritance:r /grant:r "${identity}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F'
if($LASTEXITCODE -ne 0){throw 'Nao foi possivel proteger a pasta privada.'}
$rootCA=New-SelfSignedCertificate -Type Custom -Subject 'CN=Imperium Local CA' -FriendlyName 'Imperium Local CA' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy NonExportable -KeyUsage CertSign,CRLSign,DigitalSignature -TextExtension @('2.5.29.19={critical}{text}ca=true&pathlength=0') -NotAfter (Get-Date).AddYears(5)
$leaf=New-SelfSignedCertificate -Type Custom -Subject 'CN=Imperium Local' -Signer $rootCA -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage DigitalSignature,KeyEncipherment -TextExtension @("2.5.29.17={text}IPAddress=$ServerIPv4&IPAddress=127.0.0.1&DNS=localhost",'2.5.29.37={text}1.3.6.1.5.5.7.3.1') -NotAfter (Get-Date).AddYears(2)
$random=[byte[]]::new(32)
$rng=[Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($random);$rng.Dispose()
$pfxPassword=[Convert]::ToBase64String($random)
$securePassword=ConvertTo-SecureString $pfxPassword -AsPlainText -Force
Export-PfxCertificate -Cert $leaf -FilePath (Join-Path $privatePath 'server.pfx') -Password $securePassword -CryptoAlgorithmOption AES256_SHA256 | Out-Null
Export-Certificate -Cert $rootCA -FilePath (Join-Path $privatePath 'Imperium-CA.cer') | Out-Null
$pem="-----BEGIN CERTIFICATE-----`n"+[Convert]::ToBase64String($rootCA.RawData,[Base64FormattingOptions]::InsertLineBreaks)+"`n-----END CERTIFICATE-----`n"
$utf8=New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $privatePath 'ca.pem'),$pem,$utf8)
$config=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if($config.PSObject.Properties.Name -contains 'tls'){throw 'A configuracao ja possui HTTPS. Revisar sem sobrescrever.'}
$config.listenHost='0.0.0.0';$config.port=$Port
$config.origins=@("https://${ServerIPv4}:$Port","https://127.0.0.1:$Port","https://localhost:$Port")
$config | Add-Member -NotePropertyName tls -NotePropertyValue @{pfx='server.pfx';passphrase=$pfxPassword}
$config.gateway | Add-Member -NotePropertyName ca -NotePropertyValue 'ca.pem' -Force
[IO.File]::WriteAllText($configPath,($config | ConvertTo-Json -Depth 8),$utf8)
$gatewayPath=Join-Path $privatePath 'gateway.private.json'
$gateway=Get-Content -LiteralPath $gatewayPath -Raw | ConvertFrom-Json
$gateway.apiBaseUrl="https://127.0.0.1:$Port/api"
[IO.File]::WriteAllText($gatewayPath,($gateway | ConvertTo-Json -Depth 12),$utf8)
Write-Output "HTTPS preparado em https://${ServerIPv4}:$Port"
Write-Output "Certificado da autoridade local: $privatePath\Imperium-CA.cer"
Write-Output "Impressao digital SHA1 para conferir: $($rootCA.Thumbprint)"
Write-Output 'A autoridade NAO foi instalada como confiavel automaticamente. O administrador deve conferir e instalar o certificado publico nos dispositivos autorizados antes de abrir o sistema.'
Write-Output 'Reinicie a central. A regra de firewall e a tarefa de inicializacao sao configuradas separadamente.'
