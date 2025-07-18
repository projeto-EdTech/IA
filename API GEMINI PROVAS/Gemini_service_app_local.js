import fs from "fs";
import path from "path";
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

// Inicialização da API usando a chave do arquivo .env
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Função para upload de ARQUIVOS LOCAIS, com logging similar ao seu exemplo
async function uploadRemotePDF(url, displayName) {
    const pdfBuffer = await fetch(url)
        .then((response) => response.arrayBuffer());

    const fileBlob = new Blob([pdfBuffer], { type: 'application/pdf' });

    const file = await ai.files.upload({
        file: fileBlob,
        config: {
            displayName: displayName,
        },
    });

    // Wait for the file to be processed.
    let getFile = await ai.files.get({ name: file.name });
    while (getFile.state === 'PROCESSING') {
        getFile = await ai.files.get({ name: file.name });
        console.log(`current file status: ${getFile.state}`);
        console.log('File is still processing, retrying in 5 seconds');

        await new Promise((resolve) => {
            setTimeout(resolve, 5000);
        });
    }
    if (file.state === 'FAILED') {
        throw new Error('File processing failed.');
    }

    return file;
}


// O JSON Schema que define a estrutura da função para a IA
const jsonSchema = {
  type: "object",
  properties: {
    nomeUniversidade: { type: "string" },
    siglaUniversidade: { type: "string" },
    nomeProva: { type: "string" },
    ano: { type: "number" },
    qtdeQuestoes: { type: "number" },

    questoes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          numeroEnunciado: { type: "number" },
          enunciado: { type: "string" },
          alternativas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                letra: { type: "string" },
                texto: { type: "string" },
              },
              required: ["letra", "texto"],
            },
          },
          opcaoCorreta: { type: "string" },
          conteudo: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: [
          "numeroEnunciado",
          "enunciado",
          "alternativas",
          "opcaoCorreta",
          "conteudo",
        ],
      },
    },
  },
  required: [
    "nomeUniversidade",
    "siglaUniversidade",
    "nomeProva",
    "ano",
    "qtdeQuestoes",
    "questoes",
  ],
};


async function main() {
    const prompt = [
    { text: `
    Você é um assistente de IA especialista em análise de provas de vestibulares. Sua única função é processar o arquivo PDF de uma prova e seu respectivo gabarito oficial.
    Sua tarefa é ler e interpretar cada questão da prova e extrair as seguintes informações:
    - Análise Geral da Prova: O nome da Universidade/Prova, o ano e a quantidade total de questões.
    - Para cada questão:
    - O número da questão.
    - O enunciado completo, incluindo qualquer texto associado a imagens, gráficos ou tabelas.
    - A lista de todas as alternativas (A, B, C, D, E).
    - A letra da alternativa correta, que deve ser extraída do arquivo de gabarito.
    - O(s) conteúdo(s) abordados na questão no formato: "Disciplina – Tópico Específico" (exemplo: "Matemática – Funções do 1º grau").

    Importante: A disciplina deve ser exclusivamente uma das seguintes: "Língua Portuguesa", "Matemática", "Inglês", "Arte", "Física", "Química", "Biologia", "História", "Geografia", "Filosofia" ou "Sociologia". Não utilize nenhuma outra. Caso a questão não pertença a uma dessas três disciplinas, ignore-a e não a inclua no resultado.
    O primeiro PDF anexado contém a prova e o segundo PDF contém o gabarito oficial. Você deve extrair as informações de ambos os arquivos, para relacionar os dados.
    A saída final deve ser estritamente um único objeto JSON puro, sem explicações, comentários, ou formatações extras como blocos de código. Siga o schema da função fornecida com exatidão, não altere nenhum nome dos campos do jsonschema apresentado.
    Além disto você é ABSOLUTAMENTE CRÍTICO que os argumentos que você fornecer à função 'extrair_dados_prova' sigam EXATAMENTE o JSON Schema que lhe foi dado, sem quaisquer variações nos nomes dos campos ou nos tipos de dados.

    Especificamente, garanta que:
    - Os campos iniciais do JSON devem ser 'nomeUniversidade', 'siglaUniversidade', 'nomeProva', 'ano' e 'qtdeQuestoes'.
    - O array de questões seja 'questoes'.
    - Cada objeto dentro do array 'questoes' tenha os campos:
        - 'numeroEnunciado' (NÃO 'numeroQuestao').
        - 'enunciado'.
        - 'alternativas' seja um ARRAY de objetos (NÃO um objeto simples), onde cada objeto tem 'letra' e 'texto'.
        - 'opcaoCorreta'.
        - 'conteudo' (NÃO 'conteudoAbordado') seja um ARRAY de strings (NÃO uma string simples).

    Não crie ou modifique nenhum nome de campo. Respeite os tipos de dados e a estrutura de array/objeto conforme o JSON Schema da ferramenta.
    `},
    { inlineData: {
        mimeType: 'application/pdf',
        data: Buffer.from(fs.readFileSync("Provas_local/Prova_UFRR_dia3_2016.pdf")).toString("base64")}
    },
    { inlineData: {
        mimeType: 'application/pdf',
        data: Buffer.from(fs.readFileSync("Provas_local/Gabaritos_UFRR_2016.pdf")).toString("base64")}
    }
    ];

    try {
        console.log("Iniciando upload e processamento dos arquivos locais...");
        console.log("Uploads e processamento dos PDFs concluídos.");

        // Estrutura do 'contents' idêntica à do seu exemplo
        const contents = [{
            role: "user",
            parts: prompt
        }];

        console.log("Enviando requisição para a IA...");
        console.time("Processamento de Conteúdo Gemini");

        // Chamada da API usando `tools` (Function Calling)
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 8192,
            },
            tools: [{
                functionDeclarations: [{
                    name: "extrair_dados_prova",
                    description: "Extrai os dados estruturados de uma prova e seu gabarito.",
                    parameters: jsonSchema,
                }],
            }],
            safetySettings: [
                {
                    category: 'HARM_CATEGORY_HARASSMENT',
                    threshold: 'BLOCK_NONE',
                },
                {
                    category: 'HARM_CATEGORY_HATE_SPEECH',
                    threshold: 'BLOCK_NONE',
                },
                {
                    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                    threshold: 'BLOCK_NONE',
                },
                {
                    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                    threshold: 'BLOCK_NONE',
                },
            ],
        });
        console.timeEnd("Processamento de Conteúdo Gemini");
        console.log("Resposta recebida. Processando JSON...");

        const response = result;

        if (!response || !response.candidates || response.candidates.length === 0) {
            console.error("FALHA CRÍTICA: A resposta da API não contém 'candidates' ou o array está vazio.");
            const logContent = `A resposta da API foi recebida, mas estava vazia ou foi bloqueada.\n\n--- Resposta Bruta Completa (Necessária para Diagnóstico) ---\n${JSON.stringify(result, null, 2)}`;
            // Tenta salvar o log em um arquivo de erro, com seu próprio tratamento de erro de permissão.
            try {
                const logsDir = path.join(process.cwd(), "Erros");
                if (!fs.existsSync(logsDir)) {
                    fs.mkdirSync(logsDir, { recursive: true });
                }
                const timestamp = new Date().toISOString().replace(/:/g, '-');
                const logFilePath = path.join(logsDir, `erro_resposta${timestamp}.txt`);
                fs.writeFileSync(logFilePath, logContent, "utf-8");
                console.error(`>>> Detalhes da falha salvos em: ${logFilePath}`);
            } catch (fileError) {
                console.error("ERRO ADICIONAL: Não foi possível escrever o arquivo de log. Verifique as permissões da pasta.", fileError.message);
            }
            
            return; // Encerra a execução da função para evitar o erro principal.
        }

        const responseParts = response.candidates[0].content.parts;
        let jsonData;

        // Lógica de extração do JSON: primariamente do 'functionCall', com fallback para texto
        if (responseParts && responseParts[0] && responseParts[0].functionCall) {
            jsonData = responseParts[0].functionCall.args;
            console.log("JSON extraído do functionCall (método primário).");
        } else {
            console.warn("WARN: A resposta não veio como functionCall. Tentando extrair do texto (fallback).");
            const responseTextContent = responseParts[0]?.text || '';
            try {
                // Tenta extrair um objeto JSON da string de texto
                const match = responseTextContent.match(/\{[\s\S]*\}/);
                if (match && match[0]) {
                    jsonData = JSON.parse(match[0]);
                    console.log("JSON extraído diretamente do texto (fallback bem-sucedido).");
                } else {
                    throw new Error("Nenhum objeto JSON ou functionCall encontrado na resposta.");
                }
            } catch (e) {
                // Se a extração falhar, salva a resposta bruta para depuração
                console.error("FALHA CRÍTICA: Não foi possível processar o JSON da resposta.", e.message);

                const logsDir = path.join(process.cwd(), "Erros");
                if (!fs.existsSync(logsDir)) {
                    fs.mkdirSync(logsDir, { recursive: true });
                }
                const timestamp = new Date().toISOString().replace(/:/g, '-');
                const logFilePath = path.join(logsDir, `erro_json_${timestamp}.txt`);
                const logContent = `Falha ao processar o JSON recebido da API.\n\nMensagem de Erro: ${e.message}\n\n--- Resposta Bruta ---\n${JSON.stringify(response, null, 2)}`;
                fs.writeFileSync(logFilePath, logContent, "utf-8");

                console.error(`>>> A resposta bruta que causou o erro foi salva em: ${logFilePath}`);
                return; // Encerra a execução
            }
        }

        // Salva o resultado JSON bem-sucedido
        const resultadosDir = path.join(process.cwd(), "Resultados");
        if (!fs.existsSync(resultadosDir)) {
            fs.mkdirSync(resultadosDir);
        }
        const filePath = path.join(resultadosDir, "resultado_prova.json");
        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), "utf-8");
        console.log(`Arquivo salvo com sucesso em: ${filePath}`);

    } catch (error) {
        console.error("Ocorreu um erro inesperado na função main:", error);
    }
}

main();