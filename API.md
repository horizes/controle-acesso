# Conectar uma API ao Controle de Acesso

A interface permanece no GitHub Pages. Não há servidor, banco central, envio de notificações ou equipamento conectado nesta publicação. O cliente de API está implementado em `src/api-client.ts` e já é utilizado pelas telas quando há um endereço configurado.

## Ativação

Implemente o contrato `public/api/openapi.json` em um serviço HTTPS. Depois altere somente `public/runtime-config.js` e publique novamente:

```js
window.IMPERIUM_CONFIG = Object.freeze({
  apiBaseUrl: 'https://api.seu-dominio.com',
  requestTimeoutMs: 10000,
  refreshIntervalMs: 15000
});
```

O endereço acima é ilustrativo. Com `apiBaseUrl: ''`, o site utiliza os acessos públicos de apresentação. Com a API definida, o login usa o servidor, o estado vem da API e as operações são enviadas como comandos. Não há fallback automático para contas de apresentação se a API falhar. Uma URL inválida bloqueia o login e exibe o erro.

O arquivo de configuração é público e não contém tokens nem senhas. Ele usa rede sem cache do service worker. O token de usuário fica apenas na memória da página; recarregar exige novo login no modo API. As contas públicas de apresentação nunca são aceitas como autenticação de produção pelo cliente.

## Endpoints consumidos pela interface

| Método e caminho | Entrada | Saída |
| --- | --- | --- |
| `POST /v1/auth/login` | `role`, `email`, `password` | `accessToken`, `expiresAt`, `user` |
| `POST /v1/auth/logout` | `{}` | `204` |
| `GET /v1/state` | Bearer do usuário | Estado versão 2, incluindo `residents` |
| `POST /v1/commands` | `type`, `payload`, `requestId` | Estado atualizado e autorizado para o usuário |

O perfil `desk` representa portaria; `resident` representa morador. O servidor retorna a identidade e a unidade no login. `expiresAt` usa ISO 8601. Respostas `401` encerram a sessão; `403` informa falta de permissão; `409` solicita conferência por conflito. O servidor precisa serializar as operações que afetam o mesmo registro e proteger reservas contra sobreposição.

A atualização entre dispositivos usa consultas ao estado a cada 15 segundos, configuráveis. As mudanças feitas pela própria tela usam a resposta do comando. Não há Web Push ou envio de WhatsApp/e-mail implementado nesta versão.

## Comandos

| Comando | Quem pode solicitar | Campos do payload |
| --- | --- | --- |
| `visit.create` | Portaria | `name`, `unit`, `host`, `type`, `note` |
| `visit.transition` | Portaria; morador da unidade apenas para autorizar/recusar | `id`, `status` |
| `parcel.receive` | Portaria | `name`, `unit`, `carrier`, `tracking`, `location`, `volumes` |
| `parcel.withdraw` | Portaria | `id`, `receivedBy` |
| `invite.create` | Portaria; morador da própria unidade | `name`, `unit`, `host`, `type`, `startsAt`, `endsAt`, `plate` opcional |
| `invite.cancel` | Portaria; morador responsável | `id` |
| `booking.create` | Morador | `area`, `startsAt`, `endsAt` |
| `booking.cancel` | Morador responsável | `id` |
| `request.create` | Morador | `subject`, `message` |
| `request.resolve` | Portaria | `id` |

O cliente envia intenção, nunca o banco inteiro, permissões prontas ou decisão de abertura física. No cadastro de convite, a API gera código e identificadores. O servidor deve usar `requestId` como chave de idempotência por usuário e conservar a resposta de cada comando processado. Estados, nomes de unidade, datas e identificadores vindos do navegador precisam de validação no servidor.

## Regras do servidor a implementar

- Autenticação real, senhas protegidas por hash adequado, limites de tentativas, recuperação de acesso e provisionamento de usuários.
- Autorização por condomínio, perfil e unidade em cada endpoint. O morador recebe somente seus registros, inclusive no histórico e na lista `residents`. O cliente interrompe uma resposta com registros de outras unidades; essa verificação não substitui autorização no servidor.
- Persistência, transações, trilha de auditoria, backup e retenção. O código do navegador e seus estados são públicos e não constituem barreira de segurança.
- Validação da janela de acesso usando o relógio do servidor. O intervalo é inclusivo no início e exclusivo no término. Bloqueios, portas permitidas e renovação devem ser conferidos antes da decisão.
- CORS restrito à origem do site. O cliente usa JSON e `Authorization: Bearer`, sem cookies; responda ao `OPTIONS` permitindo os cabeçalhos necessários. O caminho do projeto não faz parte da origem CORS: nesta publicação, a origem é `https://horizes.github.io`.
- Nenhuma resposta de autenticação ou de estado deve ser armazenada em cache. As senhas e os tokens de fabricantes pertencem exclusivamente ao serviço ou ao gateway.

## Equipamentos

O navegador não chama câmeras ou controladoras. O contrato de gateway em `public/api/gateway-event.schema.json` e as funções de normalização/HMAC em `src/equipment-events.ts` são a base para a futura integração. Os contratos são documentação e código de preparação; os endpoints do gateway ainda não existem nesta hospedagem.

Uma consulta preventiva usa `purpose: "authorization-request"` apenas quando o equipamento está configurado em modo online compatível. Um evento após a identificação usa `purpose: "observation"`: ele registra o ocorrido e não ordena abertura. A chave HMAC, o controle de repetição durável por `eventId`, a associação de identificadores e os comandos físicos ficam no servidor/gateway. Veja [INTEGRACOES.md](./INTEGRACOES.md) para as diferenças entre fabricantes.

## Validação antes de ativar

Teste com contas distintas: o morador de uma unidade não pode consultar ou alterar outra; portaria não pode administrar usuários sem permissão própria. Teste expiração, revogação, porta errada, evento repetido, comando repetido, perda de conexão, resposta incerta e retorno de energia. Uma falha de comunicação não deve ser apresentada como porta aberta. A política de contingência precisa estar configurada e conferida no próprio equipamento.
