; Instalador do agente de impressão do Coliseu PDV (Windows 64 bits).
;
; Gerado por agent/build-windows.mjs (npm run agent:build-windows), que passa VERSION, AGENT_EXE (o .exe do agente),
; OUT_FILE e, se houver, SERVER_URL (endereço já preenchido na tela de conexão).
;
; O que faz: pede o endereço do sistema e o token da impressora e confere os dois no servidor; lista as impressoras do
; Windows; copia o agente para Arquivos de Programas; grava o config.json (só administradores e o sistema leem o
; token); cria a tarefa que liga o agente junto com o Windows e oferece uma página de teste. Reinstalar por cima
; atualiza o agente e, com o token em branco, mantém o atual. Desinstala pelo "Aplicativos instalados".
;
; Instalação silenciosa (várias máquinas):
;   coliseu-print-agent-setup-X.exe /S /SERVER=https://pdv.sua-loja.com.br /TOKEN=cpa1.... /PRINTER="POS-8370"

Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma
RequestExecutionLevel admin

!include MUI2.nsh
!include nsDialogs.nsh
!include LogicLib.nsh
!include FileFunc.nsh
!include x64.nsh

!ifndef SERVER_URL
  !define SERVER_URL ""
!endif

!define PRODUCT "Coliseu PDV - Impressão"
!define TASK_NAME "Coliseu PDV - Impressao"
!define AGENT "coliseu-print-agent.exe"
!define UNINSTALLER "desinstalar.exe"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ColiseuPDVImpressao"
!define SETTINGS_KEY "Software\Coliseu PDV\Impressao"
!define PRINTERS_KEY "SYSTEM\CurrentControlSet\Control\Print\Printers"

Name "${PRODUCT}"
OutFile "${OUT_FILE}"
InstallDir "$PROGRAMFILES64\Coliseu PDV\Impressao"
BrandingText "Coliseu PDV ${VERSION}"
ShowInstDetails show
ShowUninstDetails show

Var Server
Var Token
Var Printer
Var Connected
Var Suggested
Var ServerField
Var TokenField
Var PrinterField
Var Haystack
Var Needle
Var Found

!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Agente de impressão do Coliseu PDV"
!define MUI_WELCOMEPAGE_TEXT "Este assistente instala o agente que imprime os comprovantes do Coliseu PDV na impressora térmica deste computador.$\r$\n$\r$\nAntes de continuar:$\r$\n$\r$\n• instale o driver da impressora e confira se ela aparece em Impressoras e scanners;$\r$\n$\r$\n• no painel do Coliseu PDV, abra Operação > Impressoras e cadastre a impressora deste caixa (ou use Novo token) para ter o endereço e o token à mão."
!define MUI_FINISHPAGE_TEXT "O agente já está ligado e volta sozinho sempre que o Windows iniciar, mesmo sem ninguém entrar no computador.$\r$\n$\r$\nNo painel, em Operação > Impressoras, o selo desta impressora fica verde em alguns segundos."
!define MUI_FINISHPAGE_TEXT_LARGE
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Imprimir uma página de teste agora"
!define MUI_FINISHPAGE_RUN_FUNCTION TestPrint

!insertmacro MUI_PAGE_WELCOME
Page custom ConnectionPage ConnectionLeave
Page custom PrinterPage PrinterLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "ProductName" "${PRODUCT}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "FileDescription" "Instalador do agente de impressão do Coliseu PDV"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "CompanyName" "Coliseu PDV"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "LegalCopyright" "Coliseu PDV"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "ProductVersion" "${VERSION}"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "O agente de impressão precisa do Windows 64 bits." /SD IDOK
    Abort
  ${EndIf}
  UserInfo::GetAccountType
  Pop $0
  ${If} $0 != "admin"
    MessageBox MB_ICONSTOP "Rode o instalador como administrador (botão direito > Executar como administrador)." /SD IDOK
    SetErrorLevel 740
    Abort
  ${EndIf}
  SetRegView 64
  ; Valores da instalação anterior; depois, os da linha de comando.
  ReadRegStr $Server HKLM "${SETTINGS_KEY}" "Server"
  ReadRegStr $Printer HKLM "${SETTINGS_KEY}" "Printer"
  ${If} $Server == ""
    StrCpy $Server "${SERVER_URL}"
  ${EndIf}
  ${GetParameters} $Haystack
  StrCpy $Needle "/SERVER="
  Call GetArg
  ${IfNot} ${Errors}
    StrCpy $Server $Found
  ${EndIf}
  StrCpy $Needle "/TOKEN="
  Call GetArg
  ${IfNot} ${Errors}
    StrCpy $Token $Found
  ${EndIf}
  StrCpy $Needle "/PRINTER="
  Call GetArg
  ${IfNot} ${Errors}
    StrCpy $Printer $Found
  ${EndIf}
  InitPluginsDir
FunctionEnd

; $Found = valor da opção $Needle (como "/SERVER=") na linha de comando em $Haystack; liga o erro se ela não veio.
; O ${GetOptions} do NSIS corta o valor na primeira "/", o que estraga https://... e tcp://...; aqui o valor vai até o
; próximo " /" ou, entre aspas, até fechar as aspas.
Function GetArg
  Push $0
  Push $1
  Push $2
  Push $3
  StrCpy $Found ""
  StrCpy $3 "nao"
  StrLen $0 $Needle
  StrCpy $1 0
  ${Do}
    StrCpy $2 $Haystack $0 $1
    ${IfThen} $2 == "" ${|} ${Break} ${|}
    ${If} $2 == $Needle
      StrCpy $3 "sim"
      IntOp $1 $1 + $0
      StrCpy $Found $Haystack "" $1
      StrCpy $2 $Found 1
      ${If} $2 == '"'
        StrCpy $Found $Found "" 1
        StrCpy $1 0
        ${Do}
          StrCpy $2 $Found 1 $1
          ${IfThen} $2 == "" ${|} ${Break} ${|}
          ${IfThen} $2 == '"' ${|} ${Break} ${|}
          IntOp $1 $1 + 1
        ${Loop}
      ${Else}
        StrCpy $1 0
        ${Do}
          StrCpy $2 $Found 2 $1
          ${IfThen} $2 == "" ${|} ${Break} ${|}
          ${IfThen} $2 == " /" ${|} ${Break} ${|}
          IntOp $1 $1 + 1
        ${Loop}
      ${EndIf}
      StrCpy $Found $Found $1
      ${Break}
    ${EndIf}
    IntOp $1 $1 + 1
  ${Loop}
  ${If} $3 == "sim"
    ClearErrors
  ${Else}
    SetErrors
  ${EndIf}
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

; O agente vai para a pasta temporária do instalador já na tela de conexão, para conferir o token antes de instalar.
Function ExtractAgent
  ${IfNot} ${FileExists} "$PLUGINSDIR\${AGENT}"
    SetOutPath "$PLUGINSDIR"
    File "/oname=${AGENT}" "${AGENT_EXE}"
  ${EndIf}
FunctionEnd

; Lê a mensagem que o agente gravou com --resultado (UTF-16LE) em $1.
Function ReadResult
  StrCpy $1 ""
  ClearErrors
  FileOpen $2 "$PLUGINSDIR\resultado.txt" r
  ${IfNot} ${Errors}
    FileReadUTF16LE $2 $1
    FileClose $2
  ${EndIf}
  Delete "$PLUGINSDIR\resultado.txt"
  ${If} $1 == ""
    StrCpy $1 "O agente terminou sem explicar o motivo."
  ${EndIf}
FunctionEnd

; Roda o agente com os argumentos de $0 e deixa o código de saída em $0 e a mensagem em $1.
Function RunAgent
  Delete "$PLUGINSDIR\resultado.txt"
  nsExec::Exec '$0 --resultado "$PLUGINSDIR\resultado.txt"'
  Pop $0
  Call ReadResult
FunctionEnd

; ---------------- tela 1: endereço e token ----------------

Function ConnectionPage
  !insertmacro MUI_HEADER_TEXT "Conexão com o sistema" "Copie da tela Operação > Impressoras do painel."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 10u "Endereço do sistema (o mesmo que você abre no navegador):"
  Pop $0
  ${NSD_CreateText} 0 12u 100% 13u "$Server"
  Pop $ServerField
  ${NSD_CreateLabel} 0 34u 100% 10u "Token da impressora:"
  Pop $0
  ${NSD_CreateText} 0 46u 100% 13u "$Token"
  Pop $TokenField
  ${If} ${FileExists} "$INSTDIR\config.json"
    ${NSD_CreateLabel} 0 68u 100% 20u "Este computador já tem o agente configurado. Deixe o token em branco para manter o atual."
    Pop $0
  ${Else}
    ${NSD_CreateLabel} 0 68u 100% 20u "O token aparece uma única vez, ao cadastrar a impressora. Se perdeu, use Novo token no painel."
    Pop $0
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function ConnectionLeave
  ${NSD_GetText} $ServerField $Server
  ${NSD_GetText} $TokenField $Token
  Banner::show /set 76 "Conferindo o token com o servidor..." "Aguarde alguns segundos."
  Call ExtractAgent
  StrCpy $0 '"$PLUGINSDIR\${AGENT}" --verificar --config "$INSTDIR\config.json" --server "$Server" --token "$Token"'
  Call RunAgent
  Banner::destroy
  ${If} $0 == 0
    StrCpy $Connected "$1"
  ${ElseIf} $0 == 3
    ${IfNot} ${Cmd} `MessageBox MB_YESNO|MB_ICONEXCLAMATION "$1$\r$\n$\r$\nInstalar mesmo assim? O agente tenta de novo sozinho quando a conexão voltar." IDYES`
      Abort
    ${EndIf}
    StrCpy $Connected "Ainda sem conexão com o servidor; o agente tenta de novo sozinho."
  ${Else}
    MessageBox MB_ICONSTOP "$1"
    Abort
  ${EndIf}
FunctionEnd

; ---------------- tela 2: impressora ----------------

; $Found = 1 se $Haystack contém $Needle (sem diferenciar maiúsculas).
Function StrContains
  Push $0
  Push $1
  Push $2
  StrCpy $Found 0
  StrLen $0 $Needle
  StrCpy $1 0
  ${Do}
    StrCpy $2 $Haystack $0 $1
    ${If} $2 == ""
      ${Break}
    ${EndIf}
    ${If} $2 == $Needle
      StrCpy $Found 1
      ${Break}
    ${EndIf}
    IntOp $1 $1 + 1
  ${Loop}
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

; $Found = 1 se o nome em $Haystack parece de impressora térmica.
Function LooksThermal
  StrCpy $Needle "POS"
  Call StrContains
  ${IfThen} $Found == 1 ${|} Return ${|}
  StrCpy $Needle "Térmic"
  Call StrContains
  ${IfThen} $Found == 1 ${|} Return ${|}
  StrCpy $Needle "Termic"
  Call StrContains
  ${IfThen} $Found == 1 ${|} Return ${|}
  StrCpy $Needle "Thermal"
  Call StrContains
  ${IfThen} $Found == 1 ${|} Return ${|}
  StrCpy $Needle "80mm"
  Call StrContains
FunctionEnd

; Impressoras instaladas no computador (as mesmas que o agente enxerga rodando como sistema).
Function FillPrinters
  SendMessage $PrinterField ${CB_RESETCONTENT} 0 0
  StrCpy $Suggested ""
  StrCpy $5 0
  ${Do}
    EnumRegKey $6 HKLM "${PRINTERS_KEY}" $5
    ${If} $6 == ""
      ${Break}
    ${EndIf}
    ${NSD_CB_AddString} $PrinterField $6
    ${If} $Suggested == ""
      StrCpy $Haystack $6
      Call LooksThermal
      ${IfThen} $Found == 1 ${|} StrCpy $Suggested $6 ${|}
    ${EndIf}
    IntOp $5 $5 + 1
  ${Loop}
  ${If} $Printer != ""
    ${NSD_SetText} $PrinterField $Printer
  ${ElseIf} $Suggested != ""
    ${NSD_SetText} $PrinterField $Suggested
  ${EndIf}
FunctionEnd

Function RefreshPrinters
  Pop $0
  ${NSD_GetText} $PrinterField $Printer
  Call FillPrinters
FunctionEnd

Function PrinterPage
  !insertmacro MUI_HEADER_TEXT "Impressora" "Escolha a impressora térmica deste caixa."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 20u "$Connected"
  Pop $0
  ${NSD_CreateLabel} 0 24u 100% 20u "Escolha a impressora instalada no Windows. Se ela não aparece, instale o driver do fabricante e clique em Atualizar."
  Pop $0
  ${NSD_CreateComboBox} 0 48u 72% 90u ""
  Pop $PrinterField
  ${NSD_CreateButton} 75% 47u 25% 15u "Atualizar"
  Pop $0
  ${NSD_OnClick} $0 RefreshPrinters
  ${NSD_CreateLabel} 0 70u 100% 20u "Impressora de rede sem driver: digite tcp://IP:9100 (por exemplo, tcp://192.168.0.50:9100)."
  Pop $0
  Call FillPrinters
  nsDialogs::Show
FunctionEnd

Function PrinterLeave
  ${NSD_GetText} $PrinterField $Printer
  ${If} $Printer == ""
    MessageBox MB_ICONEXCLAMATION "Escolha a impressora (ou digite tcp://IP:9100)."
    Abort
  ${EndIf}
FunctionEnd

; ---------------- instalação ----------------

Section "Agente de impressão"
  SetRegView 64
  ; Atualização: o agente que está rodando segura o .exe; para a tarefa antes de trocar.
  ${If} ${FileExists} "$INSTDIR\${AGENT}"
    DetailPrint "Parando o agente atual..."
    nsExec::Exec 'schtasks.exe /End /TN "${TASK_NAME}"'
    Pop $0
    nsExec::Exec 'taskkill.exe /F /IM ${AGENT}'
    Pop $0
    Sleep 1500
  ${EndIf}

  SetOutPath "$INSTDIR"
  File "/oname=${AGENT}" "${AGENT_EXE}"

  DetailPrint "Gravando a configuração..."
  StrCpy $0 '"$INSTDIR\${AGENT}" --configurar --config "$INSTDIR\config.json" --server "$Server" --token "$Token" --printer "$Printer"'
  Call RunAgent
  DetailPrint "$1"
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "$1" /SD IDOK
    ; Primeira instalação que não deu certo: não deixa o .exe solto em Arquivos de Programas.
    ${IfNot} ${FileExists} "$INSTDIR\config.json"
      SetOutPath "$TEMP"
      Delete "$INSTDIR\${AGENT}"
      RMDir "$INSTDIR"
      RMDir "$PROGRAMFILES64\Coliseu PDV"
    ${EndIf}
    SetErrorLevel 2
    Abort
  ${EndIf}
  ; O token só pode ser lido por administradores (S-1-5-32-544) e pelo sistema (S-1-5-18), que roda o agente.
  nsExec::Exec 'icacls.exe "$INSTDIR\config.json" /inheritance:r /grant:r *S-1-5-32-544:F *S-1-5-18:F'
  Pop $0

  WriteRegStr HKLM "${SETTINGS_KEY}" "Server" "$Server"
  WriteRegStr HKLM "${SETTINGS_KEY}" "Printer" "$Printer"

  WriteUninstaller "$INSTDIR\${UNINSTALLER}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayName" "${PRODUCT}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "Publisher" "Coliseu PDV"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\${UNINSTALLER}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\${UNINSTALLER}"'
  WriteRegStr HKLM "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\${UNINSTALLER}" /S'
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "EstimatedSize" "$0"

  DetailPrint "Ligando o agente junto com o Windows..."
  StrCpy $0 '"$INSTDIR\${AGENT}" --instalar --config "$INSTDIR\config.json"'
  Call RunAgent
  DetailPrint "$1"
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "Não consegui ligar o agente junto com o Windows:$\r$\n$1" /SD IDOK
    SetErrorLevel 2
  ${EndIf}
SectionEnd

Function TestPrint
  StrCpy $0 '"$INSTDIR\${AGENT}" --test --config "$INSTDIR\config.json"'
  Call RunAgent
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION "A página de teste não saiu:$\r$\n$1$\r$\n$\r$\nConfira se a impressora está ligada e se o nome escolhido é o dela. Para trocar, rode o instalador de novo."
  ${EndIf}
FunctionEnd

; ---------------- desinstalação ----------------

Section "Uninstall"
  SetRegView 64
  DetailPrint "Removendo a tarefa do agente..."
  nsExec::Exec '"$INSTDIR\${AGENT}" --desinstalar'
  Pop $0
  nsExec::Exec 'taskkill.exe /F /IM ${AGENT}'
  Pop $0
  Sleep 1500
  Delete "$INSTDIR\${AGENT}"
  Delete "$INSTDIR\config.json"
  Delete "$INSTDIR\coliseu-print-agent.log"
  Delete "$INSTDIR\coliseu-print-agent.log.1"
  Delete "$INSTDIR\${UNINSTALLER}"
  RMDir "$INSTDIR"
  RMDir "$PROGRAMFILES64\Coliseu PDV"
  DeleteRegKey HKLM "${UNINSTALL_KEY}"
  DeleteRegKey HKLM "${SETTINGS_KEY}"
  DeleteRegKey /ifempty HKLM "Software\Coliseu PDV"
SectionEnd
