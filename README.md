# Imperium · Controle de Acesso

Portaria e área do morador com identidade Imperium, visitas, encomendas, convites temporários, placas, vínculos faciais, reservas e ocorrências.

**Operação local disponível:** [instalação Windows e servidor Linux, sem dependência de internet](./LOCAL.md). O pacote inclui API, contas locais, SQLite, interface e gateway. Testes online continuam no GitHub Pages/Supabase Free; Oracle e VPS paga não foram contratadas. O pacote local precisa ser instalado e homologado na rede real. Não há sincronização automática com o ambiente online.

- [Demonstração](https://horizes.github.io/controle-acesso/)
- [Portaria operacional](https://horizes.github.io/controle-acesso/?ambiente=operacao#portaria)
- [Morador operacional](https://horizes.github.io/controle-acesso/?ambiente=operacao#morador)

Há dois ambientes independentes. A apresentação e os testes online usam GitHub Pages e a API access-api no Supabase existente. Na instalação local, o computador Windows ou servidor Linux executa interface, API, autenticação, SQLite e gateway dentro da rede do condomínio. Uma VPS remota com VPN é uma opção documentada, sem contratação. Nenhum equipamento físico foi instalado ou homologado nesta entrega.

```mermaid
flowchart LR
 P[Portaria e morador na rede local] -->|HTTPS na LAN| A[Servidor local Windows ou Linux]
 A --> B[Contas e banco SQLite locais]
 A --> G[Gateway local]
 G <-->|Rede local| D[Leitores, câmeras e controladoras]
```

## Entradas separadas

A demonstração aceita portaria@imperium.demo, ana@imperium.demo, bruno@imperium.demo e clara@imperium.demo, com senha pública Imperium@2026. Dados fictícios ficam neste navegador. O modo operacional usa exclusivamente Supabase Auth e vínculos em ac_memberships; não aceita contas de exemplo nem recorre à demonstração se a API falhar. Tokens operacionais ficam na memória da página.

No ambiente online, o administrador inicial foi vinculado à conta escolhida pelo proprietário e a senha permanece a mesma. Novos usuários precisam de conta confirmada no Supabase Auth e vínculo com o condomínio. Na instalação local, o primeiro uso cria um administrador com senha própria; ele cadastra os demais usuários no painel. As contas locais não são sincronizadas com o Supabase. Não há envio de mensagens pelo painel.

## Integrações entregues

| Fabricante | Código disponível | Etapa física pendente |
| --- | --- | --- |
| Control iD | Login, ação remota e autorização preventiva por callback Pro | Modelo, firmware, portal, rede e contingência |
| Intelbras | Digest/CGI de abertura, stream multipart e ANPR TrafficJunction | Confirmar contratos e campos no modelo |
| Hikvision | Helper C++ HCNetSDK para ControlGateway | Obter SDK oficial, compilar e homologar |
| ZKTeco | Abertura via ZKBio CVSecurity com API licenciada | Servidor, licença, token e porta |
| Dahua | Contrato para ponte licenciada DSS | Implementar ponte com pacote oficial aprovado |

Não representa compatibilidade universal com todos os produtos das marcas. Face é associação do ID identificado pelo leitor a uma credencial; o site não executa reconhecimento facial nem cadastra biometria no equipamento. ANPR implementado: modelos Intelbras com eventos documentados.

Aceite pelo equipamento não confirma posição física do portão. Não há sensor de posição implementado. Timeout após envio fica indeterminado e não causa repetição automática. Equipamentos vêm desativados e sem homologação; o gateway também exige habilitação explícita.

## Instalação e contratos

- [Guia de implantação e passo a passo de cada aparelho](./IMPLANTACAO.md)
- [Instalação local para Windows e servidor Linux](./LOCAL.md)
- [Preparação da VPS Imperium e proposta de hospedagem](./gateway/cloud/README.md)
- [Oracle Cloud gratuita — instalação e limites](./gateway/cloud/ORACLE.md)
- [Perfis de configuração, inventário e fichas de aceite](./gateway/installation/)
- [Protocolos e limitações por marca](./INTEGRACOES.md)
- [API e administração](./API.md), [OpenAPI](./public/api/openapi.json)
- [Roteiro de apresentação](./GUIA-DEMONSTRACAO.md)

A renovação usa seleção explícita da credencial e preserva seu ID e vínculo facial; homônimos não compartilham identidade. Os testes automatizados cobrem esse fluxo. Antes do piloto, cumprir as pendências por modelo e os ensaios da implantação. As fichas de exemplo não representam homologação física.

## Desenvolvimento

Use Node.js 24 ou superior.

```sh
npm ci
npm test
npm run typecheck
npm run typecheck:server
npm run build
npm run build:server
npm run build:local
npm run test:local
```

No Windows com restrição a fs.realpathSync.native, executar scripts com node --import ./scripts/windows-fs-compat.mjs. Os testes de integração usam equipamentos e autenticação simulados. scripts/check-database.sql valida os RPCs no banco dentro de transação revertida.

docs/ contém o build público do Pages. src/ contém interface; server/ a API; supabase/ migrações e Edge Function; gateway/ o serviço privado, adaptadores, Docker, systemd e modelos WireGuard. .deploy/ é intermediário e não deve ser publicado. Chave de serviço permanece no ambiente do Supabase.
