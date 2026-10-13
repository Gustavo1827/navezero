# Nave Zero Online — correções pontuais

Este pacote mantém a estrutura do jogo e reúne as correções multiplayer existentes com os ajustes solicitados para o Xerife, Atrasado, chat escrito, falas dos bots e revanche.

## Alterações incluídas

- **Ícone do Xerife:** substituído por um SVG de arma no estilo visual do jogo.
- **Atrasado sem eliminação direta:** o botão e o comando genérico de eliminação bloqueiam essa função. O Atrasado continua podendo sabotar e usar apenas a habilidade de marcação.
- **Cronômetro privado do Atrasado:** o host mantém a marcação autoritativa; os snapshots enviados a cada cliente incluem a contagem regressiva somente para quem fez a marcação. A vítima e os outros jogadores não recebem esses metadados.
- **Configurações do Atrasado:** chance de 0–100% e quantidade de 0–3; a atribuição fica limitada à quantidade real de Infiltrados. A função permanece sujeita à opção geral de ativação já existente.
- **Chat escrito:** mensagens de até 180 caracteres são sanitizadas, limitadas por taxa e retransmitidas apenas aos membros conectados à mesma sala. A interface cria os elementos de mensagem usando texto, sem interpretar conteúdo como HTML.
- **Bots e funções:** bots podem receber Xerife ou Atrasado conforme os limites configurados; Xerifes bots usam a habilidade dentro das condições de suspeita, alcance, linha de visão e cooldown. Bots Atrasados marcam vítimas em vez de eliminá-las diretamente.
- **Falas contextuais dos bots:** adicionadas frases sobre corpos, jogadores não vistos recentemente, tarefas realmente feitas e suspeitos apoiados pela memória/evidência da IA. Nomes de jogadores e tarefas são obtidos do estado da partida.
- **Nomes únicos e persistentes dos bots:** cada sala tem um cadastro estável de IDs e nomes, sem colisão com nomes humanos na sala; a revanche mantém esse cadastro. A partida offline também reutiliza os nomes enquanto o jogador local mantém o mesmo nome.
- **Jogar de novo:** o host pode reiniciar a mesma sala e o servidor mantém o código, participantes que ainda estão conectados, quantidade de bots e configurações. O reinício continua passando pela validação e pelo fluxo sincronizado já existente.
- Preservadas as correções anteriores de configurações da sala, tarefas/dutos online, votação visual, culling por distância e estados de vitória.

## Testes executados

- `node --check server.js`
- `node --check websocket.js`
- Extração do JavaScript inline de `index.html` e `node --check` do script extraído.
- `npm test`: **30 testes automatizados aprovados, 0 falhas**. Inclui limites da configuração do Atrasado, roteamento do chat isolado por sala, privacidade dos cronômetros nos snapshots, nomes dos bots estáveis na revanche, permissões do host para reiniciar e regressões visuais do código.

Os testes de WebSocket usam clientes simulados contra o servidor local e verificam os eventos e snapshots. **Não foi executada uma sessão real de navegador em três dispositivos físicos**, então a interação visual, a câmera e o comportamento em rede móvel ainda devem ser conferidos numa partida de teste antes de substituir a versão pública.

## Executar localmente

Requer Node.js 20 ou superior.

```bash
npm install
npm start
```

Abra `http://localhost:8080`. O endpoint `/health` verifica se o servidor está respondendo.
