import fs from "fs";
import path from "path";
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function uploadRemotePDF(url, displayName) {
  const pdfBuffer = await fetch(url).then((response) => response.arrayBuffer());

  const fileBlob = new Blob([pdfBuffer], { type: "application/pdf" });

  const file = await ai.files.upload({
    file: fileBlob,
    config: {
      displayName: displayName,
    },
  });

  // Wait for the file to be processed.
  let getFile = await ai.files.get({ name: file.name });
  while (getFile.state === "PROCESSING") {
    getFile = await ai.files.get({ name: file.name });
    console.log(`current file status: ${getFile.state}`);
    console.log("File is still processing, retrying in 5 seconds");

    await new Promise((resolve) => {
      setTimeout(resolve, 5000);
    });
  }
  if (file.state === "FAILED") {
    throw new Error("File processing failed.");
  }

  return file;
}

const jsonSchema = {
  type: "object",
  properties: {
    prova: {
      type: "object",
      properties: {
        nomeUniversidade: { type: "string" },
        siglaUniversidade: { type: "string" },
        nomeProva: { type: "string" },
        ano: { type: "number" },
        qtdeQuestoes: { type: "number" },
      },
      required: ["nomeUniversidade", "siglaUniversidade", "nomeProva", "ano", "qtdeQuestoes"],
    },
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
  required: ["prova", "questoes"],
};

async function main() {
  const prompt = [
    `Você é um assistente de IA especialista em análise de provas de vestibulares. Sua única função é processar o arquivo PDF de uma prova e seu respectivo gabarito oficial.

Sua tarefa é ler e interpretar cada questão da prova e extrair as seguintes informações:
- Análise Geral da Prova: O nome da Universidade/Prova, o ano e a quantidade total de questões.
- Para cada questão:
  - O número da questão.
  - O enunciado completo, incluindo qualquer texto associado a imagens, gráficos ou tabelas.
  - A lista de todas as alternativas (A, B, C, D, E).
  - A letra da alternativa correta, que deve ser extraída do arquivo de gabarito.
  - O(s) conteúdo(s) abordados na questão no formato: "Disciplina – Tópico Específico" (exemplo: "Matemática – Funções do 1º grau").

Importante: A disciplina deve ser exclusivamente uma das seguintes: "Língua Portuguesa", "Matemática", "Inglês", "Arte", "Física", "Química", "Biologia", "História", "Geografia", "Filosofia" ou "Sociologia". Não utilize nenhuma outra. Caso a questão não pertença a uma dessas três disciplinas, ignore-a e não a inclua no resultado.
A saída final deve ser estritamente um único objeto JSON puro, sem explicações, comentários, ou formatações extras como blocos de código. Siga o schema da função fornecida com exatidão, não altere nenhum nome dos campos do jsonschema apresentado.
Além disto você é ABSOLUTAMENTE CRÍTICO que os argumentos que você fornecer à função 'extrair_dados_prova' sigam EXATAMENTE o JSON Schema que lhe foi dado, sem quaisquer variações nos nomes dos campos ou nos tipos de dados.

Especificamente, garanta que:
- O objeto principal seja 'prova'.
- Dentro de 'prova', os campos sejam 'nomeUniversidade', 'siglaUniversidade', 'nomeProva', 'ano' e 'qtdeQuestoes'.
- O array de questões seja 'questoes'.
- Cada objeto dentro do array 'questoes' tenha os campos:
    - 'numeroEnunciado' (NÃO 'numeroQuestao').
    - 'enunciado'.
    - 'alternativas' seja um ARRAY de objetos (NÃO um objeto simples), onde cada objeto tem 'letra' e 'texto'.
    - 'opcaoCorreta'.
    - 'conteudo' (NÃO 'conteudoAbordado') seja um ARRAY de strings (NÃO uma string simples).

Não crie ou modifique nenhum nome de campo. Respeite os tipos de dados e a estrutura de array/objeto conforme o JSON Schema da ferramenta.
 `];

  console.log("Iniciando upload e processamento dos arquivos...");

    console.time("Processando Arquivo da Prova");
    let file1 = await uploadRemotePDF("https://www.curso-objetivo.br/vestibular/resolucao-comentada/unesp/2016/1fase/UNESP2016_1fase_prova.pdf", "PDF Da Prova");
    console.timeEnd("Processando Arquivo da Prova"); // Termina o cronômetro do upload da prova

    console.time("Processando Arquivo do Gabarito");
    let file2 = await uploadRemotePDF("https://www.curso-objetivo.br/vestibular/resolucao-comentada/unesp/2016/1fase/UNESP2016_1fase_gabarito.pdf", "PDF Do Gabarito");
    console.timeEnd("Processando Arquivo do Gabarito"); // Termina o cronômetro do upload do Gabarito

    console.log("Uploads e processamento dos PDF's concluídos.");

    const contents = [
      { parts:[
          { text: prompt[0] },
          { fileData: { mimeType: file1.mimeType, fileUri: file1.uri } },
          { fileData: { mimeType: file2.mimeType, fileUri: file2.uri } },
      ]}
    ];

    console.log("Enviando requisição para a IA...");
    console.time("Processamento de Conteúdo Gemini");
    const response = await ai.models.generateContent({
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
            }, ],
        }, ],

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
    // AQUI ESTAVA O PROBLEMA DE NOME DE VARIÁVEL
    const responseContentParts = response.candidates[0].content.parts; // Renomeado de 'responseText' para 'responseContentParts'

    let jsonData;

    if (responseContentParts && responseContentParts[0] && responseContentParts[0].functionCall) {
        jsonData = responseContentParts[0].functionCall.args;
        console.log("JSON extraído do functionCall.");
    } else {
        // Agora, 'responseContentParts' é a variável correta para o array de partes
        // E 'responseTextContent' é uma nova variável para o texto dentro da primeira parte
        const responseTextContent = responseContentParts[0].text;
        try {
            const match = responseTextContent.match(/\{[\s\S]*\}/);
            if (match && match[0]) {
                jsonData = JSON.parse(match[0]);
                console.log("JSON extraído diretamente do texto (fallback).");
            } else {
                throw new Error("Nenhum objeto JSON ou functionCall encontrado na resposta.");
            }
        } catch (e) {
            console.error("Falha ao processar o JSON:", e.message);

            const logsDir = path.join(process.cwd(), "Erros");
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }

            const now = new Date();
            const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
            const logFileName = `erro_json_parse_${timestamp}.txt`;
            const logFilePath = path.join(logsDir, logFileName);

            const logContent = `Ocorreu uma falha ao processar o JSON recebido da API.

            Mensagem de Erro:
            ${e.message}

            ---

            Resposta Bruta Recebida (que causou o erro):
            ${JSON.stringify(response.candidates[0].content.parts, null, 2)}
            `;

            fs.writeFileSync(logFilePath, logContent, "utf-8");

            console.error(`>>> A resposta bruta que causou o erro foi salva no arquivo: ${logFilePath}`);

            return;
        }
    }

    const resultadosDir = path.join(process.cwd(), "Resultados");
    if (!fs.existsSync(resultadosDir)) {
        fs.mkdirSync(resultadosDir);
    }

    const filePath = path.join(resultadosDir, "resultado.json");
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), "utf-8");
    console.log(`Arquivo salvo com sucesso em: ${filePath}`);

}

main();