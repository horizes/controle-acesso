# Integrações com equipamentos

O [guia de implantação](./IMPLANTACAO.md) contém o passo a passo individual de instalação e integração de cada família, incluindo ligação, rede, cadastro, testes e retorno. Os [perfis e formulários](./gateway/installation/) acompanham o pacote de instalação.

Na instalação local, API, SQLite e gateway executam no Windows ou servidor Linux dentro da rede do condomínio, sem internet no fluxo de autorização. GitHub Pages/Supabase são um ambiente de testes separado; VPS/VPN é uma opção remota documentada. Rede e energia locais continuam necessárias. Nenhum modelo foi testado fisicamente nesta entrega.

O [guia de compatibilidade e comissionamento](./COMPATIBILIDADE.md) descreve os caminhos novos, as famílias para avaliação, os assistentes Windows/Linux e as condições para facial e placa. O catálogo em gateway/installation/catalog.json não representa certificação de todos os modelos.

| Caminho | Implementação | Pendência |
| --- | --- | --- |
| Control iD | Login, execute_actions e callback preventivo Pro | Homologar família/firmware, portal, ação e contingência |
| Intelbras | Digest/CGI openDoor, stream multipart, face Method 15 isolada e ANPR TrafficJunction | Confirmar contrato, UTC/RecNo e montagem no modelo |
| Hikvision | ISAPI Digest, eventos XML/JSON faciais/ANPR e helper HCNetSDK alternativo | Confirmar capacidades, formato de evento e montagem; SDK só no caminho nativo |
| ZKTeco | API remoteOpenById ZKBio CVSecurity | Servidor/versão e licença; não é API de todo terminal |
| Dahua | CGI/Digest e eventos nas versões com contrato compatível; contrato para DSS | Confirmar CGI no modelo; ponte DSS nativa continua pendente |
| Outros | Entrada normalizada HMAC e biblioteca de envio SDK | Produtor específico e homologação |

## Control iD

POST /login.fcgi e POST /execute_actions.fcgi?session=…; ação explícita door/sec_box/catra. Números de portal/porta/ID SecBox dependem do modelo. Resposta 200 vazia representa aceite do comando, sem confirmação de sensor.

Callback privado /callbacks/ID/new_user_identified.fcgi valida IP, device_id, portal_id, identifier_id facial homologado, UUID, horário e habilitação. No Pro compatível, consulta validade/bloqueio/local na API e devolve ação. Repetição devolve negativa. device_is_alive.fcgi e session_is_valid.fcgi respondem somente ao aparelho vinculado, com contato recente da autoridade. Configuração online/contingência é feita pelo instalador; registros locais não podem liberar visitante vencido na falha da LAN/central.

Não há upload de face/template no site. Biometria é cadastrada no leitor/software aprovado; faceRef é referência interna e bindings.externalId é o ID no leitor.

Fontes oficiais: [eventos online](https://www.controlid.com.br/docs/access-api-pt/modos-de-operacao/eventos-de-identificacao-online/), [abertura remota](https://www.controlid.com.br/docs/access-api-pt/acoes/abertura-remota-porta-e-catraca/), [modo online](https://www.controlid.com.br/docs/access-api-pt/modos-de-operacao/configurar-modo-online/), [contingência](https://www.controlid.com.br/docs/access-api-pt/modos-de-operacao/introducao-aos-modos-de-operacao/).

## Intelbras

GET /cgi-bin/accessControl.cgi?action=openDoor&channel=1&Type=Remote usa Digest; somente OK confirma aceite. Stream eventManager.cgi é multipart com reconexão, limites e descarte de imagens. AccessControl só aceita identificação facial Method 15 com UserID, RecNo e UTC recente; pede autorização apenas com relé isolado e controladora independente. Os demais eventos não herdam identidade facial. TrafficJunction com placa, UTC recente e RecNo estável pode pedir autorização. Campo ausente/variante de firmware exige ajuste e homologação.

Câmera ANPR independente: cadastrar controladora e câmera, com actuatorId da controladora no mesmo gateway/acesso. Desativar e verificar abertura automática nativa da câmera antes de marcar nativeAutomaticOpeningDisabled: true. Caso contrário, eventos são observação. Avaliar evento após abertura não garante bloqueio preventivo.

Fonte oficial: [HTTP API V3.35](https://botminio.apps.intelbras.com.br/sdk-api/HTTP%20API%20V3.35_Intelbras.pdf).

## Hikvision

O caminho hikvision-isapi usa Digest e PUT RemoteControlDoor; só statusCode 1 em ResponseStatus confirma aceite lógico. Recebe alertStream ou HTTP Listening em /callbacks/ID/events, com XML/JSON limitado e descarte de imagens. ANPR confere canal, placa e horário; facial aceita somente AccessControllerEvent 5/75, ID de pessoa, serial e porta corretos. Facial por eventos exige relé isolado e controladora independente. Consulte COMPATIBILIDADE.md e confirme o contrato ISAPI no firmware antes de usar.

Como alternativa, gateway/native/hikvision-open.cpp usa Login_V40 e NET_DVR_ControlGateway(handle, doorIndex, 1). Credenciais por stdin, sem shell ou senha nos argumentos. SDK proprietário não incluído. Obter bibliotecas oficiais, compilar por CMake e configurar helperCommand em caminho privado. Docker padrão não inclui binário: usar systemd ou imagem privada com SDK/licença. Esse helper de atuação não inclui ingestão de eventos SDK.

Fontes: [ControlGateway](https://open.hikvision.com/hardware/v2/%E6%8E%A5%E5%8F%A3%E5%AE%9A%E4%B9%89/NET_DVR_ControlGateway.html), [materiais e termos](https://tpp.hikvision.com/download/ISAPI_OTAP?type=1).

## ZKTeco

POST /api/door/remoteOpenById?doorId=…&interval=…&access_token=… no servidor ZKBio CVSecurity compatível e licenciado. Código 0 representa aceite. Certificado TLS deve ser confiável; não desativar verificação. Outras linhas exigem SDK/protocolo próprio. Adaptador atual faz atuação; coleta/autorização facial/placa ZKTeco não implementada.

Fonte oficial: [manual API V1.1](https://s3.ap-southeast-1.amazonaws.com/zkteco.co.th/files/20240807/ZKBio_CVSecurity_3rd_Party_API_User_Manual_V1.1_20240521.pdf).

## Dahua

Há protocolos dahua-cgi e dahua-events para versões que documentem o contrato HTTP CGI AccessControl/TrafficJunction, com Digest, as mesmas restrições de identificação e montagem separada. Isso não prova suporte de qualquer linha Dahua; confirmar pelo contrato DEPP e ensaio do modelo.

Para DSS, licensed-bridge envia {commandId, doorId, expiresAt} a /v1/open com HTTPS/Bearer. A ponte deve deduplicar commandId, conferir prazo e retornar {accepted: true} somente após aceite do DSS/SDK. Este é contrato Imperium, não endpoint nativo Dahua. licensedBridgeReady vem falso. A implementação dessa ponte depende do pacote oficial aprovado, licença e termos DEPP/DSS.

Fonte oficial: [DSS e requisitos](https://www.dahuasecurity.com/products/software/ecosystem/integration-with-dss).

## Comissionamento

Testar validade futura/vencida, revogação, desconhecido, acesso errado, leituras repetidas, intertravamento, perda de internet/VPN, retorno de energia, timeout e resposta sem sensor. Definir contingência e emergência com instalador. Teste simulado não substitui homologação física.

Recibos SQLite sobrevivem ao reinício e evitam repetição após timeout/perda de ack. Nunca apagar volume para tentar novamente. Consulte IMPLANTACAO.md para instalação e isolamento por condomínio.
