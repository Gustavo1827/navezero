# Nave Zero Online — pacote de correções

Este pacote preserva a estrutura existente do jogo e inclui as correções multiplayer já presentes na versão-base, além da votação visual, da função Xerife e da nova função Atrasado.

## Alterações incluídas

- Resultados da votação na mesma tela da reunião por 10 segundos, com bolinhas usando a cor de cada votante; as bolinhas são removidas ao entrar na tela de ejeção.
- Função Xerife exclusiva de Tripulantes, com botão de disparo, alvo dentro do alcance e linha de visão, cooldown configurável e validação autoritativa no host.
- Se o alvo for Infiltrado, o alvo e o Xerife são eliminados; se for Tripulante, o alvo permanece vivo e o Xerife é eliminado. A condição de vitória é verificada após a ação.
- Aba Xerife na seção Funções, com cooldown de 10–60 s, chance de 0–100% e quantidade de 0–15; as configurações usam o sistema existente de salvamento e sincronização da sala.
- Frases prontas para alegar, negar ou suspeitar das funções Tripulante, Infiltrado, Xerife e Localizador.
- Descrições de funções e classes atualizadas para os textos solicitados.
- Função Atrasado exclusiva dos Infiltrados, com botão vermelho de relógio, ativação/desativação na aba Funções e duração da marcação configurável entre 5 e 40 segundos.
- Cooldown de marcação reutiliza o valor de “Tempo para matar”, sem criar um segundo parâmetro de cooldown.
- O host valida alvo, alcance, linha de visão, vida, equipe, estado da partida e cooldown; a contagem regressiva é autoritativa, pausa durante reuniões, elimina a vítima ao terminar e é sincronizada por snapshots. Marcações duplicadas na mesma vítima são bloqueadas e as marcações são limpas quando a vítima morre ou a partida termina.
- Preservadas as correções anteriores de configurações de sala, tarefas e dutos online, sincronização, bots e culling visual por distância.

## Testes executados

- `node --check server.js`
- `node --check websocket.js`
- Verificação sintática do script JavaScript embutido em `index.html`.
- `npm test`: 24 testes automatizados aprovados, incluindo os limites e a persistência da configuração do Atrasado.

Os testes automatizados cobrem regras e fluxos do código, mas não substituem uma partida real no navegador. A validação visual e funcional com um host e dois clientes conectados ainda deve ser feita em uma sala de teste antes de atualizar a implantação pública.

## Executar localmente

Requer Node.js 20 ou superior.

```bash
npm install
npm start
```

Abra `http://localhost:8080`. O endpoint `/health` informa se o servidor está respondendo.
