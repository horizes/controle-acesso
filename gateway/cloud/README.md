# Servidor virtual Imperium

**Situação: configuração preparada; VPS ainda não criada ou contratada.** Este pacote não faz compras nem exige token de hospedagem. A criação depende da conta do provedor e da autorização do custo.

**Referência opcional arquivada.** A escolha atual é testar com GitHub Pages/Supabase existentes e instalar o pacote [local Windows/Linux](../../LOCAL.md), sem cadastro de cartão nem contratação de hospedagem. A tentativa Oracle foi abandonada pelo requisito de pagamento. Os procedimentos abaixo ficam como referência para uma decisão futura; não são necessários à operação local.

## Proposta para o piloto

| Item | Configuração proposta |
| --- | --- |
| Provedor | DigitalOcean, Droplet Basic Regular |
| Nome | imperium-gateway-01 |
| Sistema | Ubuntu 24.04 LTS, x86-64 |
| Capacidade | 1 vCPU, 2 GiB RAM, SSD 50 GiB |
| Região proposta | NYC3; validar latência a partir do condomínio antes da operação |
| Preço base consultado em 23/10/2026 | US$ 12/mês; impostos, conversão do cartão e eventual tráfego excedente à parte |
| Adicionais | Sem backup pago, volumes adicionais, domínio ou balanceador nesta proposta |
| Aplicação | Gateway de acesso e VPN; site continua no GitHub Pages, API e banco no Supabase |

Referências oficiais: [preços](https://www.digitalocean.com/pricing/droplets), [regiões](https://docs.digitalocean.com/platform/regional-availability/), [cloud-init](https://docs.digitalocean.com/products/droplets/how-to/provide-user-data/). Confirmar o valor final no painel antes da contratação. Esta capacidade é uma configuração inicial para avaliação, sem promessa de quantidade de condomínios ou disponibilidade contínua.

## Preparar o primeiro boot

Execute o gerador em um computador com Python 3. Informe o **IP público de administração**, que poderá acessar SSH, e o arquivo de **chave pública** SSH Ed25519 da Imperium. A chave privada fica no computador do administrador. O gerador recusa redes abertas e arquivos de chave privada.

```sh
python3 prepare.py --admin-cidr SEU_IP_PUBLICO/32 --ssh-public-key CAMINHO_DA_CHAVE.pub --output cloud-init.private.yaml
```

Ele gera o arquivo de inicialização sem senhas, tokens de gateway ou chaves privadas. Esse arquivo usa JSON, que é válido como YAML após o cabeçalho cloud-config. Não publicar a versão preenchida: ela contém o IP e a chave pública de administração. Validar com `cloud-init schema --config-file cloud-init.private.yaml` em Linux antes de enviar.

Após aprovação e login no provedor, configurar a VPS conforme a tabela. Registrar a chave pública selecionada, aplicar também firewall do provedor com SSH TCP 22 somente do IP de administração e WireGuard UDP 51820, colar o arquivo no campo de startup script e conferir preço. Ações de conta, termos e faturamento dependem do titular.

No primeiro boot, cloud-init instala Docker e Compose dos repositórios Ubuntu, WireGuard e firewall. Cria o usuário `imperium-admin` com SSH por chave e sudo, desativa login SSH de root/senha, baixa a revisão pública `e0274f586536df608eec8c718775dfc635e305d1`, prepara a imagem do gateway e gera a chave VPN **dentro da VPS**. A imagem Node 24 será resolvida no build; registrar seu digest no aceite.

O gateway fica parado e sem equipamentos. A VPN não tem peers e fica parada. Nenhum token válido é gravado ou exibido. O script destina-se a uma **VPS nova**, não deve ser executado no computador do condomínio nem reaplicado sobre uma instalação existente. Se falhar, investigar os logs e preservar o estado antes de qualquer nova tentativa.

## Validar a criação real

Conectar com a chave escolhida: `ssh imperium-admin@IP_DA_VPS`. Verificar:

```sh
sudo cloud-init status --long
sudo cat /etc/imperium/HOST-PREPARED
sudo ufw status verbose
sudo docker compose version
sudo docker compose -p imperium -f /etc/imperium/compose.json images
timedatectl status
```

Somente considerar o host preparado se cloud-init terminou sem erro, o marcador existe, o firewall corresponde ao projeto e a imagem foi construída. Arquivos gerados em `/etc/imperium` e chaves de `/etc/wireguard` são privados e não devem ir ao GitHub.

## Conectar API e condomínio depois

1. Entrar na portaria operacional como administrador, cadastrar o gateway do condomínio e instalar seu token exclusivo em `/etc/imperium/gateway.env` por canal privado. Não usar service_role do Supabase.
2. Para verificar a comunicação sem acionar equipamentos, executar `sudo docker compose -p imperium -f /etc/imperium/compose.json up -d`. Confirmar gateway online no painel e logs sem erros de autenticação. Conservar `physicalEnabled: false` e `IMPERIUM_ENABLE_PHYSICAL=no`.
3. Identificar redes, roteador, modelos e firmware. Acrescentar peer/rotas estritas ao WireGuard e configurar a outra ponta no roteador. Não alterar os IPs de exemplo sem verificar conflitos. Ver o manual de implantação.
4. Quando necessários, configurar callbacks para ouvir apenas no IP VPN. Adicionar regras UFW somente na interface `wg-imperium`, de IPs específicos dos equipamentos para `10.200.0.1:8765`. Não abrir 8765 na internet. Habilitar VPN com `sudo systemctl enable --now wg-quick@wg-imperium` depois de revisar peers/rotas.
5. Cadastrar e homologar cada aparelho conforme o manual. Testar renovação explícita de credenciais e isolamento de identidade/unidade no equipamento real. Habilitar operação física apenas no aceite presencial.

O diário de comandos fica no volume Docker `imperium_imperium-journal`. Nunca remover esse volume para repetir comandos. Definir e testar backup/recuperação antes de operação com moradores reais. A VPS ainda depende de internet, energia e roteador VPN no condomínio. Não há câmera ou portão homologado, redundância ou teste físico incluído nesta preparação.

## Verificação desta entrega

Gerador e estrutura JSON conferidos localmente; nenhum boot real, instalação Ubuntu, acesso SSH ou túnel foi validado enquanto não há VPS contratada. Não apresentar este pacote como servidor online.
