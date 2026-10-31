; Ensayo's own steps in the Windows installer (Tauri NSIS hooks).
;
; The uninstaller's "Delete the application data" box removes the app's folder under %LOCALAPPDATA% (speech models,
; answer audio, settings and the default data folder). When it is ticked this also removes every API key Ensayo
; saved in Credential Manager, so nothing of the app is left behind. A data folder the user chose somewhere else
; (their Drive, say) is never touched: it holds their stories.
;
; The account names are the list in src-tauri/src/keys.rs (ACCOUNTS). Windows stores each one as "<account>.<service>".

; The ensayo-llm helpers (processor and graphics card) can outlive Ensayo for a few seconds (an update closes the app
; without stopping it); close them so their exes aren't locked when the installer replaces or removes them.
!macro NSIS_HOOK_PREINSTALL
  !insertmacro CheckIfAppIsRunning "$INSTDIR\ensayo-llm.exe" "${PRODUCTNAME}"
  !insertmacro CheckIfAppIsRunning "$INSTDIR\ensayo-llm-vulkan.exe" "${PRODUCTNAME}"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro CheckIfAppIsRunning "$INSTDIR\ensayo-llm.exe" "${PRODUCTNAME}"
  !insertmacro CheckIfAppIsRunning "$INSTDIR\ensayo-llm-vulkan.exe" "${PRODUCTNAME}"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; An update runs the old uninstaller with /UPDATE ($UpdateMode = 1, set in Tauri's installer.nsi from the command
  ; line). Keys and data must survive that, so only a real uninstall with the box ticked gets here.
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    nsExec::Exec 'cmdkey /delete:claude.Ensayo'
    Pop $0
    nsExec::Exec 'cmdkey /delete:openai.Ensayo'
    Pop $0
    nsExec::Exec 'cmdkey /delete:gemini.Ensayo'
    Pop $0
    nsExec::Exec 'cmdkey /delete:groq.Ensayo'
    Pop $0
    nsExec::Exec 'cmdkey /delete:cerebras.Ensayo'
    Pop $0
    nsExec::Exec 'cmdkey /delete:mistral.Ensayo'
    Pop $0
    nsExec::Exec 'cmdkey /delete:openrouter.Ensayo'
    Pop $0
    nsExec::Exec 'cmdkey /delete:compatible.Ensayo'
    Pop $0
    RMDir /r "$LOCALAPPDATA\${BUNDLEID}"
  ${EndIf}
!macroend
