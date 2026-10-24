# Instalação · central remota Imperium

> **Atualização de arquitetura:** o caminho escolhido é a [central local Windows ou Linux](./LOCAL.md), com autenticação, banco e decisões na LAN, sem internet na operação. Os procedimentos de VPS/VPN deste documento ficam como alternativa de conectividade remota; não são pré-requisito da versão local. Oracle e DigitalOcean não foram contratadas. As instruções por aparelho continuam exigindo adaptação à LAN e homologação presencial.

> **Facial e placa:** consultar primeiro [COMPATIBILIDADE.md](./COMPATIBILIDADE.md) para ISAPI, CGI, montagem com leitor isolado/controladora separada e assistentes de cadastro, verificação e comissionamento. O roteiro Hikvision/HCNetSDK abaixo é a alternativa nativa; DSS continua dependendo da ponte oficial. No Control iD, faceIdentifierIds e os endpoints de disponibilidade precisam corresponder ao firmware instalado.

Este guia reúne a instalação da central, VPN e os procedimentos individuais dos aparelhos. A seção **Instalação dos aparelhos** contém roteiros de VPS, roteador/switch, ligação ao portão/fechadura, Control iD, Intelbras, Hikvision, ZKTeco e Dahua, com exemplos privados, aceite e diagnóstico.

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

---

## Instalação dos aparelhos

Revisão: 23/10/2026. Este complemento acompanha o código deste repositório. Os modelos do condomínio ainda não foram informados. Há procedimentos por família e exemplos de manuais específicos; nenhum desses exemplos constitui homologação de um produto ou uma recomendação de compra.

O roteiro cobre preparação física, rede, configuração no equipamento, associação no Imperium, configuração do gateway, teste, aceite e desativação. A pinagem, fonte, fixação, proteção e fiação final devem corresponder ao **modelo exato e à revisão do manual**. Sem esses dados, a ligação elétrica fica PENDENTE. Não existe uma pinagem única para uma marca.

### Ordem de trabalho e documentos

1. Preencher gateway/installation/inventario.example.csv com cada aparelho real. O arquivo é uma ficha em CSV, não um importador da plataforma.
2. Obter o manual oficial da revisão do equipamento e registrar sua URL/data. Guardar evidências da ligação e cópia da configuração anterior em armazenamento privado.
3. Instalar a VPS e a VPN e verificar comunicação sem acionamento.
4. Preparar e testar cada equipamento localmente, em bancada ou acesso isolado, com instalador presente.
5. Cadastrar usuários, gateway, dispositivos, credenciais e vínculos no Imperium.
6. Executar o teste integrado supervisionado e preencher gateway/installation/aceite.example.csv.
7. Liberar um piloto somente depois de resolver as pendências e aprovar os resultados. Não há aparelho já aprovado nesta entrega.

Os arquivos preenchidos podem conter dados internos da instalação: salvá-los fora do repositório público. As versões .example não possuem credenciais.

### A. VPS da Imperium e gateway

**Objetivo:** executar o gateway na estrutura da Imperium, sem serviço instalado no computador da portaria.

1. Disponibilizar uma VPS Linux 64 bits, acesso administrativo, horário sincronizado, espaço persistente e endereço público para a VPN. Confirmar arquitetura e sistema suportados pelo SDK caso exista Hikvision. Registrar provedor, sistema, responsável e política de backup.
2. Acessar a VPS pela administração autorizada. Confirmar sistema com os comandos abaixo. Os exemplos a seguir usam Ubuntu; não aplicar comandos de outra distribuição.

~~~sh
cat /etc/os-release
uname -m
timedatectl status
~~~

3. Instalar Docker Engine e o plugin Compose conforme o [procedimento oficial para Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Usar o repositório oficial e pacotes compatíveis com a distribuição. Se já houver Docker, verificar a instalação em vez de remover pacotes ou substituir serviços de outros aplicativos.
   Em uma **VPS Ubuntu nova, sem Docker instalado**, a configuração do repositório e instalação pode ser feita assim, após confirmar a versão suportada no link oficial:

~~~sh
sudo apt-get update
sudo apt-get install --yes ca-certificates curl
sudo install -d -m 0755 /etc/apt/keyrings
sudo curl --fail --silent --show-error --output /etc/apt/keyrings/imperium-docker.asc https://download.docker.com/linux/ubuntu/gpg
sudo chmod 0644 /etc/apt/keyrings/imperium-docker.asc
imperiumUbuntuSuite=$(awk -F= '$1=="VERSION_CODENAME"{print $2}' /etc/os-release)
imperiumUbuntuArch=$(dpkg --print-architecture)
printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/imperium-docker.asc\n' "$imperiumUbuntuSuite" "$imperiumUbuntuArch" | sudo tee /etc/apt/sources.list.d/imperium-docker.sources >/dev/null
sudo apt-get update
sudo apt-get install --yes docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
~~~

   Verificar cada retorno antes de continuar. Não adicionar esse repositório por cima de outra instalação Docker sem revisão. Registrar as versões instaladas e repetir os testes quando forem atualizadas.
4. Instalar os utilitários de rede e obtenção do código no Ubuntu. Os comandos deste guia são instruções para a VPS futura; não foram executados em um servidor do condomínio.

~~~sh
sudo apt-get update
sudo apt-get install --yes wireguard git curl jq netcat-openbsd
sudo systemctl enable --now docker
sudo timedatectl set-ntp true
sudo docker version
sudo docker compose version
~~~

5. Em uma instalação nova, obter o repositório no diretório de serviço:

~~~sh
sudo install -d -m 755 /opt/imperium
sudo git clone https://github.com/horizes/controle-acesso.git /opt/imperium/controle-acesso
cd /opt/imperium/controle-acesso
git rev-parse HEAD
~~~

6. Guardar a revisão do código utilizada. Em servidor existente, revisar diferenças antes de atualizar; não executar outro clone sobre um diretório já configurado.
7. Configurar a VPN conforme a seção B e gateway/vpn/cloud.conf.example. As chaves privadas são geradas no próprio peer. Liberar no firewall da VPS a porta UDP da VPN e preservar o acesso administrativo autorizado. Os leitores não devem receber exposição pública.
8. No Imperium operacional, abrir Leitores e acessos → Administração → Gateway. Criar a central. Copiar seu token, exibido uma vez, para o arquivo de ambiente privado. O token é do gateway, não uma chave service_role.
9. Criar os arquivos privados conforme a seção 3 deste guia, preservando .dockerignore. Editar com editor local; não colar senhas em comandos que fiquem no histórico do shell.
10. Em config.private.json, usar apenas os dispositivos que realmente serão instalados. Os JSON em gateway/installation/ são **objetos individuais da lista devices**, não configurações completas do serviço. Copiar o objeto adequado, preencher seus campos e remover dispositivos de exemplo não utilizados.
11. Manter inicialmente physicalEnabled false, enabled false e commissioned false nos dispositivos, e IMPERIUM_ENABLE_PHYSICAL=no no ambiente. A API deve apontar para o endpoint operacional já implantado.
12. Validar a estrutura e a conectividade antes de iniciar:

~~~sh
cd /opt/imperium/controle-acesso
jq empty gateway/config.private.json
curl --fail --silent --show-error https://abweepruixcyetrzefhk.supabase.co/functions/v1/access-api/v1/health
sudo wg show wg-imperium
sudo docker compose -f gateway/compose.example.yml config --quiet
~~~

13. A verificação Compose acima é silenciosa para não imprimir variáveis privadas. O volume SQLite deve permanecer persistente. Não usar down --volumes na atualização.
14. Construir e iniciar com a VPN já ativa:

~~~sh
sudo docker compose -f gateway/compose.example.yml up --build -d
sudo docker compose -f gateway/compose.example.yml ps
sudo docker compose -f gateway/compose.example.yml logs --tail=50
~~~

15. Cadastrar um dispositivo desativado e habilitar somente a central para verificar heartbeat, mantendo o dispositivo sem habilitação física. Pelo formulário Configurar do dispositivo, selecionar central habilitada, equipamento desativado e homologação ainda não concluída. Confirmar que o painel atualiza o último contato. API indisponível no log exige conferir URL, token e habilitação da central; não gerar novos tokens em sequência sem diagnóstico.

**Aceite:** serviço estável, horário correto, API acessível, VPN ativa, arquivos privados protegidos, volume persistente, central com contato recente e nenhum acionamento em modo inicial. O gateway pode ser instalado em modo desativado mesmo com as pendências funcionais registradas na seção K.

### B. Roteador VPN e switch do condomínio

**Exemplo de endereçamento de um condomínio:** central VPN 10.200.0.1; peer do roteador 10.200.0.2; LAN dos equipamentos 10.201.0.0/24. São endereços ilustrativos. Preservar a rede existente ou definir outra sem sobreposição; não mudar a LAN de um condomínio em funcionamento apenas para copiar o exemplo.

1. Identificar marca, modelo, firmware e suporte a WireGuard. Se não houver suporte, definir um roteador VPN próprio com o responsável pela rede. Não existe importação WireGuard universal em roteadores domésticos.
2. Fazer backup da configuração atual, registrar LAN, gateway, DHCP, VLANs, portas livres e acesso de administração. Identificar por onde a equipe recupera o acesso se uma rota estiver incorreta.
3. Conectar os equipamentos à VLAN/rede definida no projeto. No switch, conferir velocidade de link e orçamento PoE **somente para modelos que aceitem o padrão PoE fornecido**. Outros aparelhos usam sua fonte especificada; RJ45 não prova suporte a PoE.
4. Reservar IPs ou configurar endereços fixos fora da faixa dinâmica. Registrar IP, máscara, gateway, DNS e porta de cada equipamento no inventário. Não reutilizar o mesmo IP.
5. Criar no roteador uma interface WireGuard e seu par de chaves. Compartilhar apenas a chave pública com a central.
6. Configurar o peer da VPS com sua chave pública, endereço público e porta UDP. No roteador, limitar AllowedIPs/Allowed Address ao IP VPN da central e redes realmente necessárias. O túnel não precisa substituir a rota padrão da internet.
7. Se o roteador estiver atrás de NAT, configurar o keepalive de acordo com o projeto; o exemplo entregue usa 25 s. No peer da VPS, cadastrar o IP VPN do roteador e os IPs reais dos equipamentos permitidos.
8. Criar as rotas de ida e retorno. Se o roteador VPN não for o gateway padrão dos leitores, criar uma rota de retorno no gateway correto. Para callback Control iD, o gateway precisa observar o sourceIp cadastrado; não mascarar todos os aparelhos com um IP compartilhado.
9. Aplicar regras de firewall específicas. Permitir somente IPs/portas necessários: central → HTTP/HTTPS/SDK dos dispositivos; leitor Control iD → 10.200.0.1 TCP 8765; retorno das conexões autorizadas. Não desligar o firewall para fazer o teste funcionar.
10. Conferir handshake e contadores nos dois peers. Da VPS, testar as portas reais sem enviar comandos de abertura:

~~~sh
nc -vz -w 3 10.201.0.10 80
nc -vz -w 3 10.201.0.20 80
nc -vz -w 3 10.201.0.21 80
nc -vz -w 3 10.201.0.30 8000
~~~

11. Substituir os endereços e portas pelos confirmados no inventário. Um teste de TCP confirma alcance, não compatibilidade da API. Se ICMP estiver bloqueado, falha de ping isolada não prova falha de VPN.
12. Verificar o caminho de retorno do leitor ao callback privado da central. O teste deve sair da rede do equipamento; não basta testar a partir da própria VPS.
13. Reiniciar apenas o peer de bancada/janela de manutenção e confirmar restabelecimento, sem repetir comandos físicos.

**RouterOS 7, quando for o roteador escolhido:** em WireGuard criar a interface; em IP → Addresses atribuir seu endereço; em WireGuard → Peers cadastrar chave pública da VPS, endpoint, porta, allowed address e keepalive; em IP → Routes conferir a rota; em IP → Firewall aplicar as regras específicas acima antes de regras de descarte aplicáveis. Registrar nomes reais de interface e VLAN. Este é um roteiro de configuração, não um script que substitui a política de rede existente. [Referência oficial RouterOS](https://help.mikrotik.com/docs/spaces/ROS/pages/69664792/WireGuard).

**Aceite:** handshake recente, tráfego de ida/retorno, IPs de origem esperados, acesso apenas aos equipamentos previstos e ausência de redirecionamento público de portas dos leitores. [Referência WireGuard](https://www.wireguard.com/quickstart/).

### C. Ligação da controladora à fechadura ou central do portão

Executar com instalador responsável, equipamento desenergizado durante a ligação e manual da controladora **e** do acionamento disponíveis. O software não determina tensão, polaridade, capacidade de contato ou função dos bornes.

1. Identificar se a saída é contato seco de relé ou saída que fornece tensão; registrar no inventário. Confirmar a entrada que receberá o comando no aparelho seguinte.
2. Para central de motor que aceite pulso de contato seco, identificar a entrada de botoeira/abertura e seu comum **no manual da central**. A nomenclatura varia: não escolher um borne apenas porque está escrito COM.
3. Confirmada essa compatibilidade, o relé de comando fecha o circuito entre os dois terminais previstos da entrada de controle. O leitor não é ligado diretamente aos enrolamentos ou à alimentação do motor. Se houver sinal com tensão ou interface diferente, o projeto precisa de módulo de interface adequado.
4. Para fechadura, identificar tipo de funcionamento, fonte, corrente, estado dos contatos e proteção conforme o diagrama específico. Não presumir que toda fechadura usa NA ou que todo eletroímã usa o mesmo circuito.
5. Ligar botoeira, sensor e módulo externo somente nos bornes documentados. Confirmar o funcionamento do sistema de saída/emergência conforme o projeto do local; não alterar esses circuitos para permitir um teste do aplicativo.
6. Reenergizar e testar pelo comando local do fabricante, com a passagem isolada e supervisão. Confirmar uma única porta, sentido, duração do pulso e retorno ao estado esperado.
7. Identificar fisicamente os cabos e anexar a referência do diagrama usado à ficha da instalação. Se o relé funciona, mas a central não responde, conferir entrada, lógica e interface; não aumentar o pulso repetidamente como diagnóstico.

Esquema funcional, sem pinagem:

~~~mermaid
flowchart LR
  L[Leitor ou câmera] --> C[Controladora de acesso]
  C -->|Contato ou interface especificados| P[Entrada de comando da central]
  P --> M[Motor ou fechadura]
~~~

**Aceite:** ligação conferida com os dois manuais, teste local aprovado e emergência/saída preservadas. Sem modelo da central/motor/fechadura informado, esta etapa elétrica permanece pendente.

### D. Control iD facial com módulo externo — referência iDFace/SecBox

**Escopo:** identificação no aparelho e decisão preventiva no servidor, quando o modelo/firmware suportar o modo Pro utilizado pelo gateway. Exemplo de configuração: gateway/installation/controlid-secbox.example.json. O objeto usa action sec_box; não usar door por suposição em um iDFace com módulo externo.

1. Conferir modelo e revisão no [guia rápido iDFace](https://www.controlid.com.br/userguide/idface.pdf) e no [manual iDFace](https://www.controlid.com.br/docs/idface-pt/). Fixar o equipamento segundo seu gabarito, ambiente e alimentação prescritos. A fonte e os conectores de outro iDFace/família não são automaticamente equivalentes.
2. Instalar o módulo de acionamento externo no lado definido pelo projeto e ligar leitor, módulo, fonte, fechadura, botoeira e sensor segundo o diagrama do modelo. Usar a seção C para a interface com uma central de portão; não copiar cores de fios de outro fabricante.
3. Inicializar o dispositivo, definir credenciais administrativas próprias e guardar recuperação em local privado. Se já existir uma integração ativa, registrar suas configurações e preparar a migração em bancada/acesso separado antes de alterar o modo online.
4. Configurar IP, máscara, gateway e relógio/NTP. Confirmar acesso web pela rede privada. Criar conta de integração com permissões mínimas que efetivamente permitam login e a ação necessária; se o firmware não separar permissões, registrar essa limitação.
5. Em equipamento compatível com o manual citado, MENU → ACESSO → SECBOX permite conferir sensor e parâmetros do relé. Definir a duração conforme a fechadura/central, testar o comando local de porta com supervisão e registrar o resultado. [Configuração oficial de acesso](https://www.controlid.com.br/docs/idface-pt/acesso/acesso/).
6. Obter os valores reais de device_id, portal_id e ID da SecBox pela ferramenta/API oficial de consulta do equipamento. Registrar a fonte da leitura. O ID de exemplo 65793 encontrado em documentação não identifica todos os módulos. O server_id criado no próximo passo também não é o device_id do leitor.
7. Preparar a central no Imperium. Cadastrar social-idface com provider controlid, acesso social, método face e finalidade online; usar o modelo real. Selecionar a central correta. Manter o dispositivo desativado até o teste integrado autorizado.
8. Copiar o objeto de exemplo para devices no JSON privado. Preencher baseUrl, vendorDeviceId, portalId, sourceIp e secBoxId. Em gateway/.env preencher CID_USERNAME e CID_PASSWORD. Os IDs em string evitam truncamento de números grandes; não converter SecBox de 64 bits para número JavaScript.
9. Configurar o servidor online no leitor pelo procedimento oficial. O endereço de exemplo do callback deste perfil é:

~~~text
http://10.200.0.1:8765/callbacks/social-idface
~~~

10. No procedimento oficial, criar/reutilizar um objeto devices que represente esse servidor e guardar seu ID; apontar online_client.server_id para esse ID; configurar modo Pro com general.online=1, general.local_identification=1 e general.ihm_enterprise_mode=0. Utilizar os campos e tipos exigidos pela versão do equipamento. Não confundir cadastro do servidor com cadastro de pessoa. [Passos oficiais do modo online](https://www.controlid.com.br/docs/access-api-pt/modos-de-operacao/configurar-modo-online/).
11. O firmware acrescenta os nomes dos callbacks ao endereço base. Este gateway implementa /new_user_identified.fcgi e /device_is_alive.fcgi. Se o firmware exigir /session_is_valid.fcgi, imagens, templates ou outro callback, a instalação fica bloqueada até adaptar e testar o endpoint; não marcar a integração como pronta só porque respondeu HTTP.
12. Cadastrar a face pelo processo oficial do leitor/software do fabricante e guardar o user_id real, sem enviar imagens ao site. No Imperium, cadastrar a credencial com unidade, validade, referência facial interna e acesso social. Em Vínculo facial, selecionar social-idface, informar o ID externo do usuário no leitor e o ID da credencial exibido em Autorizações.
13. Conferir que o rosto é identificado no aparelho. Identificação não prova autorização: validar retorno de negativa para pessoa sem vínculo, bloqueada, futura e vencida.
14. Após teste local aprovado e janela supervisionada autorizada, executar a habilitação da seção J e testar o fluxo integrado. O comando deve alcançar somente a SecBox e o acesso cadastrados.
15. Interromper a VPN em teste e conferir a contingência real. Uma regra local que autorize o visitante vencido invalida o aceite da política central. Configurar a contingência suportada ou interromper a homologação; não assumir que o servidor controla o leitor quando a comunicação caiu.

**Aceite:** IP/dispositivo/portal conferidos, face vinculada à credencial vigente, negações funcionando, uma liberação por evento, porta correta e contingência documentada. Biometrias não são sincronizadas automaticamente pelo Imperium.

**Desativação:** bloquear o dispositivo na API e no JSON privado; desabilitar a central se necessário; impedir o caminho de acionamento e seguir o plano de retorno local aprovado. Se o leitor estava em Pro, tratar explicitamente sua configuração de servidor e contingência. Parar o gateway sozinho não garante o comportamento de decisão local.

### E. Control iD com relé direto e catraca

**Relé direto:** gateway/installation/controlid-door.example.json.

1. Executar inventário, ligação e rede das seções B/C com o manual exato do aparelho. Confirmar que a família implementa a ação door.
2. Cadastrar o dispositivo com ID social-controlid e preencher o número real da porta em door. Número de porta, portal de identificação e device_id são conceitos diferentes.
3. Preencher credenciais por variáveis de ambiente, cadastrar credencial/vínculo e configurar callback /callbacks/social-controlid quando houver modo online preventivo compatível.
4. Seguir as etapas de modo Pro, identificação e contingência da seção D apenas se suportadas pelo modelo.
5. Executar teste local e, depois, teste integrado da seção J. Aceitar somente se a porta física corresponder ao cadastro.

**Catraca:** gateway/installation/controlid-catra.example.json.

1. Conferir manual da catraca, alimentação, sensores e interfaces de liberação. A configuração entregue usa ação catra; não representa comando de coleta de cartão/urna.
2. Identificar qual sentido físico é clockwise/anticlockwise no aparelho instalado. Escolher somente o sentido necessário e registrar evidência; não usar both para contornar inversão.
3. Cadastrar catraca-controlid no gateway/API com acesso catraca e configurar direction conforme o teste. Adicionar o IP real às rotas VPN.
4. Para face, cumprir cadastro/vínculo/callback Pro e contingência da seção D com device_id e portal reais da catraca.
5. Com passagem isolada e supervisão, testar uma autorização e um giro no sentido esperado. Testar sentido oposto, repetição e recusa.

**Aceite e desativação:** mesmos critérios da seção D, acrescentando sentido correto da catraca. Ações disponíveis variam por família; consultar a [referência oficial de abertura remota](https://www.controlid.com.br/docs/access-api-pt/acoes/abertura-remota-porta-e-catraca/).

### F. Intelbras controladora — referência de instalação SS 3530 MF FACE/W

**Escopo do adaptador atual:** atuação por HTTP Digest/CGI em aparelho que implemente o contrato. Esta seção não promete decisão facial preventiva central para a família Intelbras: os eventos AccessControl recebidos pelo gateway são auditoria. Exemplo: gateway/installation/intelbras-controller.example.json.

1. Conferir o modelo, fonte, local de montagem e conectores no [manual oficial SS 3530 de 2025](https://backend.intelbras.com/sites/default/files/2025-09/Manual_SS3530MF_FACE_bilingue_02-25_site.pdf). Essa referência não cobre toda a linha Intelbras.
2. Identificar no diagrama do modelo o relé e os circuitos separados de sensor/botoeira. Na referência SS 3530, os nomes PORTA_COM, PORTA_NA e PORTA_NF identificam contatos de relé; BOT/SEN não são contatos equivalentes. Confirmar as cores/pinos da unidade real no manual. Aplicar a seção C, inclusive alimentação da fechadura/central.
3. Inicializar o aparelho e criar administrador/e-mail de recuperação pelo fluxo do fabricante. Anotar versão; não atualizar firmware em produção sem backup e teste.
4. Definir IP privado e horário. Na interface web documentada da família, Rede → TCP/IP e Rede → Portas permitem revisar endereço e serviços; Usuários rede permite gerenciar a conta. Consultar a [interface web Bio-T](https://manuais.intelbras.com.br/manual-interface-web-linha-bio-t/pt-BR/manual_SS3530_MFFACEW_pt-BR.html). Menus de outra linha podem ser diferentes.
5. Criar a conta de integração e confirmar suporte ao Digest/CGI junto à documentação/API da unidade. Não desativar validação de certificado para resolver erro de HTTPS. Para HTTP de equipamento sem TLS, restringir o tráfego à rede privada/VPN.
6. Definir modo do contato e tempo do relé conforme o equipamento acionado e testar localmente, sem enviar comandos de tentativa pela internet.
7. No Imperium cadastrar garagem-intelbras na central, provider intelbras, acesso garagem, modelo real e método utilizado pela integração. Preencher o mesmo ID/acesso no JSON privado; preencher channel com o canal confirmado e baseUrl com IP/porta reais.
8. Salvar INTELBRAS_USERNAME e INTELBRAS_PASSWORD no ambiente privado. Não colocar senha na URL.
9. A atuação do adaptador usa o contrato openDoor do canal. Não configurar automaticamente um campo Servidor de Envio de Eventos para a URL do Supabase: o gateway atual consome o stream documentado do aparelho. Compatibilidade dos endpoints precisa ser confirmada no firmware.
10. Se for apenas controladora acionada por câmera de placas, não é necessário habilitar watchEvents nela. Se houver coleta de AccessControl, habilitar somente após validar o stream e tratar como observação.
11. Executar a habilitação e teste da seção J após o teste local. No painel enviar uma única liberação com motivo de teste. Conferir resposta, canal físico e pulso. O retorno OK representa aceite do comando, não sensor de posição.
12. Para uso facial Intelbras com validade central preventiva, parar nesta etapa e implementar/homologar o mecanismo preventivo ou sincronização de regras do modelo. Receber AccessControl depois da passagem não faz esse controle.

**Aceite:** Digest/CGI confirmado, canal e porta corretos, comando único, sem regra local que contorne a política pretendida. Falha ou retorno indeterminado exige conferência física antes de novo pedido.

**Desativação:** desabilitar dispositivo no painel e JSON, reiniciar o serviço e conferir as regras locais/relés. Não zerar cadastros de moradores para desativar uma integração.

Fonte do protocolo, com suporte dependente de modelo: [HTTP API V3.35 Intelbras](https://botminio.apps.intelbras.com.br/sdk-api/HTTP%20API%20V3.35_Intelbras.pdf).

### G. Intelbras câmera de placas — referência VIP 7208 LPR G2

**Escopo:** câmera reconhece a placa e a controladora cadastrada executa o comando. Não se presume que qualquer câmera IP reconheça placas ou emita TrafficJunction. Exemplo: gateway/installation/intelbras-anpr.example.json.

1. Conferir lente, iluminação, alimentação/PoE, suporte e ambiente no [manual VIP 7208 LPR G2](https://backend.intelbras.com/sites/default/files/2022-10/Manual_VIP_7208_LPRG2_02-22_site.pdf). Para essa referência, verificar as condições de montagem da seção 3.1 do fabricante; não transportar medidas para outra lente/modelo.
2. Fixar a câmera rigidamente no ponto de captura, instalar o cabo/proteção conforme o manual e enquadrar a região onde os veículos efetivamente param ou passam. Evitar obstruções e reflexos e ajustar iluminação/foco pela imagem real da placa.
3. Inicializar, criar credenciais próprias, definir IP, máscara, gateway e horário/NTP. Registrar que a captura e o gateway usam relógios corretos.
4. No modelo de referência, acessar Configurar placa, ajustar a área do veículo e linha de identificação e conferir foco/zoom. Testar leitura diurna e noturna e placas reais autorizadas para o ensaio. O manual orienta a configuração óptica; o Imperium não ajusta câmera remotamente.
5. Confirmar pelo fabricante que o firmware fornece stream multipart com TrafficJunction, placa, UTC e RecNo estável nos formatos aceitos por gateway/streams.mjs. Leitura correta na imagem ou lista da câmera não comprova que o evento exigido chegou ao gateway.
6. Cadastrar e testar primeiro a controladora da seção F ou outro atuador já suportado. No Imperium cadastrar camera-placas com provider intelbras, método plate, finalidade online, mesmo gateway e acesso garagem. Em Controladora vinculada informar o ID real do atuador.
7. **O vínculo da câmera ao atuador fica na API em actuatorId; não há campo equivalente no objeto privado da câmera.** O retorno da API identifica o atuador, que precisa existir e estar habilitado no mesmo JSON privado.
8. Preencher baseUrl da câmera no JSON, salvar LPR_USERNAME/LPR_PASSWORD no ambiente e deixar watchEvents false até concluir as conferências.
9. Conferir e desativar toda regra de abertura automática local da câmera/lista de permitidos e toda ligação de saída que possa abrir a cancela independentemente da decisão central. Na referência existem funções de lista/controle de barreira; não basta retirar uma placa da lista. Registrar evidência de que uma placa reconhecida, sem autorização do Imperium, não aciona a central.
10. Só depois dessa verificação definir nativeAutomaticOpeningDisabled true. Se não for possível comprovar, manter false: o evento será observação e não solicitação de liberação.
11. Ativar watchEvents true no perfil privado durante teste supervisionado. Sem habilitação física, conferir a chegada de metadados de observação pela API/histórico; não esperar autorização em dry-run. Reiniciar o gateway e verificar ausência de erro device-stream-unavailable.
12. Cadastrar placa brasileira em credencial com validade e acesso garagem. Conferir letras/números manualmente; não liberar por aproximação de OCR.
13. Após testes locais e a seção J, testar placa válida, futura, vencida, bloqueada, desconhecida e evento repetido. Observar uma única atuação na controladora. Confirmar que a própria câmera não abre quando a API/VPN é interrompida.
14. Ensaiar diferentes horários e condições de iluminação. Se faltar UTC/RecNo ou o formato não corresponder ao parser, manter a integração pendente e adaptar o evento; não inventar um identificador aleatório para cada repetição.

**Aceite:** boa leitura no cenário real, evento compatível e fresco, vínculo ao atuador correto, regra central respeitada e ausência de abertura independente. Câmera não equivale a confirmação de passagem ou de posição do portão.

**Desativação:** desabilitar a câmera na API, definir watchEvents false e enabled false no JSON e reiniciar. Confirmar que não existe caminho local de abertura ativo. Não deixar a câmera operar automaticamente como alternativa silenciosa.

### H. Hikvision controladora/terminal com HCNetSDK

**Escopo:** abertura via SDK em modelo compatível. Não há ingestão facial ou de placas Hikvision implementada no gateway. Exemplo: gateway/installation/hikvision-hcnetsdk.example.json.

1. Obter o guia do modelo exato, esquema elétrico, firmware e suporte oficial a Login_V40/ControlGateway. O documento [DS-K1T Connect to Lock](https://www.hikvision.com/content/dam/hikvision/ca/how-to-document1/access-control/DS-K1T-Series-Connect-To-Lock.pdf) cobre apenas os modelos listados nele; não usar sua pinagem em qualquer DS-K1T.
2. Instalar suporte, alimentação, relé, sensor e botoeira conforme o manual e a seção C. Testar localmente a porta correta.
3. Ativar o equipamento pelo procedimento oficial, definir administrador e conta de integração, IP privado, NTP e porta de serviço do SDK. 8000 é um exemplo de porta; usar a porta configurada e suportada. Registrar índice real da porta, não o número de uma câmera/NVR.
4. Obter HCNetSDK para sistema/arquitetura escolhidos pelos canais oficiais e verificar suas dependências/licença. Não baixar binários de repositórios não oficiais para completar o pacote.
5. Usar instalação systemd da seção anterior ou imagem privada preparada para o SDK. O Docker público do gateway não inclui executável nem bibliotecas proprietárias.
6. Para build no Linux, preparar compilador/CMake e uma pasta privada com include/HCNetSDK.h e lib/hcnetsdk correspondente. O layout exato do pacote oficial pode exigir ajuste do caminho. Exemplo de compilação, sem executar o helper:

~~~sh
sudo apt-get install --yes cmake build-essential
sudo install -d -m 0755 -o "$(id -un)" -g "$(id -gn)" /opt/imperium/build-hikvision
cd /opt/imperium/controle-acesso
export HCNETSDK_ROOT=/opt/imperium/vendor/hcnetsdk
cmake -S gateway/native -B /opt/imperium/build-hikvision -DCMAKE_BUILD_TYPE=Release
cmake --build /opt/imperium/build-hikvision --config Release
sudo install -d -m 755 /opt/imperium/bin
sudo install -m 755 /opt/imperium/build-hikvision/imperium-hikvision-open /opt/imperium/bin/imperium-hikvision-open
ldd /opt/imperium/bin/imperium-hikvision-open
~~~

7. Instalar previamente CMake/compilador pelo gerenciador do sistema e cumprir as dependências do SDK. Nenhuma dependência deve aparecer como not found em ldd. Bibliotecas/componentes carregados dinamicamente pelo SDK também precisam seguir o layout oficial; ldd sozinho não valida todos os componentes.
   O comando de preparação do diretório no passo anterior permite compilar sem mudar o dono dos arquivos privados. Não executar o helper como teste de carregamento.
8. Configurar o carregamento das bibliotecas para o usuário do serviço, inclusive LD_LIBRARY_PATH se necessário, conforme o pacote oficial. O executor do gateway transmite somente um ambiente restrito ao helper; variáveis adicionais exigidas pelo SDK precisam de adaptação explícita, não de shell genérico.
9. Cadastrar social-hikvision na API e no JSON privado com provider hikvision, protocol hcnetsdk, host, sdkPort, channel e helperCommand absolutos. Preencher HIK_USERNAME/HIK_PASSWORD no arquivo de ambiente do serviço. Para systemd, usar o arquivo EnvironmentFile configurado na unidade, não presumir que gateway/.env será lido automaticamente.
10. Validar que o usuário imperium pode executar o binário e ler suas bibliotecas. Não testar chamando o helper diretamente: ele aciona o equipamento sem passar pelas permissões/recibos da API. O teste de abertura deve usar o painel e o gateway.
11. Após seção J, enviar uma liberação supervisionada. Registrar código SDK, porta efetiva e tempo. Aceite SDK representa aceite do comando, sem sensor de posição.
12. Se o teste exigir reconhecimento facial/ANPR central, registrar como desenvolvimento pendente: o helper de abertura não implementa esse fluxo.

**Aceite:** SDK oficial carregado, login compatível, porta correta, execução pelo gateway, nenhuma credencial em argumentos/logs e ausência de repetição automática. [Login oficial](https://open.hikvision.com/hardware/structures/NET_DVR_USER_LOGIN_INFO.html), [ControlGateway oficial](https://open.hikvision.com/hardware/v2/%E6%8E%A5%E5%8F%A3%E5%AE%9A%E4%B9%89/NET_DVR_ControlGateway.html).

**Desativação:** desabilitar dispositivo na API e no JSON, reiniciar e confirmar interrupção dos comandos; preservar recibos e plano local.

#### H.1. Node.js no host para o caminho systemd

O Docker já contém Node.js 24; não instalar outro runtime no host para esse caminho. Para systemd, instalar um Node.js 24 oficial e ajustar o ExecStart da unidade para seu caminho real.

1. Conferir sistema/arquitetura. O exemplo abaixo é **Linux x86_64 com glibc**, usa a versão 24.22.1 disponível em 23/10/2026 no [diretório oficial Node.js 24](https://nodejs.org/dist/latest-v24.x/) e não vale para ARM ou musl. Confirmar também compatibilidade do SDK. A versão deve passar pelos testes do projeto antes do piloto.
2. Em diretório temporário novo, baixar o arquivo e a lista oficial de checksums:

~~~sh
imperiumNodeWork=$(mktemp -d)
cd "$imperiumNodeWork"
curl --fail --remote-name https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-x64.tar.xz
curl --fail --remote-name https://nodejs.org/dist/v24.22.1/SHASUMS256.txt
sha256sum --check --ignore-missing SHASUMS256.txt
~~~

3. Continuar somente se o arquivo esperado estiver presente e a verificação indicar OK. Instalar em diretório novo da versão, sem sobrescrever um runtime utilizado por outro serviço:

~~~sh
sudo install -d -m 0755 /opt/imperium/node-v24.22.1
sudo tar -xJf node-v24.22.1-linux-x64.tar.xz --strip-components=1 -C /opt/imperium/node-v24.22.1
/opt/imperium/node-v24.22.1/bin/node --version
~~~

4. No arquivo de serviço privado, trocar somente o executável de ExecStart para /opt/imperium/node-v24.22.1/bin/node; manter os caminhos do gateway/configuração e o usuário imperium. Criar esse usuário de serviço e os diretórios protegidos conforme o padrão de administração do servidor. Confirmar acesso de leitura ao código e ambiente e escrita apenas no StateDirectory.
   Em VPS nova, se esse usuário e os arquivos de destino ainda não existirem, a preparação usa os arquivos privados já preenchidos, sem imprimir seu conteúdo:

~~~sh
sudo useradd --system --home-dir /var/lib/imperium-gateway --no-create-home --shell /usr/sbin/nologin imperium
sudo install -d -m 0750 -o root -g imperium /etc/imperium
cd /opt/imperium/controle-acesso
sudo install -m 0640 -o root -g imperium gateway/.env /etc/imperium/gateway.env
sudo install -m 0640 -o root -g imperium gateway/config.private.json /etc/imperium/gateway.private.json
sudo install -m 0644 gateway/imperium-gateway.service.example /etc/systemd/system/imperium-gateway.service
~~~

   Não repetir a criação/substituição por cima de um serviço existente. Editar o JSON de destino para journalFile=/var/lib/imperium-gateway/imperium.sqlite e a unidade de destino para o executável Node correto antes de iniciar. O StateDirectory será criado pelo systemd.
5. Executar daemon-reload, iniciar a unidade e conferir status/journal, conforme a seção systemd. Registrar a versão do Node junto à versão do SDK. Não colocar o diretório temporário no PATH do serviço.

### I. ZKTeco e servidor ZKBio CVSecurity

**Escopo:** abertura por API licenciada do servidor CVSecurity, não por uma API universal do terminal. Pode exigir um servidor adicional da Imperium compatível com o software ZKTeco; não pressupor que ele rode no mesmo Linux do gateway. Exemplo: gateway/installation/zkbio.example.json.

1. Identificar terminais/controladoras realmente suportados pela versão do CVSecurity, licenças necessárias, sistema operacional e requisitos do fabricante. A [página oficial da API](https://zkteco.com/en/ZKBio_CVSecurity_API/ZKBioCVSecurity_API) fornece a documentação por versão; obter o manual que corresponda à licença instalada.
2. Instalar os aparelhos usando o esquema elétrico de cada modelo e a seção C. Registrar números de série, canal da porta, comunicação suportada e configurações anteriores.
3. Instalar o CVSecurity em servidor suportado e licenciado. Seguir o instalador e a configuração de banco/serviços do fabricante; não há instalador do CVSecurity incluído no gateway.
4. Ativar a licença de API e verificar os serviços do CVSecurity. Se o menu de API não aparecer, conferir licença/versão/permissão antes de alterar firewall.
5. Cadastrar os equipamentos no CVSecurity pelo mecanismo suportado: comunicação de saída do aparelho ou conexão do servidor, conforme o modelo. Não copiar uma porta de PUSH de outra família. Se o servidor ficar na nuvem, configurar a conectividade privada em ambos os sentidos exigidos.
6. Configurar a porta física no software e executar teste local supervisionado pelo CVSecurity. Cadastrar pessoas/biometrias e níveis locais pelo processo do fabricante, se utilizados; o Imperium não faz essa sincronização.
7. Pela documentação/console API da versão instalada, criar a autorização de cliente e obter o valor exigido em access_token. Guardar apenas em ZKBIO_API_TOKEN no ambiente privado. Não confundir com sessão do navegador ou com token do gateway.
8. Obter o doorId pela listagem oficial de portas ou ferramenta de API do CVSecurity. Não usar nome visível, número de série ou índice 1 no lugar desse identificador.
9. Configurar HTTPS com certificado confiável no servidor. Usar hostname/IP coerente com o certificado e alcançável pela VPS; adicionar sua rota VPN quando necessário. Não usar opção para ignorar erro TLS.
   O adaptador aceita IP privado diretamente. Para um hostname HTTPS configurado e aprovado, acrescentar allowPublicEndpoint true **no perfil privado**, conferir que o DNS aponta ao destino previsto e limitar o tráfego no firewall. Esse nome de campo habilita endpoint HTTPS explícito; não é uma instrução para publicar o CVSecurity na internet. Se houver CA corporativa, seguir a seção I.2.
10. Cadastrar social-zkteco no Imperium. No JSON, baseUrl aponta ao servidor CVSecurity, não ao leitor; preencher doorId e interval conforme o contrato da versão. O exemplo aceita intervalo inteiro de 1 a 254, a validar com o equipamento/software.
11. Após testes locais e a seção J, enviar um único comando pelo painel, conferir retorno e porta. O adaptador atual considera code 0 como aceite, conforme os exemplos da API utilizada; divergência no contrato exige ajuste do adaptador.
12. Reconhecimento facial e de placas com decisão preventiva do Imperium não está implementado por esse adaptador. Se o CVSecurity/terminal autorizar localmente, essa autorização não comprova consulta à validade central.

**Aceite:** licença e versão registradas, equipamentos online no CVSecurity, HTTPS confiável, doorId inequívoco e abertura única correta. [Manual API de referência V1.1](https://s3.ap-southeast-1.amazonaws.com/zkteco.co.th/files/20240807/ZKBio_CVSecurity_3rd_Party_API_User_Manual_V1.1_20240521.pdf); mudanças de versão precisam de revisão.

**Desativação:** bloquear no Imperium/JSON e reiniciar; revogar a autorização de API no CVSecurity quando a integração for encerrada. Tratar separadamente as regras locais do servidor/terminal.

### I.1. Dahua e ponte licenciada DSS

**Status:** procedimento de preparação completo até o ponto de integração; conexão nativa pendente de pacote oficial, licença e desenvolvimento da ponte. Não há endpoint Dahua pronto neste código. O perfil gateway/installation/dahua-bridge.example.json vem com licensedBridgeReady false.

1. Identificar controladoras, leitores e câmeras exatos, firmware, esquema de ligação e suporte na versão do DSS. Instalar e testar cada aparelho localmente usando o manual específico e a seção C; não aplicar esquema Intelbras só porque há semelhança de protocolos.
2. Obter acesso oficial à integração DSS, documentação, termos/NDA e licença de API necessários. O [processo oficial Dahua](https://www.dahuasecurity.com/products/software/ecosystem/integration-with-dss) inclui DSS Professional e desenvolvimento/validação. Nenhum termo foi aceito ou licença contratada neste trabalho.
3. Instalar e licenciar DSS no sistema suportado pelo fabricante. Registrar servidor, versão, portas, autenticação e dispositivos online.
4. Cadastrar controladoras/portas no DSS e realizar teste local supervisionado. Registrar o doorId real e eventuais políticas locais.
5. Entregar o pacote oficial aprovado ao desenvolvedor da ponte. Ele deve implementar login/renovação de credenciais, seleção de porta, chamada nativa, tradução dos retornos, prazos e deduplicação persistente.
6. A ponte Imperium deve expor em rede privada HTTPS o contrato POST /v1/open, autenticado com Bearer exclusivo. Recebe commandId, doorId e expiresAt; só pode retornar accepted true após aceite nativo, nunca apenas por ter colocado o pedido em uma fila.
7. Exigir que a ponte recuse prazo vencido e identidade/porta inválidas, não repita commandId e preserve recibos após reinício. Timeout após envio deve resultar indeterminado. O contrato normalizado do Imperium não é URL nativa do DSS.
8. Instalar a ponte como serviço com certificado confiável e conta técnica restrita. Registrar seu endereço privado e armazenar o token em DAHUA_BRIDGE_TOKEN.
9. Cadastrar social-dahua na API e no JSON, com baseUrl da ponte e doorId do DSS. Manter licensedBridgeReady false até testes da ponte documentados.
10. Após desenvolvimento/testes nativos e localmente aprovados, definir licensedBridgeReady true apenas na configuração privada de teste, seguir a seção J e realizar aceite integrado com instalador presente.
11. Se não houver pacote, licença ou ponte implementada, encerrar esta instalação como PENDENTE. Não substituir por uma URL CGI inventada e não marcar homologação.

**Desativação:** bloquear dispositivo, desabilitar perfil/ponte, interromper serviço da ponte se aplicável e tratar autorização de API no DSS. Preservar registros para diagnóstico. Biometrias/ANPR preventivos Dahua também exigem implementação específica.

### I.2. HTTPS com CA corporativa

Aplicável à API CVSecurity, ponte licenciada ou aparelho que use certificado emitido pela própria organização. Obter somente o certificado da CA aprovado, conferir cadeia e nome/SAN do servidor e guardar fora do repositório; não copiar sua chave privada.

1. No Docker, montar o certificado da CA como arquivo somente leitura, por exemplo /etc/imperium/trust/ca-corporativa.crt no host → /run/imperium/ca.crt no container. Adicionar a montagem à configuração privada Compose do serviço, preservando também as montagens de configuração e volume de recibos existentes.
2. No ambiente do gateway, definir NODE_EXTRA_CA_CERTS=/run/imperium/ca.crt. Recriar o container para que o Node carregue a CA no início.
3. Em systemd, usar no EnvironmentFile o caminho absoluto da CA legível pelo usuário do serviço e reiniciar. Confirmar que o arquivo continua acessível com a proteção da unidade.
4. Testar HTTPS sem opções que ignorem certificados. Um certificado confiável ainda pode falhar por nome/IP divergente; corrigir o certificado ou endereço. A confiança do Node não configura automaticamente a confiança de bibliotecas nativas de terceiros.

[Referência Node.js sobre CA adicional](https://nodejs.org/api/cli.html#node_extra_ca_certsfile). Este procedimento adiciona uma CA aprovada; não usar NODE_TLS_REJECT_UNAUTHORIZED=0.

### J. Habilitação, ensaio integrado e retorno

Esta etapa é feita **após a instalação e o teste físico local**, em acesso isolado ou janela supervisionada. A homologação local permite o ensaio integrado; o aceite da instalação completa depende do resultado desse ensaio. Não habilitar um acesso público para descobrir o número do relé.

1. Conferir todas as fichas: modelo, firmware, fonte/ligação, IP, porta, gateway, acesso, IDs e teste local. Resolver primeiro as pendências de software da seção K que afetem o fluxo.
2. Manter o dispositivo desativado enquanto confirma heartbeat da central e acesso à API. Sem contato recente, o sistema recusa liberações manuais.
3. Preparar uma credencial de teste específica, com acesso e prazo limitados, e outra inválida. Cadastrar o vínculo facial somente para o identificador correto; no caso de placa, confirmar a associação da câmera ao atuador.
4. Na janela de ensaio, com teste local aprovado, habilitar o equipamento e marcar homologação física local no formulário Configurar; habilitar a central correspondente. Habilitar o mesmo dispositivo no JSON privado e definir physicalEnabled true e IMPERIUM_ENABLE_PHYSICAL=yes no ambiente. São autorizações separadas; somente uma delas não libera o comando.
5. Aplicar mudança de JSON/env no Docker com recriação do container, preservando o volume:

~~~sh
cd /opt/imperium/controle-acesso
sudo docker compose -f gateway/compose.example.yml up -d --force-recreate
sudo docker compose -f gateway/compose.example.yml logs --tail=50
~~~

6. Em systemd, editar os arquivos privados usados pela unidade e reiniciar imperium-gateway. Não configurar ao mesmo tempo duas instâncias apontando ao mesmo equipamento para tentar acelerar o teste.
7. Testar uma autorização válida e uma liberação manual identificada por motivo, observando fisicamente a porta correta. Não gerar nova liberação enquanto o resultado da primeira estiver indeterminado.
8. Executar os cenários de gateway/installation/aceite.example.csv, anotando horário, ID de evento/comando, resultado e responsável. Registrar o retorno lógico separado do resultado físico observado.
9. Validar falha de rede/API em cenário controlado e o comportamento local do equipamento. As autorizações online novas são negadas sem o servidor; a configuração do fabricante pode ter uma contingência própria que precisa ser testada.
10. Reiniciar o gateway e verificar que o volume/recibos persistem e não há repetição. Não apagar SQLite, volume ou filas para fazer desaparecer um resultado indeterminado.
11. Qualquer falha: bloquear o dispositivo no painel, definir enabled false/physicalEnabled false e ambiente físico no, recriar/reiniciar o serviço e confirmar o bloqueio. Em leitor com decisão local, cumprir também seu plano de contingência/retorno; o bloqueio central não altera sozinho permissões locais.
12. Somente depois dos cenários aprovados autorizar o piloto com usuários reais e definir responsável de suporte, monitoramento, backup e registro de alterações.

### K. Pendências que impedem tratar o pacote como instalação concluída

- **Modelo e pinagem:** nenhum aparelho físico foi informado/homologado. A ficha do modelo e os dois manuais da ligação são obrigatórios antes da intervenção elétrica.
- **Convites e face — correção entregue:** a renovação exige selecionar a credencial anterior da mesma unidade e pessoa; seu ID e o vínculo do leitor são preservados. Homônimos não herdam identificadores. Fluxos cobertos por testes automatizados; o ensaio com o leitor real continua pendente.
- **Callbacks Control iD:** firmwares que exijam endpoints além dos dois implementados precisam de adaptação e teste.
- **Hikvision:** SDK oficial, dependências e binário ainda não foram fornecidos/compilados nesta entrega. Não há captura facial/ANPR implementada nesse caminho.
- **ZKTeco:** existe atuação via CVSecurity; autorização facial/ANPR preventiva não está implementada.
- **Dahua:** ponte nativa ainda depende do pacote e desenvolvimento oficiais; o contrato entregue não substitui esse trabalho.
- **Sensor:** o painel registra aceite do comando, não posição física confirmada. Botoeira/sensor instalados localmente não passam a ser consultados pelo Imperium sem adaptador.
- **Resultado de teste:** os testes automatizados existentes usam equipamentos simulados. Nenhuma ficha de aceite deste pacote comprova teste em condomínio real.

### L. Diagnóstico por sintoma

| Sintoma | Conferência objetiva | Conduta |
| --- | --- | --- |
| Gateway sem contato | API, token, central habilitada, saída HTTPS | Corrigir conexão; não habilitar equipamento para resolver heartbeat |
| Conexão TCP falha | Rotas, porta real, firewall, fonte/link | Restabelecer rede sem chamada de abertura |
| Control iD não envia identificação | Pro, server_id, callback, origem, relógio, endpoints exigidos | Capturar metadados técnicos mínimos em ambiente privado e ajustar contrato |
| Face identificada e negada | Vínculo externo, credencial vigente, unidade, acesso, prazo | Conferir IDs; não liberar por semelhança de nome |
| Convite renovado perde face | Revisão instalada, seleção explícita da credencial e vínculo externo | Usar a versão corrigida, conferir o ID preservado e repetir o ensaio supervisionado |
| Intelbras rejeita comando | Digest, permissão, canal e contrato da versão | Validar com o fabricante antes de alterar adaptador |
| ANPR observa mas não libera | nativeAutomaticOpeningDisabled, finalidade, UTC/RecNo, actuatorId | Comprovar configuração e evento; não forçar abertura nativa |
| Hikvision indisponível | Arquitetura, bibliotecas, permissão do serviço, SDK/porta/canal | Corrigir instalação da ponte sem executar abertura direta |
| ZKBio rejeita | Licença, token, HTTPS, doorId e versão | Consultar a API da versão instalada |
| Dahua pendente | Pacote, licença, serviço da ponte, testes | Manter bloqueado até implementação |
| Comando aceito, porta não mudou | Fiação, pulso, entrada, intertravamento e observação local | Conferir equipamento; aceite não é sensor |
| Resultado indeterminado | Evento/comando e observação física | Investigar antes de nova ação; não repetir automaticamente |

Os exemplos técnicos em gateway/installation devem permanecer com acionamento desativado. Copiar apenas os perfis realmente instalados para o arquivo privado, preencher os valores reais e guardar a revisão aprovada do conjunto.
