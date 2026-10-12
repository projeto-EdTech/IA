import fs from "fs";
import path from "path";
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { formatarAlternativas } from "./service/formatter.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadLocalPDF(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }
  return {
    mimeType: "application/pdf",
    data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
  };
}

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

// Etapa 1: Discovery (Cabeçalho)
async function getMetadata(file1, file2) {
  console.log("\n--- Iniciando Discovery ---");
  const prompt = `
Você é um assistente de IA especialista em provas de vestibular.
Analise a prova fornecida e o respectivo gabarito. Extraia as seguintes informações gerais e retorne em JSON:
- Nome completo da Universidade/Instituição (nomeUniversidade)
- Sigla da Universidade/Instituição (siglaUniversidade)
- Nome do Exame ou Vestibular (nomeProva)
- Ano da prova (ano)
- Quantidade total de questões numeradas na prova (qtdeQuestoes)
  `;

  const contents = [
    {
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: file1 },
        { inlineData: file2 },
      ],
    },
  ];

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: contents,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 20000,
    },
    tools: [
      {
        functionDeclarations: [
          {
            name: "extrair_dados_prova",
            description:
              "Extrai os dados estruturados de uma prova e seu gabarito.",
            parameters: jsonSchema,
          },
        ],
      },
    ],
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ],
  });

  let metadata;
  const candidates = response.candidates;
  if (
    candidates &&
    candidates[0] &&
    candidates[0].content.parts[0].functionCall
  ) {
    metadata = candidates[0].content.parts[0].functionCall.args;
  } else {
    const textResp = candidates[0].content.parts[0].text;
    const match = textResp.match(/\{[\s\S]*\}/);
    if (match) metadata = JSON.parse(match[0]);
  }

  if (!metadata) throw new Error("Falha ao extrair metadata");

  console.log("Metadata obtido com sucesso:", metadata);
  return metadata;
}

// Etapa 3: Worker
async function processWorker(file1, file2, inicio, fim, step = 10, tentativa = 1) {
  if (inicio > fim) return;

  const atualFim = Math.min(inicio + step - 1, fim);
  const tempDir = path.join(process.cwd(), "Temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const tempFile = path.join(tempDir, `temp_q${inicio}_${atualFim}.json`);

  // Persistência (Checkpoint)
  if (fs.existsSync(tempFile)) {
    console.log(
      `[Worker] Arquivo ${tempFile} já existe (Checkpoint). Avançando...`,
    );
    return processWorker(file1, file2, atualFim + 1, fim, step, 1);
  }

  const prompt = `
Você é um assistente de IA especialista em análise de provas de vestibulares. Sua única função é processar o arquivo PDF de uma prova e seu gabarito oficial.

Nesta etapa, extraia EXATAMENTE das questões ${inicio} até a ${atualFim} e estruture conforme o JSON Schema.

Para cada questão no intervalo solicitado:
- O número da questão (numeroEnunciado).
- O enunciado completo da questão. Textos de apoio devem ser incluídos.
- A lista de todas as alternativas (A, B, C, D, E).
- A letra da alternativa correta, que deve ser extraída do gabarito.
- O(s) conteúdo(s) abordados no formato: "Disciplina – Tópico Específico" (ex: "Matemática – Funções do 1º grau"). As disciplinas permitidas são: "Língua Portuguesa", "Matemática", "Inglês", "Arte", "Física", "Química", "Biologia", "História", "Geografia", "Filosofia", "Sociologia". Se a questão não pertencer a nenhuma dessas, ignore-a.

### **Regras Críticas de Processamento:**

1.  **Transcrição de Fórmulas para LaTeX (JSON-Safe)**: Ao encontrar fórmulas ou símbolos matemáticos, você **deve** transcrevê-los para o formato LaTeX.
    * **Toda barra invertida (\\)** nos comandos LaTeX deve ser dupla (\\\\) para escapar.
    * Exemplo: $\\vec{F}_{res} = m \\cdot \\vec{a}$ ou $\\frac{n_2}{n_1}$.

2.  **Uso de Delimitadores LaTeX**:
    * Use $ ... $ para fórmulas no meio de uma linha de texto.
    * Use $$...$$ para fórmulas centralizadas (bloco).

3.  **Ignorar Outros Elementos Visuais**: Imagens, gráficos e tabelas genéricas que não sejam as alternativas devem ser completamente ignorados (nenhum placeholder).

4.  **Alternativas em Formato de Tabela**: Se as alternativas de uma questão (A, B, C, D, E) estiverem em uma estrutura de tabela, o campo 'alternativas' para essa questão deve ser null. O resto da questão prossegue normal.
`;

  const contents = [
    {
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: file1 },
        { inlineData: file2 },
      ],
    },
  ];

  console.log(
    `[Worker ${inicio}-${fim}] Requisitando questões ${inicio} a ${atualFim} (Tentativa ${tentativa}/2)...`,
  );
  const startTime = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 20000,
        responseMimeType: "application/json",
        responseSchema: jsonSchema,
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE",
        },
      ],
    });

    let textResp = response.candidates[0].content.parts[0].text;

    let parsedData;
    try {
      const cleanedResp = textResp
        .replace(/\`\`\`json/gi, "")
        .replace(/\`\`\`/gi, "")
        .trim();

      const match = cleanedResp.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      const cleanText = match ? match[0] : cleanedResp;
      parsedData = JSON.parse(cleanText);

      const questoesExtraidas = Array.isArray(parsedData)
        ? parsedData
        : parsedData.questoes || [];

      fs.writeFileSync(
        tempFile,
        JSON.stringify(questoesExtraidas, null, 2),
        "utf-8",
      );
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[Worker ${inicio}-${fim}] ✓ Sucesso! Questões ${inicio} a ${atualFim} salvas (${durationSec}s).`,
      );
    } catch (parseError) {
      console.error(
        `[Worker ${inicio}-${fim}] O JSON falhou após limpeza. Arquivo temporário vazio para forçar o retry...`,
      );
      throw new Error(
        "A IA não retornou um formato estruturado ou legível: " +
          parseError.message,
      );
    }
  } catch (error) {
    if (error.status === 429 || (error.message && (error.message.includes("429") || error.message.includes("exceeded your current quota") || error.message.includes("RESOURCE_EXHAUSTED")))) {
      console.error("cota diária de rota atingida");
      process.exit(1);
    }

    console.error(
      `[Worker ${inicio}-${fim}] ✗ Erro na tentativa ${tentativa} no bloco ${inicio}-${atualFim}.`,
      error.message,
    );

    if (fs.existsSync(tempFile)) {
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {}
    }

    if (tentativa < 2) {
      console.log(
        `[Worker ${inicio}-${fim}] Aguardando 1 minuto antes de retentar o MESMO bloco...`,
      );
      await sleep(60000);
      return processWorker(file1, file2, inicio, fim, step, tentativa + 1);
    } else {
      console.error(
        `[Worker ${inicio}-${fim}] Limite de 2 tentativas atingido! Criando JSON em branco para pular e não quebrar o Merge.`,
      );
      if (!fs.existsSync(tempFile)) {
        fs.writeFileSync(tempFile, JSON.stringify([], null, 2), "utf-8");
      }
    }
  }

  if (atualFim < fim) {
    console.log(
      `[Worker ${inicio}-${fim}] Aguardando 1 minuto (rate limit) antes de pedir o PRÓXIMO bloco...`,
    );
    await sleep(60000);
  }

  return processWorker(file1, file2, atualFim + 1, fim, step, 1);
}

async function processExam(chave, provaAtual) {
  console.log(`Lendo arquivos locais (${provaAtual.nome})...`);
  console.time("Leitura Prova");
  const file1 = loadLocalPDF(provaAtual.provaPath);
  console.timeEnd("Leitura Prova");

  console.time("Leitura Gabarito");
  const file2 = loadLocalPDF(provaAtual.gabaritoPath);
  console.timeEnd("Leitura Gabarito");
  console.log("Leitura concluída.");

  // Executa Discovery
  let metadata;
  try {
    metadata = await getMetadata(file1, file2);
  } catch (err) {
    if (err.status === 429 || (err.message && (err.message.includes("429") || err.message.includes("exceeded your current quota") || err.message.includes("RESOURCE_EXHAUSTED")))) {
      console.error("cota diária de rota atingida");
      process.exit(1);
    }
    console.error("Erro fatal na etapa de Discovery:", err);
    throw err;
  }

  const qtdeQuestoes = metadata.qtdeQuestoes;
  if (!qtdeQuestoes || qtdeQuestoes <= 0) {
    throw new Error(
      `Quantidade de questões inválida retornada no Discovery: ${qtdeQuestoes}`,
    );
  }

  console.log(
    "\n-> Aguardando 1 minuto (rate limit) após a requisição do Cabeçalho (Discovery) para estabilizar a cota da API...",
  );
  await sleep(60000);

  // Etapa 2: Orquestrador Dinâmico
  // 1 única fila, dividida em 3 blocos.
  const numBlocos = 3;
  const step = Math.ceil(qtdeQuestoes / numBlocos);

  console.log("\n--- Iniciando Extração Sequencial ---");
  console.log(
    `Total de questões: ${qtdeQuestoes}. Processando em 1 fila com blocos de ${step} questões (total de ${numBlocos} requisições).`,
  );

  const tempDir = path.join(process.cwd(), "Temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  // Disparar o worker sequencial
  await processWorker(file1, file2, 1, qtdeQuestoes, step);

  // Etapa 4: Unificação (Merge)
  console.log("\n--- Iniciando Merge (Unificação) ---");
  let questoesFinais = [];

  const files = fs
    .readdirSync(tempDir)
    .filter((f) => f.startsWith("temp_q") && f.endsWith(".json"));
  files.sort((a, b) => {
    const matchA = a.match(/temp_q(\d+)_/);
    const matchB = b.match(/temp_q(\d+)_/);
    return (
      (matchA ? parseInt(matchA[1], 10) : 0) -
      (matchB ? parseInt(matchB[1], 10) : 0)
    );
  });

  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(tempDir, f), "utf-8"));
      if (Array.isArray(data)) {
        questoesFinais = questoesFinais.concat(data);
      }
    } catch (err) {
      console.error(`Erro ao ler arquivo temp: ${f}`, err);
    }
  }

  questoesFinais.sort((a, b) => a.numeroEnunciado - b.numeroEnunciado);

  const jsonResult = {
    nomeUniversidade: metadata.nomeUniversidade,
    siglaUniversidade: metadata.siglaUniversidade,
    nomeProva: metadata.nomeProva,
    ano: metadata.ano,
    qtdeQuestoes: metadata.qtdeQuestoes,
    questoes: questoesFinais,
  };

  const resultadosDir = path.join(process.cwd(), "Resultados");
  if (!fs.existsSync(resultadosDir)) {
    fs.mkdirSync(resultadosDir, { recursive: true });
  }

  console.log("\n--- Executando Pós-Processamento (Formatter) ---");
  const jsonFormatado = formatarAlternativas(jsonResult);

  const resultPath = path.join(resultadosDir, `${chave}.json`);
  fs.writeFileSync(resultPath, JSON.stringify(jsonFormatado, null, 2), "utf-8");
  console.log(
    `\n✓ Processo finalizado e formatado com sucesso! Arquivo: ${resultPath}`,
  );

  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log(`\n✓ Pasta Temporária limpa com sucesso.`);
  }
}

async function main() {
  const provasFile = path.join(process.cwd(), "lib", "provas.json");

  if (!fs.existsSync(provasFile)) {
    console.error("Arquivo lib/provas.json não encontrado!");
    return;
  }

  let provasData = JSON.parse(fs.readFileSync(provasFile, "utf-8"));
  let chaves = Object.keys(provasData);

  if (chaves.length === 0) {
    console.log("Nenhuma prova na fila de lib/provas.json.");
    return;
  }

  console.log(`✓ Encontradas ${chaves.length} provas na fila.`);

  for (const chave of chaves) {
    const provaAtual = provasData[chave];
    console.log(`\n======================================================`);
    console.log(
      `Iniciando o processamento da fila: ${provaAtual.nome} [${chave}]`,
    );
    console.log(`======================================================\n`);

    try {
      await processExam(chave, provaAtual);

      delete provasData[chave];
      fs.writeFileSync(
        provasFile,
        JSON.stringify(provasData, null, 2),
        "utf-8",
      );
      console.log(`\n✓ Prova ${chave} finalizada e REMOVIDA DA FILA.`);

      if (Object.keys(provasData).length > 0) {
        console.log(
          "\nAguardando 10 segundos antes do próximo processamento (rate limite global)...",
        );
        await sleep(10000);
      }
    } catch (err) {
      if (err.status === 429 || (err.message && (err.message.includes("429") || err.message.includes("exceeded your current quota") || err.message.includes("RESOURCE_EXHAUSTED")))) {
        console.error("cota diária de rota atingida");
        process.exit(1);
      }
      console.error(
        `\n✗ Erro no processamento de ${chave}. A prova não foi removida e ficará na fila para próximas tentativas.`,
      );
      console.error(err);
    }
  }

  console.log("\nFila de provas concluída com sucesso!");
}

main();
