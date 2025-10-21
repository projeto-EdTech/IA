import fs from "fs";
import path from "path";
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Utilitário simples de logs com timestamp e níveis
const ts = () => new Date().toISOString();
const log = {
  info: (...args) => console.log(`[${ts()}] [INFO]`, ...args),
  warn: (...args) => console.warn(`[${ts()}] [WARN]`, ...args),
  error: (...args) => console.error(`[${ts()}] [ERROR]`, ...args),
  step: (label) => console.log(`\n[${ts()}] [STEP] ${label}`),
};

/**
 * Função de upload de PDF remoto.
 */
async function uploadRemotePDF(url, displayName) {
  log.step(`Baixando PDF remoto`);
  log.info(`URL: ${url}`);
  const pdfBuffer = await fetch(url).then((response) => response.arrayBuffer());
  log.info(`PDF baixado (${Number(pdfBuffer?.byteLength || 0).toLocaleString()} bytes). Iniciando upload para Gemini Files...`);
  const fileBlob = new Blob([pdfBuffer], { type: "application/pdf" });

  const file = await ai.files.upload({
    file: fileBlob,
    config: {
      displayName: displayName,
    },
  });

  log.info(`Upload concluído. name='${file.name}', mimeType='${file.mimeType}'. Aguardando processamento...`);
  // Aguarda o processamento
  let attempts = 0;
  let getFile = await ai.files.get({ name: file.name });
  while (getFile.state === "PROCESSING") {
    attempts += 1;
    log.info(`Status do arquivo: ${getFile.state} (tentativa ${attempts})`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    getFile = await ai.files.get({ name: file.name });
  }
  if (getFile.state === "FAILED") {
    throw new Error("O processamento do arquivo PDF falhou.");
  }
  log.info(`Arquivo '${displayName}' processado e ATIVO. state='${getFile.state}'.`);
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
          notaCorte: { type: "number" },
        },
        required: ["nomeCurso", "modalidade", "notaCorte"],
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
`Você é um assistente de IA especialista em análise de documentos de vestibulares. Sua única função é processar o arquivo PDF fornecido, que contém uma lista ou tabela de notas de corte.

Sua tarefa é ler e interpretar o documento e extrair as seguintes informações:
- Metadados: O nome da Universidade, a sigla (se houver), o nome do vestibular e o ano.
- Para cada curso listado:
  - O nome do curso.
  - A modalidade de concorrência (ex: "Ampla Concorrência", "Cota Escola Pública", "PPI", etc.).
  - A nota de corte (apenas o número).

### **Regras Críticas de Processamento:**

1.  **Extração de Tabela**: Os dados estão provavelmente em formato de tabela. Extraia CADA LINHA da tabela que contenha um curso.
2.  **Limpeza de Dados**:
    * **Cursos**: "Engenharia (Noturno)" deve ser "Engenharia". O turno não deve ser incluído no nome.
    * **Notas**: Se a nota for "785.42", extraia o número 785.42. Se for "N/A" ou "-", ignore esta entrada. Apenas notas numéricas são válidas.
3.  **Schema OBRIGATÓRIO**: A saída final deve ser estritamente um único objeto JSON puro. Siga o schema da função fornecida com exatidão. Não altere nenhum nome dos campos.
    * 'nomeCurso', 'modalidade', 'notaCorte'.
    * 'notaCorte' DEVE ser um 'number'.

Não crie ou modifique nenhum nome de campo. Respeite os tipos de dados e a estrutura de array/objeto conforme o JSON Schema da ferramenta.
`
];


/**
 * Função principal do serviço.
 * (Removido o 'export', pois agora é um script local)
 */
async function processCutoffScores(pdfUrl) {
  log.step(`Iniciando processamento do PDF de Notas de Corte`);
  log.info(`Alvo: ${pdfUrl}`);

    let file;
    try {
    console.time("Processando PDF de Notas de Corte");
        file = await uploadRemotePDF(pdfUrl, "PDF_Notas_de_Corte");
        console.timeEnd("Processando PDF de Notas de Corte");
    } catch (error) {
    log.error("Erro durante o upload/processamento do PDF:", error?.message || error);
        throw new Error("Falha no upload do arquivo para a API do Gemini.");
    }

    const contents = [
      { parts:[
          { text: prompt[0] },
          { fileData: { mimeType: file.mimeType, fileUri: file.uri } },
      ]}
    ];

  log.step("Enviando requisição para o modelo Gemini");
  log.info(`Modelo: 'gemini-2.5-flash' | temperature: 0.1 | maxTokens: 8192`);
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
    log.error("Erro da API do Gemini:", apiError?.message || apiError);
        throw new Error("A API do Gemini retornou um erro durante o processamento.");
    }
    
    console.timeEnd("Processamento de Conteúdo Gemini");
  log.info("Resposta recebida do modelo. Iniciando extração do JSON...");

    const responseContentParts = response.candidates[0].content.parts;
    let jsonData;

    try {
     if (responseContentParts && responseContentParts[0] && responseContentParts[0].functionCall) {
            jsonData = responseContentParts[0].functionCall.args;
      log.info("JSON extraído via functionCall.");
        } else {
            const responseTextContent = responseContentParts[0].text;
            const match = responseTextContent.match(/\{[\s\S]*\}/);
            if (match && match[0]) {
                jsonData = JSON.parse(match[0]);
        log.warn("functionCall ausente. JSON extraído do texto (fallback).");
            } else {
                throw new Error("Nenhum objeto JSON ou functionCall encontrado na resposta.");
            }
        }
    } catch (e) {
    log.error("Falha ao processar o JSON:", e?.message || e);

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
  log.error(`>>> Resposta bruta salva em: ${logFilePath}`);
        
        throw new Error("Falha ao processar a resposta JSON da IA.");
    }

    // Salvar o JSON em um arquivo no repositório "Resultados"
    try {
        const resultadosDir = path.join(process.cwd(), "Resultados");
        if (!fs.existsSync(resultadosDir)) {
            fs.mkdirSync(resultadosDir, { recursive: true });
        }

        const sigla = jsonData.siglaUniversidade || 'UNIVERSIDADE';
        const ano = jsonData.ano || 'ANO';
        const vestibular = jsonData.nomeVestibular || 'VESTIBULAR';
        
        const safeSigla = sigla.replace(/[^a-z0-9]/gi, '_');
        const safeVestibular = vestibular.replace(/[^a-z0-9]/gi, '_');

        const fileName = `${safeSigla}_${safeVestibular}_${ano}.json`;
        const filePath = path.join(resultadosDir, fileName);

        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), "utf-8");
  const cursosCount = Array.isArray(jsonData?.cursos) ? jsonData.cursos.length : 0;
  log.step("Resultado salvo");
  log.info(`Arquivo: ${filePath}`);
  log.info(`Cursos extraídos: ${cursosCount}`);

    } catch (writeError) {
  log.error(`ALERTA: Falha ao salvar o arquivo JSON em /Resultados: ${writeError?.message || writeError}`);
    }

    // Retorna o JSON (agora para a função 'main')
    return jsonData;
}


/**
 * NOVO: Função 'main' para executar o script localmente
 */
async function main() {
  // URL do PDF: por argumento (1º), env PDF_URL ou fallback manual
  const pdfUrl = "https://www.fuvest.br/wp-content/uploads/fuvest_2025_notas_de_corte.pdf";

  log.step(`Iniciando Processamento Local`);
  log.info(`Arquivo para processar: ${pdfUrl}`);

  if (!pdfUrl) {
    log.error(`URL do PDF não definida. Forneça via 'node Gemini_nota_url.js <URL>' ou defina a variável de ambiente PDF_URL.`);
    process.exitCode = 1;
    return;
  }

  try {
    // Chama a função principal de processamento
    await processCutoffScores(pdfUrl);
    
    // Loga que o processo foi um sucesso
    // A função processCutoffScores já salva o arquivo
    log.step(`Processamento Local Concluído`);
    log.info("JSON extraído e salvo na pasta /Resultados.");
    process.exitCode = 0;

  } catch (error) {
    log.error(`ERRO GERAL NO PROCESSAMENTO LOCAL`);
    log.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  }
}

// Executa a função main
// Handlers globais para melhor visibilidade de erros inesperados
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection capturado:', reason?.stack || reason);
});
process.on('uncaughtException', (err) => {
  log.error('Uncaught Exception capturada:', err?.stack || err);
});

main();