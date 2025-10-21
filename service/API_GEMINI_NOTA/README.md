# Processamento de Notas de Corte com Gemini AI

Este projeto contém um conjunto de scripts Node.js para automatizar a extração de dados (notas de corte) de documentos PDF de vestibulares, utilizando a API do Google Gemini.

Os scripts são capazes de processar tanto arquivos PDF locais quanto arquivos hospedados remotamente (via URL), convertendo os dados não estruturados dos documentos em um formato JSON limpo e organizado.

## Funcionalidades

* **Extração de Múltiplas Fontes**: Processa PDFs de um diretório local (`Gemini_nota_local.js`) ou de uma URL pública (`Gemini_nota_url.js`).
* **Saída Estruturada**: Utiliza o *Function Calling* da API do Gemini para garantir que os dados sejam sempre retornados em um schema JSON pré-definido.
* **Organização Automática**: Salva os arquivos JSON resultantes em diretórios organizados pela sigla da universidade (ex: `Resultados/fuvest/`).
* **Log de Erros**: Cria um log detalhado na pasta `/Erros` caso a API retorne uma resposta inesperada ou o JSON não possa ser processado, facilitando a depuração.

## Configuração Inicial

Antes de executar qualquer script, siga estes três passos:

### 1\. Instalar Dependências

Você precisará do Node.js instalado. No terminal, dentro da pasta do projeto, execute:

```bash
npm install @google/genai dotenv
```

### 2\. Criar o Arquivo de Ambiente (`.env`)

Os scripts precisam de uma chave de API para se autenticar com o Google Gemini.

1. Crie um arquivo chamado `.env` na raiz do seu projeto (na mesma pasta que contém `service/`).

2. Adicione sua chave de API a este arquivo:

    ```ini
    # Arquivo .env
    GEMINI_API_KEY=SUA_CHAVE_API_AQUI
    ```

### 3\. Estrutura de Pastas Esperada

Os scripts esperam a seguinte estrutura de pastas para funcionar corretamente. Certifique-se de que ela exista:

```
.
├── .env                <-- Seu arquivo de chave de API
└── service/
    └── API_GEMINI_NOTA/
        ├── Gemini_nota_local.js  <-- Script para arquivos locais
        ├── Gemini_nota_url.js    <-- Script para arquivos remotos
        ├── Notas_Corte_Local/    <-- (CRIE ESTA PASTA) Coloque seus PDFs locais aqui
        ├── Resultados/           <-- (CRIADA AUTOMATICAMENTE) Onde os JSONs são salvos
        └── Erros/                <-- (CRIADA AUTOMATICAMENTE) Onde os logs de erro são salvos
```

-----

## Como Usar os Scripts

Existem dois modos de operação, cada um com seu próprio arquivo.

### 1\. `Gemini_nota_local.js` (Para Arquivos Locais)

Este script processa um arquivo PDF que está salvo no seu computador. Ele envia o arquivo diretamente para a API (usando `inlineData`).

**Como executar:**

1. **Adicione o PDF**: Coloque o seu arquivo PDF (ex: `fuvest_2025.pdf`) dentro da pasta `service/API_GEMINI_NOTA/Notas_Corte_Local/`.

2. **Configure o Caminho**: Abra o arquivo `Gemini_nota_local.js` e edite a variável `localPdfPath` (linha 118) para apontar para o seu arquivo:

    ```javascript
    // service/API_GEMINI_NOTA/Gemini_nota_local.js

    // *** ATENÇÃO ***
    // Defina o caminho para o seu PDF de NOTAS DE CORTE local aqui
    const localPdfPath = "Notas_Corte_Local/fuvest_2025.pdf"; // <--- MUDE AQUI
    ```

3. **Execute o Script**: No terminal, navegue até a pasta `service/API_GEMINI_NOTA/` e execute:

    ```bash
    node Gemini_nota_local.js
    ```

**O que acontece:** O script irá ler o PDF, enviá-lo para o Gemini, processar a resposta JSON e salvar o resultado em `Resultados/[sigla_da_universidade]/`, com o sufixo `_local.json`.

### 2\. `Gemini_nota_url.js` (Para Arquivos Remotos via URL)

Este script é ideal para processar PDFs que já estão hospedados online (ex: no site oficial de um vestibular). Ele usa a API de Arquivos do Gemini: o script faz o upload do arquivo a partir da URL e, em seguida, envia o prompt de extração.

**Como executar:**

1. **Obtenha a URL**: Encontre o link público e direto para o arquivo PDF.

2. **Configure a URL**: Abra o arquivo `Gemini_nota_url.js` e edite a variável `pdfUrl` (linha 304) dentro da função `main()`:

    ```javascript
    // service/API_GEMINI_NOTA/Gemini_nota_url.js

    async function main() {
      // URL do PDF:
      const pdfUrl = "https://www.fuvest.br/wp-content/uploads/fuvest_2025_notas_de_corte.pdf"; // <--- MUDE AQUI
      console.log(`Iniciando Processamento Local`);
    // ...
    ```

3. **Execute o Script**: No terminal, navegue até a pasta `service/API_GEMINI_NOTA/` e execute:

    ```bash
    node Gemini_nota_url.js
    ```

**O que acontece:** O script irá baixar o PDF da URL, fazer o upload para o Gemini, aguardar o processamento do arquivo, executar a extração e salvar o JSON resultante em `Resultados/[sigla_da_universidade]/`.

-----

## Detalhes Técnicos

### Schema do JSON

Ambos os scripts são instruídos a retornar um JSON com a seguinte estrutura:

```json
{
  "nomeUniversidade": "string",
  "siglaUniversidade": "string",
  "nomeVestibular": "string",
  "ano": "number",
  "cursos": [
    {
      "nomeCurso": "string",
      "modalidade": "string",
      "notaCorte": "number"
    }
  ]
}
```

### Modelos de IA

* **`Gemini_nota_local.js`**: Utiliza `gemini-1.5-flash`, otimizado para `inlineData` (envio direto de arquivos).
* **`Gemini_nota_url.js`**: Utiliza `gemini-2.5-flash` (ou `gemini-1.5-pro` conforme sua versão), que se integra com a API de Arquivos (`ai.files.upload`)
