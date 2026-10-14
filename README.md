# Nave Zero Online — correções pontuais

Este pacote mantém a estrutura do jogo e reúne as correções multiplayer existentes com os ajustes solicitados para Xerife, Atrasado, Engenheiro, Marionetista, identificação dos mortos, falas dos NPCs, chat escrito e revanche.

## Alterações incluídas

- **Ícone do Xerife:** substituído por um SVG de arma no estilo visual do jogo.
- **Atrasado sem eliminação direta:** o botão e o comando genérico de eliminação bloqueiam essa função. O Atrasado continua podendo sabotar e usar apenas a habilidade de marcação.
- **Cronômetro privado do Atrasado:** o host mantém a marcação autoritativa; os snapshots enviados a cada cliente incluem a contagem regressiva somente para quem fez a marcação. A vítima e os outros jogadores não recebem esses metadados.
- **Configurações do Atrasado:** chance de 0–100% e quantidade de 0–3; a atribuição fica limitada à quantidade real de Infiltrados. A função permanece sujeita à opção geral de ativação já existente.
- **Chat escrito apenas na sala de espera:** o botão aparece no lobby e desaparece ao iniciar a contagem/partida. O servidor rejeita mensagens fora da sala de espera; mensagens de até 180 caracteres são sanitizadas, limitadas por taxa e retransmitidas apenas aos membros da mesma sala.
- **Bots e funções:** bots podem receber Xerife ou Atrasado conforme os limites configurados; Xerifes bots usam a habilidade dentro das condições de suspeita, alcance, linha de visão e cooldown. Bots Atrasados marcam vítimas em vez de eliminá-las diretamente.
- **Falas contextuais dos NPCs:** frases sobre corpos e locais, perguntas, concordância/discordância, tarefas, suspeitas e sabotagens, condicionadas ao estado da partida e às memórias disponíveis. Testemunhos de dutos e controle só são registrados quando observados; suspeitas e alibis usam o histórico de salas conhecido pela IA.
- **Engenheiro (Tripulante):** pode usar e atravessar dutos por 10–60 segundos; o valor 61 representa tempo infinito. A saída inicia cooldown de 5–25 segundos, e o uso é bloqueado durante sabotagem de comunicações. A configuração limita a quantidade aos Tripulantes elegíveis. A tela de função usa o título “Você é um Tripulante” e a descrição “Engenheiro - Pode usar os sustos”.
- **Marionetista (Infiltrado):** pode controlar um Tripulante próximo por 5–30 segundos, com cooldown de 15–60 segundos. Durante a posse, a vítima não pode agir por conta própria; ao terminar, recupera o controle onde estiver e sai automaticamente do duto se necessário. O Marionetista retorna à posição original. A quantidade vai de 0 a 3 e nunca ultrapassa os Infiltrados elegíveis. A tela usa a descrição solicitada “Marionetista - Controle Tripulantes e cause confusão na nave.”
- **Segurança do controle e memória de NPCs:** o host valida ações multiplayer; inputs e habilidades próprias da vítima controlada são bloqueados. A IA descarta rotas antigas ao iniciar/encerrar posse, registra a sala percorrida e permite que a vítima NPC relate o controle em reuniões. NPCs também reconhecem o uso de dutos por Engenheiros sem tratar isso automaticamente como prova de Infiltrado.
- **Identificação para jogadores mortos:** jogadores mortos veem a função e o nome de cada participante acima do personagem e nas cartas da reunião (por exemplo, “Xerife — Tripulante 1”). Os nomes dos Infiltrados permanecem vermelhos. Para jogadores vivos, as funções dos outros participantes continuam ocultas pelos snapshots personalizados do servidor.
- **Nomes únicos e persistentes dos bots:** cada sala tem um cadastro estável de IDs e nomes, sem colisão com nomes humanos na sala; a revanche mantém esse cadastro. A partida offline também reutiliza os nomes enquanto o jogador local mantém o mesmo nome.
- **Jogar de novo:** o host pode reiniciar a mesma sala e o servidor mantém o código, participantes que ainda estão conectados, quantidade de bots e configurações. O reinício continua passando pela validação e pelo fluxo sincronizado já existente.
- **Xerife:** intervalo para atirar configurável de 50 a 120 segundos. Ao acertar, apenas o Infiltrado morre; ao errar contra um inocente, apenas o Xerife morre. Ao terminar uma reunião, todos os cooldowns de habilidades entram em recarga completa, incluindo eliminação, sabotagem, dutos, Xerife, Atrasado e Localizador.

## Correção de movimento do Marionetista

- O movimento multiplayer foi ajustado para que, enquanto um jogador controla outro, o vetor de entrada seja aplicado uma única vez ao corpo controlado. O personagem Marionetista espelha a posição/animação resultante, evitando processamento redundante das colisões entre os dois avatares.
- A vítima possuída não tem mais seu estado de caminhada apagado dependendo da ordem dos personagens na lista de simulação. Quando o joystick volta a zero ou o input expira, a animação e o movimento param no mesmo tick.
- Os snapshots não interpolam uma transição de posse como se fosse deslocamento normal entre duas posições do mesmo personagem. A troca da relação de controle usa a posição autoritativa correta.
- O joystick zera também quando perde a captura do ponteiro ou a janela perde foco, prevenindo input travado após interrupções.
- A aba de configurações **Marionetista** reutiliza o mesmo vermelho da aba **Atrasado**. Os demais botões não foram alterados.

## Testes executados

- `node --check server.js`
- `node --check websocket.js`
- Extração do JavaScript inline de `index.html` e `node --check` do script extraído.
- `npm test`: **48 testes automatizados aprovados, 0 falhas**. Inclui verificações específicas de movimento, oito direções, vetores diagonais normalizados, input contínuo, soltura/timeout, ordem dos participantes, estado de posse e cor da aba.
- Os testes de WebSocket usam clientes simulados contra o servidor local para verificar eventos e snapshots.
- A frequência de comunicação existente foi mantida: inputs a cada 50 ms e snapshots a cada 150 ms; ela não foi aumentada para mascarar o problema.
- A lógica real de `netUpdateRemote` foi executada em cenários simulados. Uma partida completa em dispositivos físicos com joystick real não foi executada; esse teste precisa ser feito antes de substituir a versão pública.

## Executar localmente

Requer Node.js 20 ou superior.

```bash
npm install
npm start
```

Abra `http://localhost:8080`. O endpoint `/health` verifica se o servidor está respondendo.
