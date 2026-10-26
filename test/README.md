# NAVE ZERO ONLINE — RESUMO DO JOGO

**Versão de referência: 0.4b-s2**

Nave Zero Online é um jogo independente de dedução social, tarefas, sabotagens e funções especiais. O projeto é **sem fins lucrativos**, criado de forma experimental **com auxílio de Inteligência Artificial** e inspirado em jogos do gênero, especialmente **Among Us**.

Este é um projeto de fã, não oficial e sem vínculo com a Innersloth. Among Us e suas marcas pertencem aos respectivos proprietários. O Nave Zero possui implementação, sistemas, interface, regras e conteúdos próprios desenvolvidos para o projeto.

---

## COMO FUNCIONA

Os jogadores são divididos principalmente entre **Tripulantes** e **Infiltrados**.

- **Tripulantes** devem completar tarefas, reparar sabotagens, observar comportamentos suspeitos e descobrir quem são os Infiltrados.
- **Infiltrados** tentam eliminar a tripulação, sabotar a nave, enganar os outros jogadores e sobreviver às reuniões.

Os Tripulantes vencem ao concluir todas as tarefas ou eliminar todos os Infiltrados. Os Infiltrados vencem ao alcançar vantagem decisiva sobre os Tripulantes vivos.

A partida pode misturar **jogadores reais e NPCs**, com suporte a partidas online, bots e Partida Livre.

---

## PREDEFINIÇÕES

O host pode usar predefinições para configurar rapidamente uma partida:

### Recursos básicos
Experiência padrão do Nave Zero, sem funções especiais. Indicada para partidas mais simples e focadas em tarefas, suspeitas, reuniões e sabotagens.

### Funções aos montes
Ativa diversas funções especiais. Inclui funções de Tripulante garantidas em quantidade reduzida e aumenta a presença de funções especiais de Infiltrado.

### Todos ajudam
A tripulação recebe várias funções de apoio, enquanto os Infiltrados também ganham funções especiais. É uma configuração mais intensa, com grande variedade de habilidades em uma mesma partida.

### Loucura dos Infiltrados
Predefinição focada nos Infiltrados. Em partidas com três Infiltrados, os três começam como **Parasitas**. As demais funções de Infiltrado ficam com **25% de chance**, enquanto Parasita fica em **100%**.

As configurações continuam editáveis manualmente pelo host; ao alterar valores, a sala deixa de corresponder exatamente à predefinição original.

---

## FUNÇÕES DOS TRIPULANTES

### Tripulante
Função básica. Faz tarefas, repara sabotagens, reporta corpos, participa de reuniões e tenta descobrir os Infiltrados.

### 🧭 Localizador
Pode rastrear temporariamente um jogador próximo e acompanhar sua posição aproximada pelo mapa.

### 🔫 Xerife
Pode atirar em outro jogador. Se acertar um Infiltrado, elimina o alvo; se atirar em um inocente, o próprio Xerife é eliminado.

### 👀 Observador
Pode acompanhar a posição dos jogadores vivos pelo mapa. A habilidade é afetada pela sabotagem de Comunicações.

### ↔️ Instrutor
Função especial obtida após a morte. O Instrutor seleciona um jogador vivo, voa até um local do mapa e marca um ponto. O jogo cria uma **trilha branca brilhante por um percurso caminhável**, respeitando corredores, salas e obstáculos. A trilha é visível para o Instrutor e para o jogador selecionado.

### ⛑️ Paramédico
Libera usos de sua habilidade ao concluir tarefas e pode reviver Tripulantes mortos por meio de seus corpos, respeitando seus limites e recargas.

### 🍕 Preguiçoso
Recebe uma quantidade menor de tarefas próprias. Ao completar todas, contribui com sua cota de tarefas para a tripulação, mas passa a sofrer lentidão.

### 🔧 Engenheiro
Tripulante capaz de usar os dutos por tempo limitado. Possui duração e recarga configuráveis e não pode utilizar a habilidade normalmente durante sabotagem de Comunicações.

### 🪽 Anjo Guardião
Função especial obtida após a morte. O Anjo Guardião pode proteger um jogador vivo contra eliminações de Infiltrados, eliminações do Temporizador, infecção do Parasita e controle do Marionetista. A proteção possui duração configurável e **recarga para proteger de 35 a 60 segundos**. Também é possível configurar se os Infiltrados vivos podem enxergar a proteção.

### 🔊 Barulhento
Tripulante que, ao morrer, dispara um alerta visual e sonoro apontando para o local da morte. A duração do alerta, a chance e a quantidade da função são configuráveis, assim como a possibilidade de os Infiltrados enxergarem o alerta.

### ⚖️ Juiz
Tripulante que desbloqueia sua decisão ao atingir a porcentagem configurada de tarefas. Durante uma reunião, pode usar sua decisão uma vez: se escolher um Infiltrado, o alvo é expulso; se acusar um inocente, o próprio Juiz é expulso.

---

## FUNÇÕES DOS INFILTRADOS

### Infiltrado
Função básica. Pode eliminar Tripulantes, usar dutos, fingir tarefas e realizar sabotagens.

### ⏱️ Temporizador
Não usa a eliminação comum. Em vez disso, marca um Tripulante; após o tempo configurado, a vítima é eliminada automaticamente caso a marca continue válida. Enquanto existir uma marca pendente, não pode marcar outro jogador; a recarga de **Marcar** só começa quando a marca atual for resolvida, inclusive se o alvo for protegido.

### 🧹 Faxineiro
Pode limpar corpos e remover evidências antes que sejam reportadas. A limpeza leva um tempo configurável de **1 a 5 segundos** antes de o corpo desaparecer, além de possuir limite de usos e tempo de recarga configuráveis.

### 🦠 Parasita
Infecta um Tripulante. A infecção pode transformar a vítima em um novo Infiltrado após a reunião, seguindo as regras da função.

### 👻 Espectral
Pode ficar invisível temporariamente. Enquanto invisível, não pode realizar a eliminação normal e pode deixar indícios visuais.

A opção **Intangibilidade** permite atravessar colisões do mapa durante a invisibilidade. Quando ativada, remove o bônus de velocidade e reduz a duração da invisibilidade pela metade. Ao reaparecer dentro de um obstáculo, o jogador é reposicionado no ponto caminhável válido mais próximo.

### ✋ Marionetista
Pode controlar temporariamente um Tripulante próximo. Durante o controle, a vítima perde o comando do próprio personagem e o Marionetista conduz seus movimentos. Ao terminar, os controles e posições são restaurados conforme as regras da habilidade.

---

## TAREFAS

O Nave Zero possui tarefas distribuídas pela nave e separadas em categorias:

- **Tarefas Comuns:** compartilhadas pela tripulação.
- **Tarefas Médias:** atividades intermediárias sorteadas individualmente.
- **Tarefas Longas:** tarefas mais demoradas ou com múltiplas etapas.

O host pode definir quantas tarefas de cada categoria serão usadas. Tripulantes mortos continuam podendo ajudar a equipe completando tarefas quando as regras da partida permitirem.

---

## SABOTAGENS

Os Infiltrados podem prejudicar a tripulação usando sabotagens como:

- **Luzes**, reduzindo a visão dos Tripulantes.
- **Reator**, criando uma emergência que precisa ser resolvida.
- **Comunicações**, bloqueando ou limitando sistemas e algumas habilidades.
- **Portas**, fechando acessos e alterando temporariamente a circulação pelo mapa.

NPCs também entendem sabotagens e podem tentar repará-las conforme a situação.

---

## REUNIÕES E VOTAÇÃO

Corpos podem ser reportados e reuniões de emergência podem ser convocadas quando permitido.

As reuniões possuem fase de discussão e votação. Ao selecionar um jogador para votar, aparecem **✔️ Confirmar** e **❌ Cancelar** dentro da caixa do jogador, evitando votos acidentais.

Jogadores mortos e participantes sem direito a voto respeitam as limitações atuais da partida. Funções especiais continuam seguindo suas próprias regras.

O jogo também possui um sistema separado de **votação para expulsar jogadores da sala**, quando habilitado. Esse voto não se mistura com a votação normal das reuniões. O limite é uma maioria absoluta dos jogadores elegíveis, sem contar o próprio alvo:

**votos necessários = piso(jogadores elegíveis ÷ 2) + 1**

O progresso aparece em tempo real, como **2/4 votos**.

---

## CHAT E COMUNICAÇÃO

O jogo possui frases rápidas e falas contextuais, incluindo suspeitas, relatos e mensagens como:

- Usei a função de [função].
- Usei a função de [função] em [jogador].
- Terminei minhas tarefas.
- Boa!
- Muito bem [jogador].

NPCs interpretam essas falas de acordo com o contexto, suas memórias, suspeitas e informações observadas durante a partida.

Na Sala de Espera há também chat escrito. Alterações feitas pelo host nas configurações aparecem no feed em branco, por exemplo:

**⚙ Velocidade dos jogadores → 1.5x**

Configurações ligadas a funções usam o ícone correspondente, como **👻** ou **🦠**.

---

## NPCs E INTELIGÊNCIA DO JOGO

Os NPCs não funcionam apenas como personagens aleatórios. Eles possuem comportamento contextual e podem:

- realizar tarefas e fingir tarefas;
- observar jogadores e salas;
- criar suspeitas com base em acontecimentos;
- lembrar informações relevantes;
- encontrar e reportar corpos;
- convocar reuniões em determinadas situações;
- votar de acordo com suas suspeitas;
- reagir a dutos, habilidades e comportamentos estranhos;
- usar várias funções especiais quando recebem uma delas;
- conversar usando falas adequadas ao que aconteceu na partida.

A IA dos NPCs trabalha com informações que eles realmente puderam observar ou aprender dentro do jogo, evitando conhecimento total injustificado sempre que possível.

---

## MULTIPLAYER ONLINE

O Nave Zero Online utiliza salas com código e sincronização entre host e jogadores conectados.

O host controla o estado autoritativo da partida e as principais ações são sincronizadas para os demais participantes. Configurações, habilidades, votos, tarefas, reuniões, movimentação e acontecimentos importantes são compartilhados entre os jogadores online.

O sistema **Jogar de Novo** permite ao host recriar a mesma sala após uma partida, mantendo o código e as configurações. Os jogadores anteriores podem retornar à sala recriada sem criar uma partida separada.

---

## SALA DE ESPERA E CONFIGURAÇÕES

Antes da partida, o host pode ajustar diversos parâmetros, como:

- quantidade de Infiltrados;
- velocidade e visão;
- tempos de eliminação, sabotagem, reunião, discussão e votação;
- quantidade de tarefas;
- distância das ações;
- chance, quantidade, duração e recarga das funções especiais;
- quantidade de bots;
- predefinições de partida.

As alterações são sincronizadas com os jogadores da sala.

O menu **Configurações de jogo** pode ser aberto também durante uma partida para alterar preferências pessoais, como volume e teclas, sem conceder acesso às configurações da sala. As configurações da sala continuam sob controle do host.

Sem uma conta, nome, cor, cosméticos, preferências pessoais e configurações salvas continuam armazenados localmente no navegador. Com uma conta conectada, esses dados são carregados e sincronizados com o perfil da conta.

---


## CONTAS OPCIONAIS

A versão 0.4b-s1 adiciona **Minha conta** ao menu inicial. O cadastro é opcional: jogadores sem conta continuam podendo jogar normalmente com um perfil local.

- O ID é gerado pelo servidor no formato `PalavraPalavra#0000` e não pode ser alterado.
- Senhas nunca são armazenadas em texto puro; o servidor usa **scrypt** com salt aleatório.
- A sessão usa cookie **HttpOnly** e **SameSite=Strict**.
- Rotas de perfil exigem uma sessão autenticada e nunca retornam hash ou senha ao cliente.
- Os dados de conta ficam no **Supabase**, nas tabelas `nzo_accounts` e `nzo_sessions`; o servidor não depende mais de `accounts.json` nem de Persistent Disk.
- Configure no backend as variáveis `SUPABASE_URL` e `SUPABASE_SECRET_KEY`. A chave secreta deve existir somente nas variáveis de ambiente do servidor e nunca no `index.html` ou no GitHub.
- O navegador conversa apenas com as rotas `/api/account/*` do Nave Zero; somente o backend acessa diretamente o Supabase.

O perfil local do navegador e o perfil autenticado são mantidos separados. Ao sair da conta, o jogo restaura o perfil local sem apagar os dados salvos no servidor.

---

## PARTIDA LIVRE

A Partida Livre permite testar o mapa, tarefas, funções e habilidades com maior liberdade. É útil para experimentar mecânicas sem depender de uma sala multiplayer completa.

---

## PERSONALIZAÇÃO

O jogo possui seleção de cores e cosméticos para os personagens, além de nomes persistentes para bots dentro das regras da sala. Há também suporte a atalhos de teclado configuráveis.

---

## SOBRE O PROJETO

Nave Zero Online é um **projeto experimental de IA e desenvolvimento de jogos, sem fins lucrativos**, criado para aprendizado, diversão e exploração de ideias de gameplay.

O projeto é inspirado principalmente em **Among Us** e no gênero de dedução social, mas busca desenvolver suas próprias funções, NPCs, sistemas, interfaces, predefinições e regras.

**Projeto independente e não oficial.**

Discord para mods: Discord: https://discord.gg/fPM5Djc5M3