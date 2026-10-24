# Imperium na Oracle Cloud gratuita

**Referência arquivada: tentativa abandonada pelo requisito de cartão/pagamento no cadastro. Nenhuma VPS foi criada.** A instalação escolhida é o [pacote local Windows/Linux](../../LOCAL.md); testes online continuam nos serviços já existentes. Este procedimento é opcional e não autoriza contratação ou cadastro financeiro.

## Configuração para o primeiro piloto

| Item | Seleção proposta |
| --- | --- |
| Nome | imperium-gateway-01 |
| Forma | VM.Standard.A1.Flex, somente se elegível ao Always Free na conta |
| Capacidade | 1 OCPU, 6 GB de RAM |
| Imagem | Canonical Ubuntu 24.04 LTS ARM64 oficial, compatível com A1 |
| Disco de inicialização | 50 GB, dentro da franquia livre restante da conta |
| Região | Home region da conta; disponibilidade depende do console |
| Rede | VCN/sub-rede pública e Internet Gateway, sem NAT Gateway pago |
| Endereço | IPv4 público para o endpoint WireGuard, com custo final conferido no console |
| Serviços adicionais | Sem banco extra, balanceador, Marketplace, backup pago ou migração de plano |
| Aplicação | Gateway e WireGuard; site no GitHub Pages, API e banco existentes continuam onde estão |

Essas medidas são uma proposta técnica para avaliação, não uma cotação confirmada para a conta. A criação só deve ocorrer com todos os recursos e a estimativa final dentro do limite **US$ 0**, considerando também o consumo já existente. Não usar créditos de teste como justificativa para criar recursos pagos. Se a forma gratuita estiver sem capacidade, interromper e informar; não selecionar automaticamente outra forma ou atualizar para Pay As You Go.

Na documentação consultada em **23/10/2026**, A1 tem franquia mensal de 1.500 OCPU-h e 9.000 GB-h, equivalente a 2 OCPUs/12 GB contínuos; discos Always Free somam até 200 GB por conta, incluindo volumes de inicialização. O perfil proposto de 1 OCPU/6 GB usa até 744 OCPU-h e 4.464 GB-h em um mês de 31 dias. A cota **restante** precisa ser verificada. Há recolhimento de máquinas ociosas e não há garantia de vaga. [Limites oficiais](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

## 1. Conta e acesso

Entrar em [Oracle Cloud](https://cloud.oracle.com/). Quem ainda não tem conta usa **Sign Up**, completa o cadastro e escolhe a home region com atenção. Só ela comporta os recursos Always Free de computação. A Oracle normalmente exige telefone e cartão para validação; dados pessoais, senha, verificação e aceite dos termos são feitos diretamente pelo titular. A instalação não exige enviar senhas ou cartão pelo chat. [Condições de cadastro](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm).

Depois do login, consultar as cotas e instâncias existentes antes de criar qualquer recurso. O pacote não contém credencial OCI e não acessa outras contas automaticamente.

## 2. Preparar a chave e o primeiro boot

Usar uma chave SSH Ed25519 dedicada da Imperium e definir o IPv4 público de administração. A chave privada não deve ser enviada à Oracle nem ao GitHub. A chave pública será instalada para `imperium-admin`, com sudo, exclusivamente nessa VM. Criar/autorizar esse acesso faz parte da revisão antes da implantação.

Gerar o startup script com os dois arquivos Python deste diretório:

```sh
python3 prepare.py --provider oracle --admin-cidr SEU_IP_PUBLICO/32 --ssh-public-key CAMINHO_DA_CHAVE.pub --output oracle-cloud-init.private.yaml
```

Validar em Linux com `cloud-init schema --config-file oracle-cloud-init.private.yaml`. O arquivo contém a chave pública e IP de administração, sem token de gateway, senha de leitor ou chave privada. Preservar em diretório privado. Só usar em uma VM nova: não serve para aplicar sobre um servidor existente ou computador da portaria.

O perfil Oracle **não habilita UFW**. Preserva as regras essenciais da imagem em `/etc/iptables/rules.v4`, acrescenta uma cadeia de entrada para SSH restrito, WireGuard e bloqueio inicial de callbacks e guarda cópias privadas das regras original e em execução. Interrompe se não houver configuração persistente da imagem ou se houver UFW ativo. A Oracle documenta que UFW pode impedir o acesso aos volumes e o reboot. [Orientação oficial](https://docs.oracle.com/en-us/iaas/Content/Compute/known-issues.htm#ufw).

Não apagar regras de saída para iSCSI, DNS, NTP, metadados ou serviços da plataforma. A VM não precisa de forwarding/NAT entre condomínios: o gateway é o destino/origem da comunicação dos equipamentos. Rotas e peers virão após o levantamento da rede real.

## 3. Criar a VM no console

1. Conferir home region, disponibilidade e cota restantes de A1 e disco. Usar compartimento dedicado se possível, sem modificar redes de outras aplicações.
2. Abrir Compute → Instances → Create instance e preencher nome, forma, memória e imagem compatível. Verificar elegibilidade Always Free. Não usar imagem Marketplace ou forma substituta paga.
3. Configurar uma rede exclusiva, sub-rede pública, rota para Internet Gateway e IPv4 público. Não criar NAT Gateway, balanceador ou serviços adicionais pagos.
4. Nas regras efetivas de security list/NSG, permitir TCP 22 só do IP público de administração `/32`, UDP 51820 para WireGuard e o ICMP necessário para rede/MTU. Conferir todas as listas: regras são cumulativas, e um NSG restrito não anula uma security list permissiva. Manter egress necessário a HTTPS, DNS, NTP e serviços essenciais. Não publicar HTTP, SDK nem 8765.
5. Adicionar somente a chave pública escolhida. Inserir o arquivo gerado no campo de script cloud-init/startup, conforme o console atual. Confirmar que o usuário `imperium-admin` foi definido nele.
6. Conferir 50 GB de boot e o consumo total. Não ativar backups pagos. Revisar resumo e estimativa **US$ 0**, inclusive itens de rede/disco. A elegibilidade de um item isolado não comprova o custo do conjunto.
7. Revisar a autorização para chave administrativa e porta VPN antes da criação. Se a conta exigir novos termos, o titular precisa fazer o aceite. Com o plano revisado, criar e aguardar o estado Running. Falta de capacidade deve ser reportada sem cobrança ou mudança automática de região/plano.

## 4. Verificar o servidor de verdade

Conectar com a chave escolhida: `ssh -i CAMINHO_DA_CHAVE imperium-admin@IP_DA_VPS`. Verificar a identidade do host e registrar sua impressão digital. Não desabilitar a verificação do SSH.

```sh
sudo cloud-init status --long
sudo cat /etc/imperium/HOST-PREPARED
sudo iptables -S INPUT
sudo iptables -S IMPERIUM-IN
sudo docker compose version
sudo docker compose -p imperium -f /etc/imperium/compose.json images
timedatectl status
```

Exigir cloud-init concluído sem erro, marcador presente, imagem construída e horário sincronizado. Verificar uma nova conexão SSH antes de fechar a primeira. Conferir as regras de armazenamento/serviços essenciais preservadas e fazer um reboot controlado **antes** de vincular equipamentos, confirmando a volta do host e do SSH. Não considerar servidor instalado apenas porque o console diz Running.

O bootstrap baixa a revisão pública fixada no gerador e constrói Node 24 para a arquitetura da VM; o primeiro build e os testes **em ARM64** ainda precisam ser executados. Helpers e SDKs de fabricante feitos para x86-64 não são automaticamente compatíveis com A1. Não ativar Hikvision ou ponte de fabricante sem binário/SDK compatível. Se o SDK exigir outra arquitetura, reavaliar o host; não contratar outro plano automaticamente.

## 5. API, VPN e aparelhos

Seguir o [procedimento geral](./README.md#conectar-api-e-condomínio-depois) e o manual de implantação. Instalar o token exclusivo do gateway em `/etc/imperium/gateway.env` por canal privado. Com `devices: []`, `physicalEnabled: false` e `IMPERIUM_ENABLE_PHYSICAL=no`, testar apenas conexão à API. Depois cadastrar os peers, rotas restritas e modelos reais de aparelho.

Para callbacks, inserir permissões estritas na cadeia `IMPERIUM-IN` **antes** do bloqueio TCP 8765, somente com `-i wg-imperium`, origem do equipamento e destino `10.200.0.1`. Persistir de acordo com as regras OCI, preservando a imagem. Não usar os comandos UFW do procedimento DigitalOcean nesta VM. Subir a VPN, testar ida e volta e só então habilitar a escuta privada no gateway. Não há peer ou túnel pronto neste pacote.

Homologar localmente cada aparelho e resolver os bloqueios funcionais documentados antes do piloto com moradores. O diário de comandos é persistente e nunca deve ser removido para repetir um acionamento. Definir backup e recuperação e considerar a possibilidade de recolhimento do host gratuito no plano de contingência. Não manter esse servidor como único caminho de entrada e emergência.

## Situação verificável desta entrega

Preparação local e gerador adaptados; login e consulta de disponibilidade dependem do titular. **Sem VM, IP público, chave administrativa instalada, gateway online ou teste físico confirmado.** Os testes locais do gerador e das regras não substituem o primeiro boot real.
