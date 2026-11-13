; Libera o Altar no firewall do Windows para o celular conseguir se conectar.
; - Só a porta 7420 (TCP), só para aparelhos da mesma rede (localsubnet),
;   em qualquer tipo de rede (o Windows costuma marcar Wi-Fi novo como "Pública").
; - Apaga antes a regra do nome antigo ("Pulpito") e qualquer regra antiga do programa (inclusive um "Bloquear"
;   deixado pelo aviso do Windows), para não acumular nem conflitar.
; - Pede permissão de administrador uma vez (na instalação pelo instalador; nas atualizações automáticas, não). Se a pessoa disser "Não",
;   a instalação continua normalmente; só a regra não é criada.

!macro altarFirewall
  ExecShellWait "runas" "$SYSDIR\cmd.exe" '/c netsh advfirewall firewall delete rule name="Pulpito (celular)" & netsh advfirewall firewall delete rule name=all program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" & netsh advfirewall firewall add rule name="Altar (celular)" dir=in action=allow enable=yes program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" protocol=TCP localport=7420 remoteip=localsubnet profile=any' SW_HIDE
!macroend

!macro customInstall
  ; Atualização automática (o programa baixou a versão nova e instala sozinho): a regra do firewall já existe
  ; e vale para o mesmo arquivo, então não pede permissão de administrador de novo.
  ${ifNot} ${isUpdated}
    ClearErrors
    !insertmacro altarFirewall
    ClearErrors
  ${endIf}
!macroend

!macro customUnInstall
  ; Numa atualização o desinstalador antigo roda sozinho; aí a regra fica.
  ${ifNot} ${isUpdated}
    ClearErrors
    ExecShellWait "runas" "$SYSDIR\cmd.exe" '/c netsh advfirewall firewall delete rule name="Altar (celular)" & netsh advfirewall firewall delete rule name=all program="$INSTDIR\${APP_EXECUTABLE_FILENAME}"' SW_HIDE
    ClearErrors
  ${endIf}
!macroend
