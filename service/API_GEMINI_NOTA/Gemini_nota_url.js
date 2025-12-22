import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

// --- Carregamento robusto do .env ---
// 1. Carrega o .env do diretório atual (onde o script está)
dotenv.config();

// 2. Se a chave AINDA não foi encontrada, tenta carregar da pasta pai (raiz do projeto)
if (!process.env.GEMINI_API_KEY) {
  const altEnvPath = path.resolve(process.cwd(), "../.env");
  if (fs.existsSync(altEnvPath)) {
    dotenv.config({ path: altEnvPath });
  }
}

// --- Validação explícita da Chave API ---
if (!process.env.GEMINI_API_KEY) {
  console.error(
    "\nERRO CRÍTICO: GEMINI_API_KEY não foi encontrada!\n\n" +
    "Por favor, siga estes passos:\n" +
    "1. Crie um arquivo chamado `.env` na mesma pasta deste script (ou na raiz do projeto 'SimulaVest-IA').\n" +
    "2. Dentro deste arquivo .env, adicione a seguinte linha (substituindo 'SUA_CHAVE_API_AQUI'):\n" +
    "   GEMINI_API_KEY=SUA_CHAVE_API_AQUI\n\n" +
    "O script não pode continuar sem a chave.\n"
  );
  process.exit(1); // Encerra o script imediatamente
}

// Agora esta linha é segura, pois já validamos a chave
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Função de upload de PDF remoto.
 */
async function uploadRemotePDF(url, displayName) {
  console.log(`Baixando PDF remoto: ${displayName}`);
  const pdfBuffer = await fetch(url).then((response) => response.arrayBuffer());
  const fileBlob = new Blob([pdfBuffer], { type: "application/pdf" });

  const file = await ai.files.upload({
    file: fileBlob,
    config: {
      displayName: displayName,
    },
  });

  console.log(`Upload concluído. Aguardando processamento...`);
  // Aguarda o processamento
  let attempts = 0;
  let getFile = await ai.files.get({ name: file.name });
  while (getFile.state === "PROCESSING") {
    attempts += 1;
    console.log(`Status do arquivo: ${getFile.state} (tentativa ${attempts})`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    getFile = await ai.files.get({ name: file.name });
  }
  if (getFile.state === "FAILED") {
    throw new Error("O processamento do arquivo PDF falhou.");
  }
  return file;
}

/**
 * JSON Schema: Definido para extrair notas de corte.
 */
const jsonSchema = {
  type: "object",
  properties: {
    nomeUniversidade: { type: "string" },
    siglaUniversidade: { type: "string" },
    nomeVestibular: { type: "string" },
    ano: { type: "number" },
    cursos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nomeCurso: { type: "string" },
          modalidade: { type: "string" },
          vagas: { type: "number" },
          inscritos: { type: "number" },
          ausentes: { type: "number" },
          convocadosSegundaFase: { type: "number" },
          convocadosPorVaga: { type: "number" },
          notaCorte: { type: "number" },
        },
        // --- CAMPOS OBRIGATÓRIOS ---
        required: [
          "nomeCurso",
          "modalidade",
          "vagas",
          "inscritos",
          "ausentes",
          "convocadosSegundaFase",
          "convocadosPorVaga",
          "notaCorte",
        ],
      },
    },
  },
  required: [
    "nomeUniversidade",
    "siglaUniversidade",
    "nomeVestibular",
    "ano",
    "cursos",
  ],
};

/**
 * Prompt: Focado em extrair dados de notas de corte.
 */
const prompt = [
`Você é um assistente de IA especialista em análise de documentos de vestibulares. Sua única função é processar o arquivo PDF fornecido, que contém uma lista ou tabela de notas de corte e estatísticas.

Sua tarefa é ler e interpretar o documento e extrair as seguintes informações:
- Metadados: O nome da Universidade, a sigla (se houver), o nome do vestibular e o ano.
- Para CADA curso e modalidade listado na tabela:
  - O nome do curso.
  - A modalidade de concorrência (ex: "Ampla Concorrência", "Cota Escola Pública", "PPI", etc.).
  - O número de 'VAGAS'.
  - O número de 'INSCRITOS'.
  - O número de 'AUSENTES'.
  - O número de 'CONVOC 2ª FASE'.
  - O número de 'CONVOC POR VAGA'.
  - A nota de corte (que está na coluna 'PONTOS MÍNIMO').

### **Regras Críticas de Processamento:**

1.  **Extração de Tabela**: Os dados estão em formato de tabela. Extraia CADA LINHA da tabela que contenha um curso e uma modalidade (linhas recuadas). Linhas que são apenas o nome do curso (como "101-Biotecnologia") devem ser usadas como contexto, mas não devem gerar uma entrada de JSON sozinhas.
2.  **Limpeza de Dados**:
    * **Cursos**: "Engenharia (Noturno)" deve ser "Engenharia". O turno não deve ser incluído no nome.
    * **Notas e Números**: Se o valor for "785.42", extraia o número 785.42. Se for "N/A" ou "-", ignore esta entrada. Apenas valores numéricos são válidos.
3.  **Schema OBRIGATÓRIO**: A saída final deve ser estritamente um único objeto JSON puro. Siga o schema da função fornecida com exatidão.
    **É CRUCIAL que os campos do nível raiz (nomeUniversidade, siglaUniversidade, nomeVestibular, ano) sejam preenchidos corretamente. Eles SÃO tão importantes quanto a lista de cursos.**
    * Mapeie 'CONVOC 2ª FASE' para o campo 'convocadosSegundaFase'.
    * Mapeie 'CONVOC POR VAGA' para o campo 'convocadosPorVaga'.
    * Mapeie 'PONTOS MÍNIMO' para o campo 'notaCorte'.
    * Todos os campos (vagas, inscritos, ausentes, etc.) DEVEM ser um 'number'.
4.  **Ignorar Totais**: Ignore a(s) linha(s) "Total" no final do documento.

Não crie ou modifique nenhum nome de campo. Respeite os tipos de dados e a estrutura de array/objeto conforme o JSON Schema da ferramenta.
`
];


/**
 * Função principal do serviço.
 */
async function processCutoffScores(pdfUrl) {
  console.log(`Iniciando processamento do PDF de Notas de Corte`);
    let file;
    try {
    console.time("Processando PDF de Notas de Corte");
        file = await uploadRemotePDF(pdfUrl, "PDF_Notas_de_Corte");
        console.timeEnd("Processando PDF de Notas de Corte");
    } catch (error) {
    console.error("Erro durante o upload/processamento do PDF:", error?.message || error);
        throw new Error("Falha no upload do arquivo para a API do Gemini.");
    }

    const contents = [
      { parts:[
          { text: prompt[0] },
          { fileData: { mimeType: file.mimeType, fileUri: file.uri } },
      ]}
    ];

  console.log("Enviando requisição para o modelo Gemini");
    console.time("Processamento de Conteúdo Gemini");
    
    let response;
    try {
        response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192,
            },
            tools: [{
                functionDeclarations: [{
                    name: "extrair_notas_corte",
                    description: "Extrai os dados estruturados de notas de corte.",
                    parameters: jsonSchema,
                }, ],
            }, ],
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ],
        });
  } catch (apiError) {
    console.error("Erro da API do Gemini:", apiError?.message || apiError);
        throw new Error("A API do Gemini retornou um erro durante o processamento.");
    }
    
    console.timeEnd("Processamento de Conteúdo Gemini");
  console.log("Resposta recebida do modelo. Iniciando extração do JSON...");

    const responseContentParts = response.candidates[0].content.parts;
    let jsonData;

    try {
     if (responseContentParts && responseContentParts[0] && responseContentParts[0].functionCall) {
            jsonData = responseContentParts[0].functionCall.args;
      console.log("JSON extraído via functionCall.");
        } else {
            const responseTextContent = responseContentParts[0].text;
            const match = responseTextContent.match(/\{[\s\S]*\}/);
            if (match && match[0]) {
                jsonData = JSON.parse(match[0]);
        console.log("functionCall ausente. JSON extraído do texto (fallback).");
            } else {
                throw new Error("Nenhum objeto JSON ou functionCall encontrado na resposta.");
            }
        }
    } catch (e) {
    console.error("Falha ao processar o JSON:", e?.message || e);

        const logsDir = path.join(process.cwd(), "Erros");
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        const now = new Date();
        const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
        const logFileName = `erro_json_parse_cutoff_${timestamp}.txt`;
        const logFilePath = path.join(logsDir, logFileName);
        const logContent = `Ocorreu uma falha ao processar o JSON (Notas de Corte).
            Mensagem de Erro: ${e.message}
            ---
            Resposta Bruta Recebida:
            ${JSON.stringify(response.candidates[0].content.parts, null, 2)}
            `;
  fs.writeFileSync(logFilePath, logContent, "utf-8");
  console.error(`>>> Resposta bruta salva em: ${logFilePath}`);
        
        throw new Error("Falha ao processar a resposta JSON da IA.");
    }

    // Salvar o JSON em um arquivo no repositório "Resultados"
try {
      // --- Obter e VALIDAR os dados para os caminhos ---
      const sigla = jsonData.siglaUniversidade;
      const ano = jsonData.ano;

      // 1. Validação da SIGLA (Fallback: "vestibular-desconhecido")
      if (!sigla || typeof sigla !== 'string') {
          console.warn(`ALERTA: 'siglaUniversidade' não encontrada ou inválida no JSON. Usando fallback 'vestibular-desconhecido'.`);
      }
      // Se 'sigla' for undefined, null ou não-string, usa o fallback
      const siglaValida = (sigla && typeof sigla === 'string') ? sigla : "vestibular-desconhecido";

      // 2. Validação do ANO (Fallback: Ano atual)
      const anoAtual = new Date().getFullYear();
      if (!ano || typeof ano !== 'number') {
          console.warn(`ALERTA: 'ano' não encontrado ou inválido no JSON. Usando fallback '${anoAtual}'.`);
      }
      // Se 'ano' for undefined, null ou não-número, usa o fallback
      const anoValido = (ano && typeof ano === 'number') ? ano : anoAtual;
      
      // Converter o ano para string (útil para o nome do ARQUIVO)
      const anoStr = String(anoValido); // Usa a variável validada

      // --- Slug da PASTA baseado na SIGLA ---
      // Usa a SIGLA, remove acentos, caracteres especiais e troca espaços por traços
      const vestibularSlug = siglaValida.toLowerCase() // Usa a variável validada
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/gi, '')
        .replace(/[\s_]+/g, '-');
      
      // --- Caminho do diretório simplificado (usando o slug da sigla) ---
      // O caminho agora é /Resultados/[slug_da_sigla] (ex: /Resultados/fuvest)
      const targetDirectory = path.join(process.cwd(), "Resultados", vestibularSlug);

      // Garantir que o caminho completo exista (ex: /Resultados/fuvest)
      if (!fs.existsSync(targetDirectory)) {
          fs.mkdirSync(targetDirectory, { recursive: true });
      }

      // Limpa os nomes para usar no arquivo
      const safeSigla = siglaValida.replace(/[^a-z0-9]/gi, '_'); // Usa a variável validada
      const fileName = `${safeSigla}_${anoStr}.json`;

      // Criar o caminho final do ARQUIVO (dentro da nova pasta)
      const filePath = path.join(targetDirectory, fileName);

      // Salvar o arquivo
      fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), "utf-8");
      
      const cursosCount = Array.isArray(jsonData?.cursos) ? jsonData.cursos.length : 0;
      console.log("Resultado salvo");
      console.log(`Arquivo: ${filePath}`);
      console.log(`Cursos extraídos: ${cursosCount}`);

    } catch (writeError) {
      console.error(`ALERTA: Falha ao salvar o arquivo JSON em /Resultados: ${writeError?.message || writeError}`);
    }
    return jsonData;
}


/**
 * Função 'main' para executar o script localmente
 */
async function main() {
  // URL do PDF: por argumento (1º), env PDF_URL ou fallback manual
  const pdfUrl = "https://www.famema.br/wp-content/uploads/2025/03/Concorrencia-Vestibular-FAMEMA-2022-2024.pdf";
  console.log(`Iniciando Processamento Local`);
  if (!pdfUrl) {
    console.error(`URL do PDF não definida. Forneça via 'node Gemini_nota_url.js <URL>' ou defina a variável de ambiente PDF_URL.`);
    // REMOVIDO: process.exitCode = 1;
    return;
  }

  try {
    // Chama a função principal de processamento
    await processCutoffScores(pdfUrl);
    
    // Loga que o processo foi um sucesso
    // A função processCutoffScores já salva o arquivo
    console.log(`Processamento Local Concluído`);
    console.log("JSON extraído e salvo na pasta /Resultados.");

  } catch (error) {
    console.error(`ERRO GERAL NO PROCESSAMENTO LOCAL`);
    console.error(error?.stack || error?.message || String(error));
  }
}

main();