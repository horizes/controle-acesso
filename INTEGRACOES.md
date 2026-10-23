# Integrações com equipamentos

## Situação desta entrega

O GitHub Pages hospeda a interface pública. Nenhuma câmera, leitor ou controladora está conectada. Há um cliente de API pronto para o contrato documentado, perfis de fabricantes e normalização de eventos; não há SDK nativo instalado nem compatibilidade universal homologada.

As senhas dos equipamentos e os tokens de fabricantes permanecem no futuro servidor ou gateway local. O navegador envia operações do usuário à API do condomínio. O gateway recebe eventos, sincroniza cadastros e regras quando suportado, e executa os comandos específicos do equipamento.

## Marcas e caminhos documentados

| Marca | Caminho de integração | Requisitos |
| --- | --- | --- |
| Control iD | API de acesso, modo online compatível e Monitor | Identificar família, firmware, modo e portal. A ação muda entre `door`, `sec_box` e `catra`. |
| Intelbras | HTTP Digest/CGI, stream de eventos ou SDK por modelo | Confirmar funções implementadas. `AccessControl` e `TrafficJunction` dependem do equipamento. Algumas linhas exigem solicitação de SDK/API. |
| Hikvision | ISAPI/SDK e eventos de acesso/ANPR | Obter guia de integração do modelo e verificar capacidades. Comandos de abertura não são presumidos iguais em toda a linha. |
| Dahua | Integração DSS/DEPP ou SDK aprovado | Cadastro, pacote oficial, NDA/licença de API quando exigidos pela fabricante. |
| ZKTeco | ZKBio CVSecurity 6+ ou SDK/protocolo da família | API licenciada no servidor CVSecurity; terminais de outras linhas podem exigir ponte nativa. |
| Outros | Evento HTTP normalizado via gateway | O integrador implementa a tradução e a homologação do protocolo real. |

## Uma identificação pode ser somente auditoria

O Monitor `access_photo`, o evento `AccessControl` e um registro `AcsEvent` podem informar algo que o equipamento já identificou ou decidiu. Receber esse evento e avaliar uma regra depois não garante bloqueio prévio de uma autorização vencida.

Para liberar visitantes com prazo limitado, use uma destas estratégias homologadas: consulta online preventiva suportada pelo dispositivo; ou sincronização das datas e regras para decisão local. Teste cancelamento, expiração, porta, contingência e relógio do dispositivo. Não apresentar uma observação como ordem de abertura.

`src/equipment-events.ts` exige uma finalidade explícita no envelope. Solicitações preventivas só são aceitas para configuração `mode: "online"`. A normalização do Monitor retorna `kind: "observation"`, sem tratá-lo como resposta de autorização.

## Contratos confirmados e limites

### Control iD

`POST /login.fcgi` recebe `login/password` e retorna sessão. O modo Pro compatível consulta o servidor por `POST /new_user_identified.fcgi`. A resposta tem `result.event` e `actions`; `event: 6` com lista vazia representa negativa no contrato documentado. Ações de liberação devem ser geradas pelo gateway segundo o modelo e portal configurados, após a regra de autorização. Monitor é observacional.

Fontes: [eventos online](https://www.controlid.com.br/docs/access-api-pt/modos-de-operacao/eventos-de-identificacao-online/), [configurar modo online](https://www.controlid.com.br/docs/access-api-pt/modos-de-operacao/configurar-modo-online/), [modo e contingência](https://www.controlid.com.br/docs/access-api-pt/modos-de-operacao/introducao-aos-modos-de-operacao/), [Monitor](https://www.controlid.com.br/docs/access-api-pt/monitor/introducao-ao-monitor/), [referência de login](https://www.controlid.com.br/suporte/api_idaccess_V2.6.8.html).

### Intelbras

O documento HTTP API V3.35 descreve autenticação Digest, `GET /cgi-bin/accessControl.cgi?action=openDoor&channel=1` e status de porta. O stream de eventos usa `GET /cgi-bin/eventManager.cgi?action=attach&codes=[AccessControl,TrafficJunction]&heartbeat=5`. Esses endpoints são referências para modelos que implementam o contrato, e não uma garantia para toda a marca. O gateway deve processar os eventos multipart, reconexão e capacidades.

Fontes: [HTTP API V3.35](https://botminio.apps.intelbras.com.br/sdk-api/HTTP%20API%20V3.35_Intelbras.pdf), [integração de acesso V1.3](https://suporte.intelbras.com.br/images/d/dd/Documento_de_Integrao_via_API_V1.3.pdf), [SS3530 e solicitação da API](https://www.intelbras.com/pt-br/ajuda-download/faq/controlador-de-acesso-facial-ss-3530-mf-face).

### Hikvision

ISAPI oferece integração HTTP/REST e Digest. Os documentos oficiais descrevem `GET /ISAPI/Event/notification/alertStream` e `POST /ISAPI/AccessControl/AcsEvent?format=json` para eventos. A documentação do modelo deve determinar o acionamento físico, sincronização de validade e eventos ANPR. Não foi implementado um comando universal de abertura de porta.

Fontes: [capacidades TPP](https://tpp.hikvision.com/tpp/OpenCapabilities), [guias por modelo](https://tpp.hikvision.com/download/ISAPI_OTAP?type=1), [contratos de acesso](https://open.hikvision.com/hardware/v2/08%E5%8D%8F%E8%AE%AE%E9%80%8F%E4%BC%A0/%E6%98%8E%E7%9C%B8%E9%97%A8%E7%A6%81.html), [stream de eventos](https://www.hikvisioneurope.com/eu/portal/portal/Technology%20Partner%20Program/02-Solutioins%20of%20Hikvision%20product%20integration/Perimeter%20Protection%20NVR%20Integration%20Solution.pdf).

### Dahua

A integração DSS documenta pessoas, portas, eventos, ANPR e reconhecimento facial, com participação no DEPP e condições de API/licença. A ponte precisa do pacote oficial aprovado. Não é correto assumir que a API CGI de outra marca seja compatível.

Fonte: [DSS e requisitos oficiais](https://www.dahuasecurity.com/products/software/ecosystem/integration-with-dss).

### ZKTeco

O manual ZKBio CVSecurity API V1.1 para 6.0+ documenta licença, `access_token`, `POST /api/door/remoteOpenById`, `GET /api/transaction/monitor` e consulta de transações. A conexão ocorre com o servidor CVSecurity. Outras famílias usam SDK Standalone, Pull C3/InBio ou LPR/PUSH conforme disponibilidade. Tokens na query desse protocolo devem ser protegidos contra registro em logs pelo gateway.

Fontes: [API CVSecurity](https://www.zkteco.com/en/ZKBio_CVSecurity_API/ZKBioCVSecurity_API), [manual oficial V1.1](https://s3.ap-southeast-1.amazonaws.com/zkteco.co.th/files/20240807/ZKBio_CVSecurity_3rd_Party_API_User_Manual_V1.1_20240521.pdf), [SDKs](https://www.zkteco.co.th/SDK).

## Fluxo de implantação

1. Levantar modelos, versões, licenças, rede, portas e política de contingência.
2. Implantar a API com banco, usuários, autorização por condomínio/unidade, auditoria e notificações desejadas.
3. Instalar o gateway na rede local e implementar o adaptador do modelo documentado.
4. Vincular identificadores do leitor e placas aos cadastros, e configurar modo online ou sincronização de validade.
5. Validar início/fim de autorização, revogação, porta errada, falhas, duplicidade, reconhecimento e retorno de energia em ambiente controlado.
6. Configurar `runtime-config.js` com a API HTTPS homologada e publicar no mesmo GitHub Pages.

O contrato do gateway exige HMAC SHA-256 sobre os bytes originais do corpo, chave longa exclusiva e registro durável de `eventId`. A função de verificação não implementa armazenamento de repetição ou gerenciamento de segredos. Não há coleta de imagens biométricas pela demonstração.
