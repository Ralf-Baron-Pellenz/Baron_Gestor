; ═══════════════════════════════════════════════════════════
;  Bapell Gestor Pro — Customização do instalador (NSIS)
;
;  O que este script faz:
;   1. Adiciona uma página final com uma caixa de seleção
;      "Fixar o Bapell Gestor Pro na barra de tarefas".
;   2. Se marcada, tenta fixar o atalho na barra de tarefas usando
;      o método COM do Windows (funciona no Windows 10 e no 11 até
;      a versão 23H2).
;   3. No Windows 11 24H2, a Microsoft bloqueou a fixação
;      programática. Nesse caso, a tentativa simplesmente não terá
;      efeito — não trava nem dá erro. Por isso, na PRIMEIRA vez que
;      o app abre, ele mostra uma dica ensinando a fixar manualmente
;      (essa parte fica no código do app, não aqui).
;
;  O atalho na área de trabalho e no Menu Iniciar é criado
;  automaticamente pelo electron-builder (configurado no package.json),
;  sem depender deste script.
; ═══════════════════════════════════════════════════════════

; Variável que guarda o estado da caixa de seleção
Var FixarBarraCheckbox
Var FixarBarraState

; ── Página final customizada com a caixinha ──
; Usa a página "finish" do NSIS para exibir a opção junto do
; "Executar o Bapell Gestor Pro agora".
!macro customFinishPage
!macroend

; ── Função que efetivamente tenta fixar na barra de tarefas ──
; Recebe o caminho do atalho (.lnk) e tenta o verbo "taskbarpin".
Function PinToTaskbar
  ; Caminho do atalho criado pelo instalador no Menu Iniciar
  ; ${PRODUCT_NAME} e afins são resolvidos pelo electron-builder.
  StrCpy $0 "$SMPROGRAMS\${PRODUCT_NAME}.lnk"

  ; Tenta o método via PowerShell + Shell.Application (verbo taskbarpin).
  ; No Windows 10 / 11 <=23H2 funciona; no 24H2 o verbo é ignorado
  ; pelo sistema (não gera erro, apenas não fixa).
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$$s = (New-Object -ComObject Shell.Application); $$f = $$s.Namespace((Split-Path \"$0\")); $$i = $$f.ParseName((Split-Path \"$0\" -Leaf)); $$i.InvokeVerb(\"taskbarpin\")"'
  ; Não verificamos retorno de propósito: se falhar, seguimos em silêncio.
FunctionEnd

; ── Gancho executado após a instalação dos arquivos ──
!macro customInstall
  ; Nada obrigatório aqui: o atalho é criado pelo electron-builder.
  ; A fixação real acontece na página final (customFinish), abaixo,
  ; só se o usuário marcar a caixa.
!macroend

; ── Página final: adiciona a caixa de seleção "Fixar na barra" ──
; O electron-builder/NSIS chama estas macros ao montar a finish page.
!macro customFinishPageShow
  ; Cria a caixa de seleção logo abaixo das opções padrão da tela final.
  ${NSD_CreateCheckbox} 120u 130u 100% 12u "Fixar o ${PRODUCT_NAME} na barra de tarefas"
  Pop $FixarBarraCheckbox
  ; Já deixa marcada por padrão (o cliente pode desmarcar).
  ${NSD_Check} $FixarBarraCheckbox
  SetCtlColors $FixarBarraCheckbox "" "${MUI_BGCOLOR}"
!macroend

!macro customFinishPageLeave
  ; Lê o estado da caixa ao sair da tela final.
  ${NSD_GetState} $FixarBarraCheckbox $FixarBarraState
  ${If} $FixarBarraState == ${BST_CHECKED}
    Call PinToTaskbar
  ${EndIf}
!macroend
