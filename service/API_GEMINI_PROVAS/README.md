# 🤖 API Gemini - Analisador de Vestibulares

Uma API poderosa que utiliza **Google Gemini AI** para analisar provas de vestibulares e seus gabaritos, extraindo informações estruturadas sobre questões, alternativas e conteúdos abordados.

## 📋 Funcionalidades

- ✅ **Análise automática** de provas em PDF
- ✅ **Extração de questões** com enunciados completos
- ✅ **Identificação de conteúdos** por disciplina
- ✅ **Validação com gabarito** oficial
- ✅ **Saída estruturada** em formato JSON
- ✅ **Salvamento automático** dos resultados

## 🎯 O que a API faz?

A API processa dois arquivos PDF:
1. **Prova de Vestibular** (ex: FUVEST, ENEM, UNICAMP)
2. **Gabarito Oficial** da mesma prova

E retorna um JSON estruturado com:
- Informações da prova (universidade, ano, total de questões)
- Cada questão com enunciado, alternativas e resposta correta
- Identificação dos conteúdos abordados por questão

## 🚀 Instalação Rápida

### Pré-requisitos
- **Node.js** >= 18.0.0
- **npm** >= 8.0.0
- **Chave API do Google Gemini**

### Instalação Passo a Passo
```bash
# 1. Navegar para o diretório
cd "c:\Users\fegro\OneDrive\Desktop\API GEMINI"

# 2. Verificar Node.js
node --version
npm --version

# 3. Inicializar projeto
npm init -y

# 4. Instalar dependências
npm install @google/generative-ai dotenv nodemon

# 5. Configurar package.json
# (adicionar "type": "module" manualmente)

```

## ⚙️ Configuração

### 1. Configurar API Key
Edite o arquivo `.env`:
```env
GEMINI_API_KEY=AIzaSyC... # Sua chave real aqui
```

### 2. Configurar URLs dos PDFs
No arquivo `Gemini_service_app.js`, atualize as linhas 159-160:
```javascript
const provaUrl = "https://sua-url-da-prova.pdf";
const gabaritoUrl = "https://sua-url-do-gabarito.pdf";
```

## 🎮 Como Usar

### Executar a API
```bash
# Modo normal
npm start

# Modo desenvolvimento (auto-reload)
npm run dev

# Execução direta
node Gemini_service_app.js
```

### Exemplo de Uso
1. Configure as URLs dos PDFs no código
2. Execute `npm start`
3. Aguarde o processamento
4. O resultado será salvo automaticamente em `resultados/`

## 📁 Estrutura do Projeto

```
API GEMINI/
├── 📄 Gemini_service_app.js    # Arquivo principal da API
├── 📦 package.json             # Configurações do projeto
├── 🔐 .env                     # Variáveis de ambiente
├── 📚 node_modules/            # Dependências (criado automaticamente)
├── 📋 README.md                # Este arquivo
├── 📝 requirements.txt         # Lista de dependências
└── 📁 resultados/              # Resultados salvos (criado automaticamente)
    └── analise_vestibular_2025-01-12T14-30-00-000Z.json
```

## 📊 Formato de Saída

A API retorna um JSON estruturado:

```json
{
  "prova": {
    "nomeUniversidade": "FUVEST",
    "ano": "2024",
    "qtdeQuestoes": 90
  },
  "questoes": [
    {
      "numeroEnunciado": 1,
      "enunciado": "Texto completo da questão...",
      "alternativas": [
        {"letra": "A", "texto": "Primeira alternativa"},
        {"letra": "B", "texto": "Segunda alternativa"},
        {"letra": "C", "texto": "Terceira alternativa"},
        {"letra": "D", "texto": "Quarta alternativa"},
        {"letra": "E", "texto": "Quinta alternativa"}
      ],
      "opcaoCorreta": "C",
      "conteudo": ["Matemática – Funções do 1º grau"]
    }
  ]
}
```

## 📦 Dependências

| Pacote | Versão | Descrição |
|--------|--------|-----------|
| `@google/generative-ai` | ^0.17.1 | SDK oficial do Google Gemini |
| `dotenv` | ^16.4.5 | Gerenciamento de variáveis de ambiente |
| `nodemon` | ^3.0.2 | Auto-reload para desenvolvimento |
| `fs` | nativo | Sistema de arquivos (Node.js) |
| `path` | nativo | Utilitários de caminho (Node.js) |

## 🔧 Solução de Problemas

### Erros Comuns

| Erro | Solução |
|------|---------|
| `module not found` | `npm install @google/generative-ai` |
| `require is not defined` | Adicionar `"type": "module"` no package.json |
| `API key not found` | Configurar `GEMINI_API_KEY` no arquivo .env |
| `Erro de permissão` | Executar como administrador |
| `URL inválida` | Verificar se as URLs dos PDFs estão corretas |

### Logs da Aplicação
A API fornece logs detalhados:
- 🚀 Início da análise
- 📤 Upload dos arquivos
- ⏳ Status do processamento
- 🧠 Envio para análise
- 💾 Salvamento dos resultados
- ✅ Conclusão com sucesso

## 🔒 Segurança

- ⚠️ **Nunca** compartilhe sua API Key publicamente
- 🔐 Use variáveis de ambiente para informações sensíveis
- 📝 Adicione `.env` ao `.gitignore` se usar Git

## 📈 Exemplo de Execução

```bash
🚀 Iniciando análise do vestibular...

📤 Fazendo upload dos arquivos...
🔄 Baixando Prova Vestibular de: https://exemplo.com/prova.pdf
📤 Enviando Prova Vestibular para processamento...
✅ Arquivo Prova Vestibular processado com sucesso!

🔄 Baixando Gabarito Oficial de: https://exemplo.com/gabarito.pdf
📤 Enviando Gabarito Oficial para processamento...
✅ Arquivo Gabarito Oficial processado com sucesso!

🧠 Enviando para análise com Gemini...
📊 Análise concluída: 90 questões processadas
💾 Resultado salvo em: c:\...\resultados\analise_vestibular_2025-01-12T14-30-00-000Z.json

📋 RESUMO DA ANÁLISE:
🏫 Universidade: FUVEST
📅 Ano: 2024
📝 Total de questões: 90

✅ Análise concluída com sucesso!
```

## 🆘 Suporte

Se encontrar problemas:
1. Verifique se o Node.js está atualizado
2. Confirme se a API Key está configurada corretamente
3. Teste as URLs dos PDFs em um navegador
4. Verifique os logs para identificar erros específicos
