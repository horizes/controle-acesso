# Instalação · central remota Imperium

## Situação da entrega

Frontend no GitHub Pages, API access-api ativa no Supabase e banco ac_* inicializado. Administrador vinculado à conta escolhida pelo proprietário, usando sua senha atual. Não há VPS contratada, túnel configurado ou equipamento homologado. O pacote permite preparar essa instalação; não altera roteador, leitor ou portão automaticamente.

Use o link operacional do README para entrar. Em Leitores e acessos aparecem conexões reais, inicialmente vazias. A demonstração permanece separada.

## Estrutura necessária

Uma VPS Linux da Imperium com Docker Compose ou Node.js 24, armazenamento persistente para recibos, horário sincronizado e WireGuard. No condomínio: roteador com VPN WireGuard ou equipamento equivalente gerenciado pelo instalador, internet, energia e leitores/controladoras compatíveis. Não é necessário instalar o gateway no computador da portaria.

Uma instância/token/volume de gateway por condomínio simplifica isolamento. Cada instância recebe sua própria configuração privada; nunca compartilhar token entre condomínios. Evitar sub-redes sobrepostas; redes de exemplo 10.200.0.0 e 10.201.0.0 devem ser adaptadas ao projeto real. Não publicar portas HTTP, SDK ou administração dos leitores na internet.

## 1. Preparar a VPS e VPN

Copiar o repositório para /opt/imperium/controle-acesso. Instalar Docker/Compose e WireGuard pelos procedimentos oficiais do sistema escolhido. Configurar NTP. Gerar chaves em cada peer; chaves privadas não saem do servidor/roteador correspondente.

```sh
sudo install -d -m 700 /etc/wireguard
sudo sh -c 'umask 077; wg genkey > /etc/wireguard/imperium.key'
sudo sh -c 'wg pubkey < /etc/wireguard/imperium.key > /etc/wireguard/imperium.pub'
```

Preencher gateway/vpn/cloud.conf.example e instalar como /etc/wireguard/wg-imperium.conf com permissão 600. Usar a chave privada gerada, IP VPN privado da central, chave pública do roteador e AllowedIPs somente dos equipamentos autorizados. No roteador, importar configuração equivalente a condominium.conf.example, com sua própria chave privada e IP público da VPS no Endpoint.

```sh
sudo chmod 600 /etc/wireguard/wg-imperium.conf
sudo systemctl enable --now wg-quick@wg-imperium
sudo wg show wg-imperium
```

O roteador deve encaminhar apenas o tráfego autorizado entre VPN e IPs dos equipamentos. Equipamentos precisam ter rota de retorno para 10.200.0.1 via roteador VPN; usar rota ou regra NAT explícita conforme o projeto. Para callbacks Control iD, preservar ou configurar um IP de origem exclusivo que corresponda a sourceIp; NAT compartilhado prejudica essa vinculação. Cada condomínio deve ter caminhos e IPs inequívocos.

| Tráfego | Restrição |
| --- | --- |
| Internet → VPS | UDP 51820 para WireGuard; SSH só da administração |
| VPS → Supabase | HTTPS 443, saída |
| Gateway → equipamentos | Somente IP/porta configurados: HTTP/HTTPS ou SDK do modelo, via VPN |
| Control iD → callback | TCP 8765 no IP privado 10.200.0.1, somente IPs cadastrados |
| Equipamentos → interface de gestão | Somente rede administrativa autorizada |

O gateway abre conexões HTTPS de saída ao Supabase. Não há listener público de comandos. Callback ou rede VPN não substituem as demais validações. A instalação do roteador/firewall depende do modelo e deve ser aplicada pelo responsável técnico.

Referência: [WireGuard Quick Start](https://www.wireguard.com/quickstart/).

## 2. Cadastrar a central e usuários

Entrar como administrador em Portaria operacional → Leitores e acessos → Administração → Gateway. Dar nome à central. Copiar o token exibido uma vez para armazenamento privado. Não enviar por chat ou colocar no GitHub. O banco armazena apenas hash; se perdido, criar outro gateway e desativar o anterior no banco pelo proprietário.

Criar/confirmar usuários no Supabase Auth pelo processo escolhido pela empresa. Em Administração → Usuário, vincular seu UUID, nome, perfil e unidade. O aplicativo não cria senhas nem envia mensagens. O usuário vinculado usa a senha de sua conta atual. Uma conta nesta versão se vincula a um condomínio.

## 3. Preparar arquivos privados

```sh
cd /opt/imperium/controle-acesso
cp gateway/config.example.json gateway/config.private.json
cp gateway/.env.example gateway/.env
chmod 600 gateway/config.private.json gateway/.env
```

Editar config.private.json: endpoint da API implantada, IPs alcançáveis pela VPN, IDs iguais aos cadastrados no painel, canal/portal/ação e modelo. Tokens/senhas ficam somente em gateway/.env; o JSON contém nomes das variáveis. Não enviar esses arquivos ao repositório. Inicialmente manter physicalEnabled false, todos os devices enabled/commissioned false e IMPERIUM_ENABLE_PHYSICAL=no.

O caminho journalFile do Docker é /data/imperium.sqlite. Não trocar por diretório temporário. Recibos persistentes impedem repetição de comandos após reinício.

## 4. Instalar por Docker Compose

```sh
docker compose -f gateway/compose.example.yml build
docker compose -f gateway/compose.example.yml up -d
docker compose -f gateway/compose.example.yml logs --tail=50
```

Configuração usa rede do host para alcançar a VPN e ouvir somente no IP privado. Executa sem root, filesystem somente leitura, capabilities removidas e volume persistente. A VPN deve estar ativa antes da inicialização. O log registra IDs/status, sem credenciais. O modo inicial é dry-run: comandos são recusados e callbacks não liberam. Para obter heartbeat, habilitar o gateway no servidor após cadastrar um equipamento, mantendo o dispositivo desativado e sem homologação.

Não instalar Hikvision SDK no Docker público. Para esse caminho, montar imagem privada com o pacote licenciado ou usar systemd abaixo.

## Alternativa systemd / SDK

Instalar Node.js 24 no caminho configurado na unidade. Criar usuário de serviço imperium, diretório /etc/imperium protegido e copiar o JSON/env com grupo imperium e permissões 640. Ajustar journalFile para /var/lib/imperium-gateway/imperium.sqlite. Copiar gateway/imperium-gateway.service.example para /etc/systemd/system/imperium-gateway.service e conferir caminhos.

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now imperium-gateway
sudo journalctl -u imperium-gateway -n 50 --no-pager
```

Para Hikvision, obter HCNetSDK oficial, headers e bibliotecas compatíveis. Usar gateway/native/CMakeLists.txt, definir a variável de ambiente HCNETSDK_ROOT (com include/ e lib/), compilar e instalar binário privado. Configurar helperCommand com caminho absoluto, bibliotecas e usuário de execução. Sem SDK, esse caminho permanece indisponível. Dahua exige implementar ponte licenciada segundo INTEGRACOES.md antes de habilitar licensedBridgeReady.

## 5. Associar dispositivos e credenciais

No painel: cadastrar controladora com o ID que está no JSON privado. Para ANPR, cadastrar câmera depois e informar actuatorId da controladora do mesmo gateway/acesso. Marcar finalidade online apenas quando a solicitação ocorrer antes da abertura. Monitor é auditoria e nunca autoriza.

Cadastrar moradores e, depois, credenciais com nome, unidade, referência facial interna, placa, validade e acessos. A placa deve ser brasileira no formato aceito pelo sistema. Cadastrar face no leitor pelo processo oficial; em Vínculo facial associar ID da pessoa no leitor ao ID da credencial Imperium exibido em Autorizações. Templates biométricos não passam pelo site.

Control iD: configurar modo Pro online compatível e URL de servidor na VPN, usando /callbacks/ID; validar device_id, portal, IP, relógio e ação. Testar contingência para não permitir visitante vencido com registros locais. Nem toda família tem o mesmo modo/ação.

Intelbras ANPR: comprovar desligamento de abertura nativa automática, definir nativeAutomaticOpeningDisabled true e watchEvents true somente após validação dos eventos/horários/RecNo. Configurar a mesma câmera na API e no JSON privado. Outras marcas não têm ingestão de placas implementada neste pacote.

## 6. Homologar antes de habilitar

Com instalador presente e operação controlada: testar validade futura/vencida, bloqueio, placa desconhecida, face sem vínculo, portal errado, intertravamento, evento duplicado, falha da API/VPN, reinício e perda de ack. Conferir a fiação e a política de emergência do local.

Somente após isso: marcar homologação/habilitação no painel e no JSON privado, definir physicalEnabled true e IMPERIUM_ENABLE_PHYSICAL=yes, e reiniciar o gateway. Ambos os lados precisam concordar. A API exige heartbeat recente. Cada liberação manual registra motivo e expira em 10 s; autorização de leitura expira em até 4 s. Não usar o botão Homologado para substituir testes no hardware.

Aceito significa retorno positivo do equipamento, não sensor de portão aberto. unknown exige conferência; não há repetição automática. Não apagar o volume SQLite nem criar rotina de retry para “resolver” resultado indeterminado.

## Atualização da API

As migrações já foram aplicadas ao projeto existente. Não reaplicar a migração inicial manualmente nesse projeto. Em novo ambiente, revisar tabelas existentes e aplicar migrações na ordem. Bootstrap de administrador deve vincular uma conta Auth existente e estado vazio, sem alterar tabelas de outras aplicações.

npm run build:server gera .deploy/access-api/index.ts e deno.json para publicar a Edge Function access-api. verify_jwt=false é intencional: login/health são públicos, e o corpo da função autentica cada usuário via Supabase Auth e cada gateway via token/HMAC. Nunca remover essa validação. SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são fornecidos pelo ambiente do Supabase; não inserir chaves no fonte.

## Manutenção

Configurar monitoramento de heartbeat/erros, capacidade, backup protegido de banco/recibos/configuração, retenção e rotação de credenciais. Planejar restauração antes de escalar. Plano Free compartilhado não oferece garantia de disponibilidade para operação crítica; avaliar infraestrutura e plano conforme piloto e volume antes de contratar operação contínua. Nenhuma cobrança adicional foi autorizada ou criada neste trabalho.
