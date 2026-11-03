'Executa o robo de bases (Node) sem abrir janela - usado pelo Agendador de Tarefas
Dim fso, sh, pasta
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = pasta
sh.Run "node --max-old-space-size=4096 """ & pasta & "\robo.mjs""", 0, True
