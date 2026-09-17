# Vestibuline — IA

Camada de processamento de documentos e integração com IA do Vestibuline. Um conjunto de scripts Node.js que usa a **API do Google Gemini** para transformar PDFs não estruturados (provas de vestibular, gabaritos e tabelas de notas de corte) em dados estruturados (JSON) consumidos pelo restante da plataforma.

## O que este serviço faz

O repositório é dividido em dois processadores independentes, ambos em `service/`:

| Módulo | Entrada | Saída |
|---|---|---|
| [`API_GEMINI_PROVAS`](service/API_GEMINI_PROVAS) | Prova + gabarito (PDF) | JSON com questões, alternativas, resposta correta e conteúdos abordados por questão |
| [`API_GEMINI_NOTA`](service/API_GEMINI_NOTA) | Tabela de notas de corte (PDF, local ou via URL) | JSON com nota de corte por curso/modalidade, organizado por universidade |

Cada módulo aceita tanto arquivos locais quanto arquivos hospedados remotamente (via URL), e usa *Function Calling* do Gemini para garantir que a resposta sempre volte em um schema JSON fixo — sem isso, texto de PDF de vestibular é bagunçado demais para confiar em parsing manual.

O fluxo completo de processamento (particionamento da prova em blocos, filas paralelas, reprocessamento em caso de falha e junção final dos JSONs) está documentado no diagrama [`Fluxograma`](https://miro.com/welcomeonboard/bm1saDBFNENQamdGMk9HNXVndHFEZWVxNlNMRUxLMjZYdU94QzNuQ05JVFpTT3BZckdyK1ZFYUdzNlFua0NNRlZLOXBkbjEwcjFGN2tXdWJSVXRTSXljN0ZmTUlBaFdPc3BMQkMvdm9VSEZGSkx3RmxMYkE5cDlFRWY1UjlZQ0d0R2lncW1vRmFBVnlLcVJzTmdFdlNRPT0hdjE=?share_link_id=6251903062), versionado neste repositório.

📄 Documentação detalhada de cada módulo: [`service/API_GEMINI_PROVAS/README.md`](service/API_GEMINI_PROVAS/README.md) · [`service/API_GEMINI_NOTA/README.md`](service/API_GEMINI_NOTA/README.md)

## Pré-requisitos

- **Node.js** ≥ 18
- Uma **chave de API do Google Gemini** ([gerar aqui](https://aistudio.google.com/app/apikey))

## Rodando localmente

```bash
# 1. Clonar o repositório
git clone https://github.com/projeto-EdTech/IA.git
cd IA/service

# 2. Instalar dependências
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env
# edite o .env e cole sua GEMINI_API_KEY
```

A partir daí, cada módulo é executado de forma independente:

```bash
# Processar uma prova + gabarito
cd API_GEMINI_PROVAS
node Gemini_service_app_local.js   # arquivos locais
node Gemini_service_app_url.js     # arquivos via URL

# Processar uma tabela de notas de corte
cd ../API_GEMINI_NOTA
node Gemini_nota_local.js          # arquivo local
node Gemini_nota_url.js            # arquivo via URL
```

Os resultados são salvos automaticamente em `Resultados/` (organizados por sigla da universidade), e falhas de processamento ficam registradas em `Erros/` — ver o README de cada módulo para o passo a passo completo, incluindo onde apontar o caminho do PDF ou a URL de origem.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `GEMINI_API_KEY` | Sim | Chave de API do Google Gemini usada para autenticar as chamadas de extração. Ver [`.env.example`](service/.env.example). |

## Estrutura do repositório

```
IA/
├── Fluxograma.pdf              # Diagrama do pipeline de processamento (filas, blocos, reprocessamento)
└── service/
    ├── .env.example             # Template de variáveis de ambiente
    ├── package.json
    ├── API_GEMINI_PROVAS/        # Extração de questões a partir de prova + gabarito
    └── API_GEMINI_NOTA/          # Extração de notas de corte
```

## Licença

Este projeto é distribuído sob a licença [MIT](../LICENSE) (mesma licença da organização).
