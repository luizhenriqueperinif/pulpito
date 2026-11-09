; Libera o Púlpito no firewall do Windows para o celular conseguir se conectar.
; - Só a porta 7420 (TCP), só para aparelhos da mesma rede (localsubnet),
;   em qualquer tipo de rede (o Windows costuma marcar Wi-Fi novo como "Pública").
; - Apaga antes qualquer regra antiga do programa (inclusive um "Bloquear"
;   deixado pelo aviso do Windows), para não acumular nem conflitar.
; - Pede permissão de administrador uma vez. Se a pessoa disser "Não",
;   a instalação continua normalmente; só a regra não é criada.

!macro pulpitoFirewall
  ExecShellWait "runas" "$SYSDIR\cmd.exe" '/c netsh advfirewall firewall delete rule name=all program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" & netsh advfirewall firewall add rule name="Pulpito (celular)" dir=in action=allow enable=yes program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" protocol=TCP localport=7420 remoteip=localsubnet profile=any' SW_HIDE
!macroend

!macro customInstall
  ClearErrors
  !insertmacro pulpitoFirewall
  ClearErrors
!macroend

!macro customUnInstall
  ; Numa atualização o desinstalador antigo roda sozinho; aí a regra fica.
  ${ifNot} ${isUpdated}
    ClearErrors
    ExecShellWait "runas" "$SYSDIR\cmd.exe" '/c netsh advfirewall firewall delete rule name="Pulpito (celular)" & netsh advfirewall firewall delete rule name=all program="$INSTDIR\${APP_EXECUTABLE_FILENAME}"' SW_HIDE
    ClearErrors
  ${endIf}
!macroend
