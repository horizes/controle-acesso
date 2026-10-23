# Imperium · Integração de equipamentos

A demonstração possui um motor de autorização independente do fabricante. Ele recebe um identificador já reconhecido pelo equipamento: referência de face, placa ou código. Depois verifica cadastro, bloqueio, início e término da validade e portas permitidas. Uma leitura desconhecida ou ambígua é recusada.

O navegador não faz reconhecimento biométrico nem aciona relés nesta demonstração. Nenhuma foto, template facial ou credencial real de equipamento é coletada.

## Perfis de integração

| Fabricante / interface | Preparação incluída | O que falta para operação real |
| --- | --- | --- |
| Control iD | Contrato comum de eventos e normalizador do Monitor `access_photo` documentado | Modelo, firmware, autenticação e teste do modo de autorização apropriado |
| Intelbras | Perfil de integração por API/SDK e contrato de eventos | API da linha escolhida, credenciais e homologação do modelo |
| Hikvision | Perfil ISAPI/SDK para acesso e ANPR e contrato de eventos | SDK/API autorizada, modelo, firmware e teste com o dispositivo |
| Dahua e ZKTeco | Perfis planejados e contrato comum de eventos | Implementação específica por linha e homologação |
| Outros | Mensagem HTTP normalizada, verificável por HMAC SHA-256 | Gateway que traduza o protocolo do fornecedor e teste do acionamento |

Esses perfis não representam certificação de compatibilidade com todos os equipamentos dessas marcas. O Monitor da Control iD é uma fonte de eventos; ele não é apresentado como substituto de um callback de autorização online.

## Contrato do conector

```json
{
  "version": 1,
  "eventId": "id-unico-do-evento",
  "provider": "generic",
  "deviceId": "leitor-social-01",
  "sentAt": "2026-10-23T12:00:00.000Z",
  "method": "face",
  "identifier": "referencia-da-face-no-cadastro",
  "gate": "social"
}
```

`method` aceita `face`, `plate` e `code`. Cada equipamento é vinculado a um fabricante, método e acesso. O horário recebido é conferido para rejeitar eventos antigos; a validade da autorização usa o relógio do servidor, não um horário escolhido pelo leitor.

A verificação HMAC está implementada como função independente. Antes de habilitar um endpoint real, ainda devem ser conectados a validação da assinatura, o armazenamento de IDs contra repetição, o cadastro confiável de dispositivos, o banco de credenciais e o adaptador de comando físico. Nenhum endpoint de liberação física está habilitado no pacote de demonstração.

## Validade de visitantes

- Uma visita autorizada manualmente recebe uma autorização demonstrativa de até duas horas.
- Um convite pode ter início e término escolhidos pelo responsável.
- Uma autorização vencida ou bloqueada é recusada mesmo se o cadastro da pessoa continuar existindo.
- Ao renovar um visitante conhecido, a referência facial existente é preservada e a autorização anterior é substituída.
- A saída encerra uma autorização temporária criada especificamente para aquela visita. Um convite já válido mantém a janela de validade definida pelo responsável.
- A autorização para entrada social não permite automaticamente entrar pela garagem.

## Referências oficiais consultadas

- [Control iD · Monitor e eventos de identificação](https://www.controlid.com.br/docs/access-api-pt/monitor/introducao-ao-monitor/)
- [Intelbras · Documentação e solicitação de API/SDK](https://www.intelbras.com/pt-br/ajuda-download/download/controlador-de-acesso-facial-com-medicao-de-temperatura-ss-7520-face-t)
- [Hikvision · Integração de ANPR por ISAPI](https://tpp.hikvision.com/solution/SolutionDetail?Id=325&v=en)
