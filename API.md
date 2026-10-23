# API · Imperium Controle de Acesso

Endpoint implantado: https://abweepruixcyetrzefhk.supabase.co/functions/v1/access-api

O projeto Supabase é compartilhado com outra aplicação. Somente objetos ac_* e a Edge Function access-api pertencem a este sistema. Tabelas têm RLS e privilégios diretos revogados de anon/authenticated. A API valida usuário, condomínio, perfil e unidade com a chave de serviço do ambiente da função. O aviso informativo de RLS sem políticas é esperado no acesso exclusivo pelo servidor. [Referência Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Interface e autenticação

runtime-config.js contém somente endereços públicos. apiBaseUrl vazio mantém apresentação. operationalApiBaseUrl é selecionada por ?ambiente=operacao. Não se aceita URL de API pela query. Configuração inválida bloqueia entrada; falha na API não ativa contas fictícias.

| Método e caminho | Autorização | Uso |
| --- | --- | --- |
| GET /v1/health | Pública | Saúde e homologação pendente |
| POST /v1/auth/login | E-mail e senha | {role: desk ou resident, email, password} |
| POST /v1/auth/logout | Bearer usuário | Revoga esta sessão na API de acesso |
| GET /v1/state | Bearer usuário | Estado v2, diretório e nome do condomínio |
| POST /v1/commands | Bearer usuário | {type, payload, requestId: UUID} |
| GET /v1/integrations | Portaria/admin | Equipamentos, gateways e últimos comandos |
| POST /v1/gates/release | Admin/portaria com can_release | {deviceId, reason, requestId: UUID} |

Login retorna accessToken, expiresAt e user com perfil, nome, e-mail, unidade e capacidades. Cada requisição valida Supabase Auth e vínculo atual. Token fica em memória; recarregar requer novo login. Não há refresh token no cliente. CORS permite https://horizes.github.io; origem não substitui autenticação.

Comandos: visit.create, visit.transition, parcel.receive, parcel.withdraw, invite.create, invite.cancel, booking.create, booking.cancel, request.create e request.resolve. Payloads no OpenAPI. Unidade, horários, permissões e transições são verificados no servidor; o navegador não escreve o estado completo. Morador recebe só sua unidade. Os espaços de reserva desta versão são Salão de festas, Churrasqueira e Espaço gourmet; adaptar antes de oferecer reservas reais.

ac_commit_state usa revisão otimista sob lock e ID/hash do pedido. Reenvio do mesmo pedido não duplica o efeito. Códigos operacionais têm 128 bits aleatórios. Credenciais conferem validade, bloqueio e acesso em cada solicitação. Corpo máximo: 32 KiB. Telas atualizam a cada 15 s; conexões a cada 5 s.

## Administração

POST nas rotas /v1/admin/… exige Bearer de administrador. Formulários em Leitores e acessos → Administração.

| Operação | Corpo |
| --- | --- |
| gateways | {name}; retorna token uma vez, banco armazena hash |
| devices | {id, gatewayId, provider, name, model, gate, methods, mode, actuatorId?} |
| memberships | {userId, role, name, unit, enabled, canRelease} |
| credentials | {name, unit, profile, faceRef?, plate?, validFrom, validUntil, gates} |
| bindings | {deviceId, externalId, credentialId} |
| revoke-credential | {id} |
| commission | {deviceId, enabled, commissioned, gatewayEnabled} |

provider: controlid/intelbras/hikvision/zkteco/dahua/generic. methods: face/plate/code. mode: online/monitor. actuatorId associa câmera à controladora do mesmo gateway e acesso. API aceita vários métodos por dispositivo; formulário inicial cadastra um.

Para usuários, criar/convidar a conta pelo fluxo de identidade escolhido no Supabase, confirmar e-mail e copiar o UUID de Authentication → Users. Vincular como resident (unidade obrigatória) ou desk. Não se pode mover conta de outro condomínio ou alterar o próprio vínculo nesta rota. Auth é compartilhado; ac_memberships é exclusivo deste aplicativo. Não há envio de convites/e-mail pelo painel de acesso.

faceRef é referência interna, sem foto/template. Após cadastrar face no leitor, bindings associa seu ID externo à credencial. A tela Autorizações exibe o ID da credencial e permite bloqueio pelo administrador. Renovação de convite reaproveita cadastro anterior segundo as regras, com nova validade.

## Gateway

Rotas exigem token exclusivo de gateway habilitado, sentAt ISO ±60 s e requestId UUID único. Header X-Gateway-Signature é HMAC SHA-256 hexadecimal usando token como chave sobre:

```text
POST\n/v1/gateway/NOME_DA_ROTA\nCORPO_JSON_ORIGINAL
```

Caminho assinado é lógico, sem prefixo do Supabase. Nonces são persistidos e eventId impede reemissão de autorização. Nunca registrar token ou URL ZKBio com access_token em logs.

| Rota POST | Campos além de requestId/sentAt | Resposta |
| --- | --- | --- |
| /v1/gateway/poll | Nenhum | {jobs, serverTime} |
| /v1/gateway/ack | jobId, leaseId, status, vendorCode? | Status persistido |
| /v1/gateway/identify | eventId, deviceId, method, identifier, purpose | allowed, reason, decisionId, expiresAt?, actuatorId? |

purpose: authorization-request ou observation. Observação nunca libera. Face exige vínculo do dispositivo; placa é normalizada; código exige credencial ativa. Autorizações expiram em até 4 s e nunca depois da credencial. Reconhecimento ocorre no equipamento. Não há ingestão de imagens na API.

Liberação manual exige motivo de 8 a 300 caracteres, dispositivo habilitado/homologado e gateway com contato nos últimos 45 s. Pedido expira em 10 s. Lease não retorna automaticamente à fila; timeout passa a unknown. Gateway registra recibo SQLite antes da atuação. Duplicatas e perda de ack não repetem acionamento. Ack aceita accepted/rejected/unknown. physicalState permanece unknown sem sensor.

## Limites desta entrega

Não há VPS instalada, equipamento conectado, sincronização de biometrias, notificações push/WhatsApp, sensor físico ou alta disponibilidade. Gateway depende da homologação descrita em INTEGRACOES.md. Limites do plano existente se aplicam aos dois aplicativos; nenhum plano adicional foi contratado.

O estado usa documento por condomínio com revisão. Para expansão, medir latência e contenção e particionar entidades/auditoria. Definir retenção, backup, monitoramento e contingência antes da operação. Falha de rede nega novas autorizações online; política local do leitor precisa ser configurada para não ignorar validade.
