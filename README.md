# Nave Zero Online — 0.3b-s75

**Versão atual:** `0.3b-s75`

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

- A causa encontrada nesta versão era **sobreposição de interface no celular**, não erro de normalização do vetor. Com quatro ações visíveis, a fileira de botões do Marionetista avançava sobre a área do joystick. Por isso o `pointerdown` do joystick só começava na faixa esquerda que permanecia descoberta.
- Em telas de até 560 px, as ações do Marionetista agora usam no máximo duas colunas à direita. Em telas extremamente estreitas, passam para uma coluna. Assim, os botões não cobrem a área física do joystick.
- A mudança é ativada somente enquanto o jogador local é um Marionetista vivo em partida; o layout das outras funções permanece como estava.
- A lógica existente de direção, velocidade, colisão, previsão local e snapshots não foi reescrita para mascarar o defeito.
- Os testes específicos do Marionetista presentes na versão recebida foram removidos conforme solicitado. Nenhum teste novo dessa função foi criado.

## Testes executados

- `node --check server.js`
- `node --check websocket.js`
- Extração do JavaScript inline de `index.html` e `node --check` do script extraído.
- `npm test`: **38 testes automatizados aprovados, 0 falhas** após a remoção dos testes específicos do Marionetista.
- Verificação estática do layout móvel: em 320 px de largura a fileira do Marionetista fica separada do joystick; em 360 px a separação é de aproximadamente 46 px.
- Não foi realizado teste em joystick físico nem partida multiplayer real em dispositivos separados neste ambiente.

## Executar localmente

Requer Node.js 20 ou superior.

```bash
npm install
npm start
```

Abra `http://localhost:8080`. O endpoint `/health` verifica se o servidor está respondendo.


## Cosméticos

Os cosméticos usam artes vetoriais originais do Nave Zero, ajustadas a partir de referências visuais fornecidas apenas para direção de variedade, escala e posicionamento. A lógica de gameplay permanece independente da aparência.


## Atualização — tarefas por categoria e falas contextuais
- Configurações: Tarefas Comuns, Médias e Longas (0–5 cada).
- Comuns são sorteadas uma vez por partida e compartilhadas por todos; Médias/Longas variam por jogador.
- Novas tarefas e cadeias de etapas foram integradas às estações existentes do mapa.
- Diálogo de NPCs recebeu novas respostas curtas, relatos de corpo, hipóteses de função e chamadas de voto ligadas às memórias/evidências do NPC.
- Mantidos os ajustes anteriores de distância para ações, descrições de funções, texto de função para fantasmas e visibilidade de portas sabotadas.

## Correção — Jogar de Novo

- O botão de revanche online agora aceita o clique assim que a tela de fim aparece, sem depender de a atualização `ended` da sala já ter chegado ao navegador.
- Foi corrigida a corrida em que o host recriava a sala no mesmo instante em que outro jogador apertava “Jogar de Novo”. O servidor mantém temporariamente o código e o perfil daquele jogador e consegue reanexá-lo à sala recriada sem exigir um segundo clique.
- Código da sala, configurações, quantidade/cadastro de bots e fluxo multiplayer existente continuam preservados.

## Novo mapa — Nexus HQ ☁️🏢

- O jogo agora possui dois mapas selecionáveis na Sala de Espera: **Nave** e **Nexus HQ**. A escolha do host é sincronizada com a sala, salva junto às demais configurações e preservada ao usar **Jogar de Novo**.
- A **Nexus HQ** é uma torre tecnológica acima das nuvens, com corredores e áreas envidraçadas, Nave de pouso, Enfermaria, Descontaminação, Visão, Cafeteria, Armazém, Varanda, Reator, Laboratório, O2, Administração, Elétrica e Comunicações.
- A Descontaminação possui ciclo próprio com portas e botões de entrada/saída. NPCs conhecem o fluxo da câmara e usam a navegação do mapa sem atravessar paredes.
- O mapa adiciona tarefas interativas próprias em seus setores, reaproveitando e ampliando a infraestrutura de minigames existente.
- Sabotagens, reuniões, corpos, denúncias, funções, fantasmas, trilhas do Instrutor, visão, colisões, Comunicações e multiplayer usam os sistemas já existentes e foram integrados ao mapa.
- NPCs usam rotas específicas da Nexus HQ, reconhecem os setores em que encontraram jogadores e podem considerar deslocamentos incompatíveis como evidência contextual, sem receber informações que não tenham observado.
- A arte do mapa é própria do Nave Zero, inspirada apenas no conceito geral de uma base aérea/corporativa tecnológica.
