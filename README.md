# Nave Zero Online — IA, votação e interface

Este pacote continua o jogo existente e preserva as mecânicas não relacionadas a estas correções. A função Metamorfo, suas configurações, botões, ações de IA e mensagens de rede foram removidos.

## Ajustes

- **Botão Atrasado:** preenchimento vermelho translúcido, não apenas borda translúcida.
- **Resultado da votação:** lista os nomes dos personagens que pularam o voto, tanto no jogo local quanto para clientes conectados. Se ninguém pular, informa isso explicitamente.
- **NPCs e corpos:** removida a decisão aleatória que fazia alguns NPCs ignorarem corpos que haviam visto. NPCs que presenciam um corpo passam a procurar e reportar o local, inclusive em partidas com Infiltrados controlados por IA.
- **Reuniões de emergência:** a IA confirma vida, uso restante e cooldown antes de chamar. A decisão de convocar é preservada enquanto o NPC se desloca até o botão, em vez de ser descartada por uma reavaliação diferente ao chegar.
- **Uso de habilidades:** continuam as regras de cooldown do Xerife, Atrasado, Localizador, eliminação, sabotagem e dutos. O cooldown e a situação da partida são verificados antes de executar ações.
- **Falas no mapa:** NPCs relatam o que observaram, sem anunciar o nome da função que possuem. Falas relacionadas a rastrear alguém e testemunhar dutos não revelam a função do falante.
- **Sincronização:** mantidos os controles autoritativos do host, snapshots e encaminhamento de ações existentes; removido o comando de rede da função excluída.
- **Configuração de Infiltrados:** o limite automático continua relacionado ao tamanho da sala: 4–7 jogadores = 1; 8–9 = até 2; 10 ou mais = até 3.

## Validação

Execute `npm test` para a suíte automatizada. O pacote também foi preparado para verificação de sintaxe de `server.js`, `websocket.js` e do JavaScript embutido em `index.html`. Os testes automatizados não substituem a validação visual do joystick, dos resultados e de uma partida multiplayer em aparelhos reais.
