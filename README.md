# Nave Zero Online — correções pontuais

Este pacote mantém a estrutura do jogo e reúne as correções multiplayer existentes com os ajustes solicitados para o Xerife, Atrasado, chat escrito, falas dos bots e revanche.

## Alterações incluídas

- **Ícone do Xerife:** substituído por um SVG de arma no estilo visual do jogo.
- **Atrasado sem eliminação direta:** o botão e o comando genérico de eliminação bloqueiam essa função. O Atrasado continua podendo sabotar e usar apenas a habilidade de marcação.
- **Cronômetro privado do Atrasado:** o host mantém a marcação autoritativa; os snapshots enviados a cada cliente incluem a contagem regressiva somente para quem fez a marcação. A vítima e os outros jogadores não recebem esses metadados.
- **Configurações do Atrasado:** chance de 0–100% e quantidade de 0–3; a atribuição fica limitada à quantidade real de Infiltrados. A função permanece sujeita à opção geral de ativação já existente.
- **Chat escrito apenas na sala de espera:** o botão aparece no lobby e desaparece ao iniciar a contagem/partida. O servidor rejeita mensagens fora da sala de espera; mensagens de até 180 caracteres são sanitizadas, limitadas por taxa e retransmitidas apenas aos membros da mesma sala.
- **Bots e funções:** bots podem receber Xerife ou Atrasado conforme os limites configurados; Xerifes bots usam a habilidade dentro das condições de suspeita, alcance, linha de visão e cooldown. Bots Atrasados marcam vítimas em vez de eliminá-las diretamente.
- **Falas contextuais dos bots:** adicionadas frases sobre corpos, jogadores não vistos recentemente, tarefas realmente feitas e suspeitos apoiados pela memória/evidência da IA. Ao discutir um corpo, os NPCs também consideram hipóteses envolvendo Atrasado, Xerife ou Infiltrado conforme as pistas disponíveis.
- **Nomes únicos e persistentes dos bots:** cada sala tem um cadastro estável de IDs e nomes, sem colisão com nomes humanos na sala; a revanche mantém esse cadastro. A partida offline também reutiliza os nomes enquanto o jogador local mantém o mesmo nome.
- **Jogar de novo:** o host pode reiniciar a mesma sala e o servidor mantém o código, participantes que ainda estão conectados, quantidade de bots e configurações. O reinício continua passando pela validação e pelo fluxo sincronizado já existente.
- **Xerife:** intervalo para atirar configurável de 50 a 120 segundos. Ao acertar, apenas o Infiltrado morre; ao errar contra um inocente, apenas o Xerife morre. Ao terminar uma reunião, todos os cooldowns de habilidades entram em recarga completa, incluindo eliminação, sabotagem, dutos, Xerife, Atrasado e Localizador.

## Testes executados

- `node --check server.js`
- `node --check websocket.js`
- Extração do JavaScript inline de `index.html` e `node --check` do script extraído.
- `npm test`: **32 testes automatizados aprovados, 0 falhas**. Inclui limites das configurações, chat exclusivo da sala de espera e isolado por sala, privacidade dos cronômetros nos snapshots, regras do Xerife, recarga das habilidades após reunião, hipóteses dos NPCs, nomes dos bots estáveis na revanche e permissões do host para reiniciar.

Os testes de WebSocket usam clientes simulados contra o servidor local e verificam os eventos e snapshots. **Não foi executada uma sessão real de navegador em três dispositivos físicos**, então a interação visual, a câmera e o comportamento em rede móvel ainda devem ser conferidos numa partida de teste antes de substituir a versão pública.

## Executar localmente

Requer Node.js 20 ou superior.

```bash
npm install
npm start
```

Abra `http://localhost:8080`. O endpoint `/health` verifica se o servidor está respondendo.
