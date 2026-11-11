# Correções de estabilidade — 25/10/2026

Base: Nave Zero Online 0.4b-s2 nexus-dutos-sabotagem-traduzidos.zip.

Alterações pontuais em index.html, sem funções novas de jogo e sem completar traduções:

- A consulta de ações próximas usava `t` para uma tarefa, ocultando a função de tradução. Ao virar Infiltrado no computador da Partida Livre e consultar uma estação com ação falsa, ocorria TypeError e o ciclo de atualização parava. A variável agora se chama pendingTask.
- O painel de sabotagens usava `t` para o tipo de sabotagem e tentava chamá-lo como tradutor. Os quatro botões agora são montados normalmente.
- A barra de sabotagem usava uma variável local `t`, causando ReferenceError antes da inicialização quando havia sabotagem ativa. Corrigido com statusText.
- Rotas e painel de dutos agora verificam referências inválidas; um duto removido não deve interromper a atualização nem deixar o painel aberto sem jogador dentro.
- Eventos de um WebSocket antigo são ignorados após a troca de conexão, evitando que mensagens ou fechamento atrasados alterem a nova sessão/Partida Livre.

Validação:

- Suíte completa: 144 testes aprovados, zero falhas; depois, adicionado mais um teste de recuperação de duto. Os quatro testes do novo arquivo stability-runtime.test.js passaram.
- Chromium local: abertura, Partida Livre em Nave e Nexus, computador, troca de classe/função, morte/reanimação, entrada, conexão e saída dos dutos, nos seis idiomas, sem erros JavaScript.
- Chromium local: quatro sabotagens ativadas pelos botões, com barra de estado atualizando, em ambos os mapas, sem erros JavaScript.
- Partida online local com host, segundo cliente e bots: ambos chegaram ao estado playing e receberam cinco personagens; movimento por teclado no cliente; saída e início de Partida Livre funcionaram sem erros JavaScript.

Limites: testes locais não substituem uma partida longa em dispositivos reais ou pela internet. Contas Supabase e resgates não foram validados com serviços externos porque suas credenciais não estavam configuradas. Esses recursos foram preservados.

Execução e estrutura originais preservadas. Consulte README.md para iniciar o servidor; npm test executa os testes.
