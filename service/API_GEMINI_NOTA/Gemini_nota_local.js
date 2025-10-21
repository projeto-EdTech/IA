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

// Inicialização da API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
const promptText = `
Você é um assistente de IA especialista em análise de documentos de vestibulares. Sua única função é processar o arquivo PDF fornecido, que contém uma lista ou tabela de notas de corte.

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
`;

async function main() {
  // *** ATENÇÃO ***
  // Defina o caminho para o seu PDF de NOTAS DE CORTE local aqui
  const localPdfPath = "Notas_Corte_Local/UFPR_2024_NotasCorte.pdf"; // <--- MUDE AQUI

  // Verifica se o arquivo existe antes de continuar
  if (!fs.existsSync(localPdfPath)) {
    console.error(
      `ERRO: Arquivo PDF local não encontrado no caminho: ${localPdfPath}`
    );
    console.log(
      `Por favor, verifique o nome do arquivo e a pasta "Notas_Corte_Local".`
    );
    return; // Para a execução
  }

  // Array do prompt, combinando texto e o arquivo local (inlineData)
  const promptParts = [
    { text: promptText },
    {
      inlineData: {
        mimeType: "application/pdf",
        data: Buffer.from(fs.readFileSync(localPdfPath)).toString("base64"),
      },
    },
  ];

  try {
    console.log(`Iniciando processamento do arquivo local: ${localPdfPath}`);

    const contents = [
      {
        role: "user",
        parts: promptParts,
      },
    ];

    console.log("Enviando requisição para a IA...");
    console.time("Processamento de Conteúdo Gemini");

    // Chamada da API usando `tools` (Function Calling)
    const result = await ai.models.generateContent({
      model: "gemini-1.5-flash", // Recomendo usar 1.5-flash ou 1.5-pro para inlineData
      contents: contents,
      generationConfig: {
        temperature: 0.1, // Temperatura baixa para dados
        maxOutputTokens: 8192,
      },
      tools: [
        {
          functionDeclarations: [
            {
              name: "extrair_notas_corte", // Nome da função para notas de corte
              description: "Extrai os dados estruturados de notas de corte.",
              parameters: jsonSchema, // Usando o schema de notas de corte
            },
          ],
        },
      ],
      safetySettings: [
        // Configurações de segurança da sua referência
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE",
        },
      ],
    });
    console.timeEnd("Processamento de Conteúdo Gemini");
    console.log("Resposta recebida. Processando JSON...");

    const response = result;

    // Lógica de tratamento de erro de resposta vazia (da sua referência)
    if (
      !response ||
      !response.candidates ||
      response.candidates.length === 0
    ) {
      console.error(
        "FALHA CRÍTICA: A resposta da API não contém 'candidates' ou o array está vazio."
      );
      const logContent = `A resposta da API foi recebida, mas estava vazia ou foi bloqueada.\n\n--- Resposta Bruta Completa (Necessária para Diagnóstico) ---\n${JSON.stringify(
        result,
        null,
        2
      )}`;
      try {
        const logsDir = path.join(process.cwd(), "Erros");
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/:/g, "-");
        const logFilePath = path.join(
          logsDir,
          `erro_resposta_notas_${timestamp}.txt`
        );
        fs.writeFileSync(logFilePath, logContent, "utf-8");
        console.error(`>>> Detalhes da falha salvos em: ${logFilePath}`);
      } catch (fileError) {
        console.error(
          "ERRO ADICIONAL: Não foi possível escrever o arquivo de log. Verifique as permissões da pasta.",
          fileError.message
        );
      }
      return;
    }

    // --- INÍCIO DA CORREÇÃO 1: Extração robusta do JSON ---
    const responseParts = response.candidates[0].content.parts;
    let jsonData;

    try {
      if (responseParts && responseParts[0] && responseParts[0].functionCall) {
        const args = responseParts[0].functionCall.args;

        // Verificamos se 'args' é uma string. Se for, fazemos o parse.
        if (typeof args === "string") {
          jsonData = JSON.parse(args);
          console.log("JSON extraído via functionCall (string parseada).");
        } else {
          jsonData = args; // Já é um objeto
          console.log("JSON extraído via functionCall (objeto direto).");
        }
      } else {
        console.warn(
          "WARN: A resposta não veio como functionCall. Tentando extrair do texto (fallback)."
        );
        const responseTextContent = responseParts[0]?.text || "";
        const match = responseTextContent.match(/\{[\s\S]*\}/);
        if (match && match[0]) {
          jsonData = JSON.parse(match[0]);
          console.log("JSON extraído diretamente do texto (fallback bem-sucedido).");
        } else {
          throw new Error(
            "Nenhum objeto JSON ou functionCall encontrado na resposta."
          );
        }
      }
    } catch (e) {
      // Lógica de log de erro de parse (da sua referência)
      console.error(
        "FALHA CRÍTICA: Não foi possível processar o JSON da resposta.",
        e.message
      );

      const logsDir = path.join(process.cwd(), "Erros");
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/:/g, "-");
      const logFilePath = path.join(
        logsDir,
        `erro_json_notas_${timestamp}.txt`
      );
      const logContent = `Falha ao processar o JSON (Notas de Corte) recebido da API.\n\nMensagem de Erro: ${
        e.message
      }\n\n--- Resposta Bruta ---\n${JSON.stringify(response, null, 2)}`;
      fs.writeFileSync(logFilePath, logContent, "utf-8");

      console.error(
        `>>> A resposta bruta que causou o erro foi salva em: ${logFilePath}`
      );
      return;
    }
    // --- FIM DA CORREÇÃO 1 ---


    // --- INÍCIO DA CORREÇÃO 2: Salvamento na pasta correta ---
    try {
      // Obter os dados para os caminhos
      const sigla = jsonData.siglaUniversidade || 'UNIVERSIDADE';
      const ano = jsonData.ano || 'ANO';
      const vestibular = jsonData.nomeVestibular || 'VESTIBULAR';
      
      // Converter o ano para string (útil para o nome do ARQUIVO)
      const anoStr = String(ano);

      // Slug da PASTA baseado na SIGLA
      const vestibularSlug = sigla.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[^a-z0-9\s-]/gi, '') // Remove caracteres não alfanuméricos
        .replace(/[\s_]+/g, '-');      // Substitui espaços
      
      // Caminho do diretório (ex: /Resultados/fuvest)
      const targetDirectory = path.join(process.cwd(), "Resultados", vestibularSlug);

      // Garantir que o caminho completo exista
      if (!fs.existsSync(targetDirectory)) {
          fs.mkdirSync(targetDirectory, { recursive: true });
      }

      // Nome do ARQUIVO
      const safeSigla = sigla.replace(/[^a-z0-9]/gi, '_');
      const safeVestibular = vestibular.replace(/[^a-z0-9]/gi, '_');
      
      // Adiciona "_local" para diferenciar dos processados por URL
      const fileName = `${safeSigla}_${safeVestibular}_${anoStr}_local.json`;

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
    // --- FIM DA CORREÇÃO 2 ---

  } catch (error) {
    console.error("Ocorreu um erro inesperado na função main:", error);
  }
}

// Executa o script
main();