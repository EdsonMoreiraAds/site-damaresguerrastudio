# O que o emissor de referência ensinou ao projeto

Análise de [rodrigoebeta/emissor-nfse](https://github.com/rodrigoebeta/emissor-nfse) (MIT, © 2026 rodrigo e beta). **Nenhum código dele foi copiado para este repositório.** Se o agente local reaproveitar `dps.py`, `assinar.py`, `sefin.py`, `validar.py` ou `danfse.py`, mantenha o aviso de copyright e o texto da licença MIT (a spec já pede isso). Os documentos de `docs/oficial/` são publicações do governo e não estão sob a MIT.

## Como o emissor funciona
Python local → monta a **DPS** (XML) → valida no XSD oficial → assina com o A1 (c14n exclusiva *com comentários*, `Signature` sem prefixo `ds:`, SHA-256) → `POST /nfse` na SEFIN Nacional por **mTLS** → guarda o XML e gera o PDF (DANFSe). Antes de emitir, grava "Emitindo" na fila e consulta `HEAD /dps/{id}` para saber se aquela DPS já virou nota.

## O que mudou no Evolua Notas por causa dele
| Achado | Efeito |
|---|---|
| Certificado e senha **não devem** ir para a nuvem | confirmou o **agente local**; o SaaS nunca recebe o `.pfx` |
| Tomador precisa de **CEP e número** (o código resolve logradouro/IBGE via ViaCEP) | `tomador_cep`, `tomador_numero`, `tomador_complemento` no cadastro da nota |
| Código de tributação nacional/municipal, alíquota do Simples, local da prestação, texto fixo vêm da contabilidade | campos fiscais por empresa (`ctrib_nac`, `ctrib_mun`, `cloc_prestacao`, `aliq_simples`, `texto_fixo`), exigidos para produção |
| **Série 70000 é do portal; por API vale 00001–49999** (erro E0010) | `companies.serie` com `CHECK` na faixa |
| **Número da DPS é do emissor** (sequência própria) | `companies.dps_seq` → `invoice_requests.dps_numero`, atribuído **uma vez** no 1º envio e reaproveitado nas reconsultas |
| `HEAD /dps/{id}` diz se a DPS virou nota | é a base da **reconciliação**: modo `consultar` nunca reemite |
| `tpAmb` do XML deve bater com o endereço (E0006) | o job do agente informa `ambiente`; agente deve recusar divergência |
| Leiaute muda primeiro na restrita (NT 009, `finNFSe`, E1235) | agente deve conferir o XSD do ambiente antes de emitir; ver "Pendências" |
| Relógio adiantado causa E0008 | agente usa hora de Brasília −30 s e refaz 1× com `dataHoraProcessamento` |
| A1 vence em 1 ano | agente informa `cert_valid_until`; painel alerta < 45 dias |
| Escopo: Simples ME/EPP, ISS tributável não retido, tomador no Brasil, sem IBS/CBS | mantido como perfil piloto (`perfil_fiscal`) |

## Pendências para a primeira nota real
- Escrever o agente (adaptar o Python do emissor ao protocolo de `agent/README.md`).
- Decidir o tratamento do `finNFSe`/NT 009 por ambiente.
- Gerar o PDF no agente (DANFSe) e enviá-lo em `pdf_base64`.
- Cancelamento/substituição de nota: fora do MVP (o emissor de referência também as deixa para o portal).
- Validar com a contabilidade de cada cliente os códigos de serviço e a alíquota — responsabilidade deles, não do sistema.
