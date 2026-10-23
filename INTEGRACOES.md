# Integrações com equipamentos

O [guia de implantação](./IMPLANTACAO.md) contém o passo a passo individual de instalação e integração de cada família, incluindo ligação, rede, cadastro, testes e retorno. Os [perfis e formulários](./gateway/installation/) acompanham o pacote de instalação.

API e banco estão no Supabase. Adaptadores em gateway/ executam na estrutura privada da Imperium, com VPN até o roteador do condomínio. O gateway não depende do computador da portaria. Permanecem necessários rede, energia, equipamentos e roteador compatível. Nenhum modelo foi testado fisicamente nesta entrega.

| Caminho | Implementação | Pendência |
| --- | --- | --- |
| Control iD | Login, execute_actions e callback preventivo Pro | Homologar família/firmware, portal, ação e contingência |
| Intelbras | Digest/CGI openDoor, stream multipart e ANPR TrafficJunction | Confirmar contrato e campos de evento no modelo |
| Hikvision | Helper C++ HCNetSDK ControlGateway | Obter SDK oficial, compilar e homologar |
| ZKTeco | API remoteOpenById ZKBio CVSecurity | Servidor/versão e licença; não é API de todo terminal |
| Dahua | Contrato/cliente para ponte licenciada DSS | Ponte nativa depende do pacote oficial aprovado |
| Outros | Contrato normalizado | Adaptador específico e homologação |

## Control iD

POST /login.fcgi e POST /execute_actions.fcgi?session=…; ação explícita door/sec_box/catra. Números de portal/porta/ID SecBox dependem do modelo. Resposta 200 vazia representa aceite do comando, sem confirmação de sensor.

Callback privado /callbacks/ID/new_user_identified.fcgi valida IP VPN, device_id, portal_id, UUID, horário e habilitação. No Pro compatível, consulta validade/bloqueio/local na API e devolve ação. Repetição devolve negativa. device_is_alive.fcgi responde somente ao equipamento vinculado. Configuração online/contingência é feita pelo instalador; registros locais não podem liberar visitante vencido na falha da rede.

Não há upload de face/template no site. Biometria é cadastrada no leitor/software aprovado; faceRef é referência interna e bindings.externalId é o ID no leitor.

Fontes oficiais: [eventos online](https://www.controlid.com.br/docs/access-api-pt/modos-de-operacao/eventos-de-identificacao-online/), [abertura remota](https://www.controlid.com.br/docs/access-api-pt/acoes/abertura-remota-porta-e-catraca/), [modo online](https://www.controlid.com.br/docs/access-api-pt/modos-de-operacao/configurar-modo-online/), [contingência](https://www.controlid.com.br/docs/access-api-pt/modos-de-operacao/introducao-aos-modos-de-operacao/).

## Intelbras

GET /cgi-bin/accessControl.cgi?action=openDoor&channel=1&Type=Remote usa Digest; somente OK confirma aceite. Stream eventManager.cgi é multipart com reconexão, limites e descarte de imagens. AccessControl é auditoria. TrafficJunction com placa, UTC recente e RecNo estável pode pedir autorização. Campo ausente/variante de firmware exige ajuste e homologação.

Câmera ANPR independente: cadastrar controladora e câmera, com actuatorId da controladora no mesmo gateway/acesso. Desativar e verificar abertura automática nativa da câmera antes de marcar nativeAutomaticOpeningDisabled: true. Caso contrário, eventos são observação. Avaliar evento após abertura não garante bloqueio preventivo.

Fonte oficial: [HTTP API V3.35](https://botminio.apps.intelbras.com.br/sdk-api/HTTP%20API%20V3.35_Intelbras.pdf).

## Hikvision

gateway/native/hikvision-open.cpp usa Login_V40 e NET_DVR_ControlGateway(handle, doorIndex, 1). Credenciais por stdin, sem shell ou senha nos argumentos. SDK proprietário não incluído. Obter bibliotecas oficiais, compilar por CMake e configurar helperCommand em caminho privado. Docker padrão não inclui binário: usar systemd ou imagem privada com SDK/licença. Não há ingestão facial/ANPR Hikvision implementada.

Fontes: [ControlGateway](https://open.hikvision.com/hardware/v2/%E6%8E%A5%E5%8F%A3%E5%AE%9A%E4%B9%89/NET_DVR_ControlGateway.html), [materiais e termos](https://tpp.hikvision.com/download/ISAPI_OTAP?type=1).

## ZKTeco

POST /api/door/remoteOpenById?doorId=…&interval=…&access_token=… no servidor ZKBio CVSecurity compatível e licenciado. Código 0 representa aceite. Certificado TLS deve ser confiável; não desativar verificação. Outras linhas exigem SDK/protocolo próprio. Adaptador atual faz atuação; coleta/autorização facial/placa ZKTeco não implementada.

Fonte oficial: [manual API V1.1](https://s3.ap-southeast-1.amazonaws.com/zkteco.co.th/files/20240807/ZKBio_CVSecurity_3rd_Party_API_User_Manual_V1.1_20240521.pdf).

## Dahua

licensed-bridge envia {commandId, doorId, expiresAt} a /v1/open com HTTPS/Bearer. Ponte deve deduplicar commandId, conferir prazo e retornar {accepted: true} somente após aceite do DSS/SDK. Este é contrato Imperium, não endpoint nativo Dahua. licensedBridgeReady vem falso. Ponte depende do pacote oficial aprovado, licença e termos DEPP/DSS.

Fonte oficial: [DSS e requisitos](https://www.dahuasecurity.com/products/software/ecosystem/integration-with-dss).

## Comissionamento

Testar validade futura/vencida, revogação, desconhecido, acesso errado, leituras repetidas, intertravamento, perda de internet/VPN, retorno de energia, timeout e resposta sem sensor. Definir contingência e emergência com instalador. Teste simulado não substitui homologação física.

Recibos SQLite sobrevivem ao reinício e evitam repetição após timeout/perda de ack. Nunca apagar volume para tentar novamente. Consulte IMPLANTACAO.md para instalação e isolamento por condomínio.
