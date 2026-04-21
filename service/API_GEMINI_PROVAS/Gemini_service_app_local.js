import fs from "fs";
import path from "path";
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
async function getMetadata(fileData1, fileData2) {
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
        { inlineData: fileData1 },
        { inlineData: fileData2 },
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

// Etapa 3: Worker Recursivo
async function processWorker(fileData1, fileData2, inicio, fim, step = 10) {
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
    return processWorker(fileData1, fileData2, atualFim + 1, fim, step);
  }

  const prompt = `
Você é um assistente de IA especialista em análise de provas de vestibulares. Sua única função é processar os arquivos locais de uma prova e seu gabarito oficial.

Nesta etapa, extraia EXATAMENTE das questões ${inicio} até a ${atualFim} e estruture conforme o JSON Schema.

Para cada questão no intervalo solicitado:
- O número da questão (numeroEnunciado).
- O enunciado completo da questão. Textos de apoio devem ser incluídos.
- A lista de todas as alternativas (A, B, C, D, E).
- A letra da alternativa correta, que deve ser extraída do gabarito.
- O(s) conteúdo(s) abordados no formato: "Disciplina – Tópico Específico" (ex: "Matemática – Funções do 1º grau"). As disciplinas permitidas são: "Língua Portuguesa", "Matemática", "Inglês", "Arte", "Física", "Química", "Biologia", "História", "Geografia", "Filosofia", "Sociologia". Se a questão não pertencer a nenhuma dessas, ignore-a.

### **Regras Críticas de Processamento:**

1.  **Transcrição de Fórmulas para LaTeX (JSON-Safe)**: Ao encontrar fórmulas ou símbolos matemáticos, você **deve** transcrevê-los para o formato LaTeX.
    * **Toda barra invertida (\)** nos comandos LaTeX deve ser dupla (\\) para escapar.
    * Exemplo: $\\vec{F}_{res} = m \\cdot \\vec{a}$ ou $\\frac{n_2}{n_1}$.

2.  **Uso de Delimitadores LaTeX**:
    * Use $ ... $ para fórmulas no meio de uma linha de texto.
    * Use $$...$$ para fórmulas centralizadas (bloco).

3.  **Ignorar Outros Elementos Visuais**: Imagens, gráficos e tabelas genéricas que não sejam as alternativas devem ser completamente ignorados (nenhum placeholder). Qualquer texto associado a imagens (legendas) deve ser transcrito no enunciado.

4.  **Alternativas em Formato de Tabela**: Se as alternativas de uma questão (A, B, C, D, E) estiverem em uma estrutura de tabela, o campo 'alternativas' para essa questão deve ser null. O resto da questão prossegue normal.
`;

  const contents = [
    {
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: fileData1 },
        { inlineData: fileData2 },
      ],
    },
  ];

  let success = false;
  let attempt = 0;
  const maxRetries = 3;
  let delay = 5000;

  while (attempt < maxRetries && !success) {
    console.log(
      `[Worker ${inicio}-${fim}] Requisitando questões ${inicio} a ${atualFim} (Tentativa ${attempt + 1} de ${maxRetries})...`,
    );
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents,
        generationConfig: {
          temperature: 0.2,
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

      let parsedData;
      const candidates = response.candidates;
      if (
        candidates &&
        candidates[0] &&
        candidates[0].content.parts[0].functionCall
      ) {
        parsedData = candidates[0].content.parts[0].functionCall.args;
      } else {
        const textResp = candidates[0].content.parts[0].text;
        const match = textResp.match(/\{[\s\S]*\}/);
        if (match) parsedData = JSON.parse(match[0]);
      }

      if (!parsedData)
        throw new Error(
          "A resposta não veio com chamadas de ferramentas ou fallback legível",
        );

      const questoesExtraidas = parsedData.questoes || [];

      fs.writeFileSync(
        tempFile,
        JSON.stringify(questoesExtraidas, null, 2),
        "utf-8",
      );
      console.log(
        `[Worker ${inicio}-${fim}] \u2713 Sucesso! Questões ${inicio} a ${atualFim} salvas.`,
      );
      success = true;
    } catch (error) {
      attempt++;
      console.error(
        `[Worker ${inicio}-${fim}] Erro ao processar questões ${inicio}-${atualFim} (Tentativa ${attempt}/${maxRetries}):`,
        error.message,
      );

      // Resiliência (Retry) - Exponential Backoff
      if (attempt < maxRetries) {
        console.log(
          `[Worker ${inicio}-${fim}] Aguardando ${delay / 1000} segundos antes de tentar novamente...`,
        );
        await sleep(delay);
        delay *= 2;
      } else {
        console.error(
          `[Worker ${inicio}-${fim}] \u2717 Falha definitiva no bloco ${inicio}-${atualFim} após ${maxRetries} tentativas. Gerando checkpoint vazio para prosseguir.`,
        );
        fs.writeFileSync(tempFile, JSON.stringify([], null, 2), "utf-8");
      }
    }
  }

  if (atualFim < fim) {
    console.log(
      `[Worker ${inicio}-${fim}] Aguardando 1 minuto (rate limit) antes de pedir o próximo bloco...`,
    );
    await sleep(60000);
  }

  // Recursão para o próximo bloco
  return processWorker(fileData1, fileData2, atualFim + 1, fim, step);
}

async function main() {
  console.log("Lendo arquivos locais da prova e gabarito...");
  
  const provaPath = "docs_a_processar/Puccamp/2026/Prova.pdf";
  const gabaritoPath = "docs_a_processar/Puccamp/2026/Gabarito.pdf";

  if (!fs.existsSync(provaPath) || !fs.existsSync(gabaritoPath)) {
    console.error(`ERRO: Os arquivos locais não foram encontrados nos caminhos especificados:`);
    console.error(`Prova: ${provaPath}`);
    console.error(`Gabarito: ${gabaritoPath}`);
    return;
  }

  const fileData1 = {
    mimeType: "application/pdf",
    data: Buffer.from(fs.readFileSync(provaPath)).toString("base64")
  };
  
  const fileData2 = {
    mimeType: "application/pdf",
    data: Buffer.from(fs.readFileSync(gabaritoPath)).toString("base64")
  };

  console.log("Leitura concluída.");

  // Executa Discovery
  let metadata;
  try {
    metadata = await getMetadata(fileData1, fileData2);
  } catch (err) {
    console.error("Erro fatal na etapa de Discovery:", err);
    return;
  }

  const qtdeQuestoes = metadata.qtdeQuestoes;
  if (!qtdeQuestoes || qtdeQuestoes <= 0) {
    console.error(
      "Quantidade de questões inválida retornada no Discovery:",
      qtdeQuestoes,
    );
    return;
  }

  console.log("\n-> Aguardando 1 minuto (rate limit) após a requisição do Cabeçalho (Discovery) para estabilizar a cota da API...");
  await sleep(60000);

  // Etapa 2: Orquestrador Dinâmico
  const numFilas = 3;
  const questoesPorFila = Math.ceil(qtdeQuestoes / numFilas);

  const limites = [];
  for (let i = 0; i < numFilas; i++) {
    const inicioFila = i * questoesPorFila + 1;
    const fimFila = Math.min((i + 1) * questoesPorFila, qtdeQuestoes);
    if (inicioFila <= qtdeQuestoes) {
      limites.push({ inicio: inicioFila, fim: fimFila });
    }
  }

  console.log("\n--- Iniciando Extração Paralela ---");
  console.log(
    `Total de questões: ${qtdeQuestoes}. Dividido em ${limites.length} filas:`,
  );
  limites.forEach((l, idx) =>
    console.log(`Fila ${idx + 1}: ${l.inicio} a ${l.fim}`),
  );

  const tempDir = path.join(process.cwd(), "Temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  // Disparar workers em paralelo (Promise.all)
  const promises = limites.map((limite) =>
    processWorker(fileData1, fileData2, limite.inicio, limite.fim, 10),
  );
  await Promise.all(promises);

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

  // Ordenar numericamente para evitar qualquer dessincronização
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

  const resultPath = path.join(resultadosDir, "resultado_local.json");
  fs.writeFileSync(resultPath, JSON.stringify(jsonResult, null, 2), "utf-8");
  console.log(
    `\n\u2713 Processo finalizado com sucesso! Arquivo consolidado em: ${resultPath}`,
  );
}

main();