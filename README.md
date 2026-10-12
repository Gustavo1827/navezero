# Nave Zero — Multiplayer online

Esta pasta contém o jogo HTML completo, o servidor de salas/WebSocket e os testes automatizados. O jogo original está preservado em `index.html`; o multiplayer foi acrescentado por cima dele.

## O que está incluído

- Criação de salas com código exclusivo de 6 caracteres (letras maiúsculas e números), por exemplo `A7K9Q2`.
- Tamanho de sala de 4 a 15 participantes, escolhido antes de criar e fixo depois; humanos e bots contam juntos.
- 1 Infiltrado para 4–9 participantes e 3 Infiltrados para 10–15.
- Configurações independentes guardadas por sala; somente o host pode alterá-las no lobby.
- Bots na partida, com tarefas, suspeitas, sabotagens, votações e papéis conforme a lógica existente.
- Sincronização de movimento, personagens, tarefas, mortes, sabotagens, reuniões, votos e resultado final.
- Transferência da liderança para outro jogador se o host sair. Uma contagem regressiva de 5 segundos é cancelada se alguém entrar ou sair; depois aparece uma tela preta de carregamento.
- Tela de fim de partida preta, com estrelas animadas, indicação da equipe vencedora e opções **Jogar de novo** e **Sair**.
- A revanche reutiliza o código e as configurações da sala, redistribuindo funções no começo da rodada. Se a saída do host deixar exatamente 3 participantes contando os bots, a revanche continua com 1 Infiltrado para não bloquear a sala; as partidas novas normais continuam exigindo pelo menos 4.

## Requisitos

- Node.js **20 ou superior**.
- Um navegador moderno.
- Não é necessário executar `npm install`: o projeto não depende de pacotes externos de Node.

## Executar no mesmo computador

1. Extraia `NaveZeroOnline.zip` para uma pasta.
2. Abra um terminal dentro da pasta `NaveZeroOnline`.
3. Execute:

   ```bash
   npm start
   ```

4. Abra **http://localhost:8080** no navegador.
5. Clique em **Criar sala**. O host ajusta tamanho, bots e configurações, salva e inicia quando a sala tiver participantes suficientes.
6. Em outro navegador ou dispositivo, abra o mesmo endereço, clique em **Entrar na sala** e informe o código de seis dígitos.

Para encerrar o servidor, volte ao terminal e pressione `Ctrl+C`.

## Jogar em dispositivos diferentes na mesma rede Wi‑Fi

Execute o servidor no computador que vai hospedar a sala. Descubra o endereço IP local desse computador (no Windows, use `ipconfig`) e abra, no outro dispositivo, `http://IP-DO-COMPUTADOR:8080`. Todos devem usar o endereço do mesmo servidor. Se o firewall perguntar, permita o Node.js na rede privada.

## Hospedar pela internet

O arquivo HTML sozinho não oferece multiplayer. É necessário manter **`server.js` rodando em um serviço que aceite conexões WebSocket**. Hospedagem estática simples, sem servidor Node/WebSocket, não é suficiente.

Opções para publicar:

- Use um serviço de aplicações Node.js com um processo persistente. Defina o comando de inicialização como `npm start`; o serviço deve disponibilizar a porta indicada pela variável `PORT` e aceitar WebSocket upgrades.
- Ou use a imagem Docker deste projeto (`Dockerfile`) num serviço de contêineres que aceite tráfego HTTP/WebSocket.
- Abra o endereço HTTPS público do serviço. Ao carregar a página por HTTPS, o jogo escolhe `wss://` automaticamente para a conexão multiplayer. Se estiver usando um front-end em domínio separado, abra o painel **Entrar na sala** e configure `Servidor multiplayer` com o endereço `wss://...` do servidor.

Não use o endereço `localhost` para convidar amigos pela internet: `localhost` sempre aponta para o próprio dispositivo. Compartilhe o endereço público do servidor e o código da sala.

## Arquitetura e limites importantes

O servidor mantém os códigos, salas, participantes, configurações e encaminhamento das mensagens. **O navegador do host executa a simulação autoritativa da partida** (IA dos bots e regras em tempo real) e envia snapshots para os outros clientes; assim, os dispositivos jogam a mesma partida em rede, em vez de simular partidas locais separadas. Se o host sair, o servidor entrega o último snapshot completo ao novo host e transfere a liderança. A IA dos bots é reiniciada a partir desse estado, pois sua memória interna não é armazenada no snapshot.

As salas existem em memória. Se o processo do servidor reiniciar ou dormir e perder o estado, os códigos ativos deixam de valer. Este projeto é uma base funcional para jogar com pessoas conhecidas, não um servidor competitivo endurecido contra trapaças: o host é confiável e não há contas, banco de dados, moderação ou proteção avançada contra abuso de códigos.

## Testes

Execute:

```bash
npm test
```

Os testes verificam códigos alfanuméricos, salas cheias/inexistentes, tamanho imutável, limite com bots, configurações independentes, cancelamento da contagem ao entrar/sair, bloqueio de novas entradas após o início, transferência do host com papéis preservados, distribuição do resultado final, revanche e condições de vitória após mortes/saídas. Também foram verificadas a sintaxe do JavaScript do jogo e dos arquivos do servidor.

**Nota sobre a validação:** os testes automatizados validam a lógica do servidor e o protocolo de salas. Não substituem uma partida completa testada visualmente em navegador, com várias pessoas e todas as minitarefas; essa verificação manual ainda é recomendada antes de uma publicação pública.

## Interpolação visual experimental (teste em dois dispositivos)

Esta variante interpola apenas a posição e a animação visual dos personagens no cliente entre snapshots do host. Ela **não** habilita movimento local preditivo e não altera a simulação autoritativa, colisões ou validação de ações do host. A sintaxe JavaScript e os 12 testes automatizados foram verificados; ainda é necessário testar uma partida real em dois dispositivos antes de publicar.
