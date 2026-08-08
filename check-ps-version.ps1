$host | Select-Object Version | Format-List
'---'
$x = [System.Security.Cryptography.X509Certificates.X509Certificate2]
$x.GetMethods() | Where-Object { $_.Name -like '*PrivateKey*' -or $_.Name -like '*Export*' } | Select-Object -ExpandProperty Name | Sort-Object -Unique
'---'
'Pkcs8 support:'
[System.Security.Cryptography.RSA].GetMethods() | Where-Object { $_.Name -like '*Pkcs8*' } | Select-Object -ExpandProperty Name
