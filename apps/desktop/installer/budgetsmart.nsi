; BudgetSmart setup wizard (NSIS, Modern UI 2).
; Installs the full self-contained app — including the bundled Node runtime
; (the prerequisite the app needs) — plus shortcuts, an uninstaller, and an
; Add/Remove Programs entry. Per-user install (no admin/UAC required).

Unicode true
!include "MUI2.nsh"

!define APPNAME    "BudgetSmart"
!define APPVERSION "0.1.0"
!define PUBLISHER  "BudgetSmart"
!define SRCDIR     "${__FILEDIR__}\..\dist-exe\BudgetSmart-win32-x64"
!define ARP        "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"

Name "${APPNAME}"
OutFile "${__FILEDIR__}\..\dist-exe\BudgetSmart-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "Software\${APPNAME}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define MUI_ABORTWARNING
!define MUI_ICON   "${__FILEDIR__}\..\build\icon.ico"
!define MUI_UNICON "${__FILEDIR__}\..\build\icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\BudgetSmart.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch BudgetSmart"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Section "BudgetSmart (required)" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"

  ; Stop a running instance so files aren't locked during reinstall/upgrade.
  nsExec::Exec 'taskkill /F /IM BudgetSmart.exe /T'

  ; --- the app + bundled prerequisites (Node runtime, Electron, web + backend) ---
  File /r "${SRCDIR}\*"

  ; Shortcuts
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut  "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\BudgetSmart.exe"
  CreateShortcut  "$SMPROGRAMS\${APPNAME}\Uninstall ${APPNAME}.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut  "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\BudgetSmart.exe"

  ; Uninstaller + registry
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\${APPNAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${ARP}" "DisplayName"     "${APPNAME}"
  WriteRegStr HKCU "${ARP}" "DisplayVersion"  "${APPVERSION}"
  WriteRegStr HKCU "${ARP}" "Publisher"       "${PUBLISHER}"
  WriteRegStr HKCU "${ARP}" "DisplayIcon"     "$INSTDIR\BudgetSmart.exe"
  WriteRegStr HKCU "${ARP}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${ARP}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${ARP}" "NoModify" 1
  WriteRegDWORD HKCU "${ARP}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM BudgetSmart.exe /T'
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${ARP}"
  DeleteRegKey HKCU "Software\${APPNAME}"
  ; Note: the user's data in %APPDATA%\budgetsmart is left intact on purpose.
SectionEnd
