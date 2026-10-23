# Imperium · Acesso & convivência

Demonstração para condomínios com portaria e painel do morador. Identidade visual em preto, dourado e tons naturais.

## Experimente

- [Apresentação](https://horizes.github.io/controle-acesso/)
- [Portaria](https://horizes.github.io/controle-acesso/#portaria)
- [Painel do morador](https://horizes.github.io/controle-acesso/#morador)

Todos os registros são fictícios. As alterações ficam no navegador e podem ser reiniciadas no menu da demonstração. Não há contas reais nem acionamento de equipamentos.

## Fluxos incluídos

- Visitas: cadastro, autorização pelo morador, entrada e saída.
- Encomendas: recebimento e retirada identificada, visíveis para a unidade.
- Convites e QR Code: início, término, renovação e cancelamento.
- Acesso: validação de identificador facial, placa ou código, com bloqueio, prazo e porta permitida. As leituras são simuladas.
- Reservas de espaços, solicitações da portaria e histórico exportável.
- Painel do morador responsivo e estrutura PWA instalável quando servida por HTTPS.

## Desenvolver

Use Node.js 24 ou superior.

```sh
npm ci
npm test
npm run typecheck
npm run dev
```

Para atualizar o site:

```sh
npm run build
```

A saída fica em `docs/`. O GitHub Pages deve publicar a branch `main`, diretório `/docs`. Os caminhos relativos permitem hospedagem na pasta do repositório.

## Instalar no celular

Abra o link do painel do morador em um navegador compatível. No iPhone, use Compartilhar → Adicionar à Tela de Início; no Android, use Instalar aplicativo ou Adicionar à tela inicial. A demonstração inclui manifest, ícones e cache do aplicativo.

## Equipamentos

O motor de autorização é independente do fabricante. O contrato HTTP, a verificação HMAC e o mapeamento de eventos do Monitor Control iD estão em `src/equipment-events.ts`. Perfis de Intelbras e Hikvision orientam a homologação; a conexão real depende da API, do modelo e do firmware. Dahua e ZKTeco estão planejados. Consulte [INTEGRACOES.md](INTEGRACOES.md).

A lógica não processa imagens biométricas nem reconhece rostos por câmera: ela recebe o identificador do leitor e confere a autorização. Endpoints de liberação física não estão habilitados.

## Organização

- `src/experience.tsx`: apresentação, portaria e morador.
- `src/experience.css`: identidade e layouts responsivos.
- `src/demo-model.ts`: operações compartilhadas da demonstração.
- `src/access-engine.ts`: regras de autorização.
- `src/equipment-events.ts`: contrato de integração e assinatura.
- `scripts/check-demo.mjs`: testes de regras, renderização e integração.
- `docs/`: versão compilada para o GitHub Pages.

Fotografia: [Chris Weiher / Unsplash](https://unsplash.com/photos/aerial-view-of-a-modern-apartment-complex-with-courtyard-xkK6BG5CBBM). Dependências mantêm suas licenças próprias.
