import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Recriando __dirname para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Diretórios de entrada e saída
const inputDir = path.join(__dirname, 'Resultados');
const outputDir = path.join(__dirname, 'Saida_Convertida');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

function letraParaIndice(letra) {
  if (!letra) return null;
  const map = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4 };
  return map[letra.toUpperCase()] ?? null;
}

/**
 * VERSÃO CORRIGIDA E ROBUSTA DA FUNÇÃO DE FORMATAÇÃO
 * @param {string} texto O conteúdo a ser formatado.
 * @returns {string} O conteúdo com as fórmulas formatadas para LaTeX.
 */
function formatarFormulasLatex(texto) {
  let textoFormatado = texto;

  // As regras agora são aplicadas em uma ordem lógica para evitar conflitos.
  // A dupla barra (\\) é adicionada DIRETAMENTE na substituição.
  const substituicoes = [
    // ETAPA 1: Lidar com as estruturas mais complexas primeiro.
    // Ex: "sen theta_L = n2/n1" -> "$\\sin \\theta_L = \\frac{n_{2}}{n_{1}}$"
    [/\bsen\s+theta_L\s*=\s*([a-zA-Z])(\d+)\/([a-zA-Z])(\d+)/g, '$\\sin \\theta_L = \\frac{$1_{$2}}{$3_{$4}}$'],

    // ETAPA 2: Lidar com frações simples que não foram pegas na regra acima.
    // Ex: "n2/n1" -> "$\\frac{n_{2}}{n_{1}}$"
    [/([a-zA-Z])(\d+)\/([a-zA-Z])(\d+)/g, '$\\frac{$1_{$2}}{$3_{$4}}$'],

    // ETAPA 3: Lidar com símbolos e variáveis que podem ter subscritos.
    // Ex: "theta_L" -> "$\\theta_L$"
    [/\btheta_L\b/g, '$\\theta_L$'],
    // Ex: "n2" -> "$n_{2}$", "H2O" -> "$H_{2}O$"
    [/\b([a-zA-Z]+)(\d+)\b/g, '$$$1_{$2}$'],

    // ETAPA 4: Lidar com símbolos simples que sobraram.
    // Ex: "heta" ou "theta" -> "$\\theta$"
    [/\b(theta|heta)\b/g, '$\\theta$'],
    [/\bsen\b/g, '$\\sin$'], // Para casos onde "sen" aparece sozinho
    
    // ETAPA 5: Limpeza de artefatos, como delimitadores duplicados ou adjacentes.
    // Ex: "$ $\\sin$ $" -> "$ \\sin $"
    [/\$\s*\$/g, ' '],
  ];

  for (const [padrao, substituicao] of substituicoes) {
    textoFormatado = textoFormatado.replace(padrao, substituicao);
  }

  // A etapa final de escape global foi removida por ser insegura.
  // A dupla barra já foi adicionada onde era necessária.
  return textoFormatado;
}


function processarQuestao(q, data) {
  const subItens = [];
  const regex = /(Texto\s+\d+)([\s\S]*?)(?=Texto\s+\d+|$)/gi;
  let match;
  const enunciadoOriginal = q.enunciado || '';
  while ((match = regex.exec(enunciadoOriginal)) !== null) {
    subItens.push({
      titulo: match[1].trim(),
      conteudo: match[2].trim()
    });
  }
  let principal = enunciadoOriginal.replace(regex, '').trim();

  principal = formatarFormulasLatex(principal);

  const questaoFormatada = `createQuestion({
    id: ${q.numeroEnunciado},
    university: "${data.nomeProva}",
    year: ${data.ano},
    text: {
      principal: ${JSON.stringify(principal)},
      subItens: ${JSON.stringify(subItens)}
    },
    options: ${JSON.stringify((q.alternativas || []).map(a => a.texto))},
    correctAnswer: ${letraParaIndice(q.opcaoCorreta)},
    materia: "${(q.conteudo && q.conteudo[0]) ? q.conteudo[0] : ''}",
    conteudo: "${(q.conteudo && q.conteudo[1]) ? q.conteudo[1] : ''}",
    imageNames: []
  }),`;
  
  return questaoFormatada;
}

fs.readdir(inputDir, (err, files) => {
  if (err) {
    return console.error('Não foi possível ler o diretório:', err);
  }

  files.filter(file => path.extname(file) === '.json').forEach(file => {
    const inputFilePath = path.join(inputDir, file);
    const outputFileName = path.basename(file, '.json') + '.js';
    const outputFilePath = path.join(outputDir, outputFileName);

    try {
      const data = JSON.parse(fs.readFileSync(inputFilePath, 'utf8'));

      if (!data.questoes || !Array.isArray(data.questoes)) {
        console.warn(`Arquivo ${file} não tem a estrutura esperada. Pulando.`);
        return;
      }

      const outputFinal = data.questoes.map(q => processarQuestao(q, data)).join('\n\n');

      fs.writeFileSync(outputFilePath, outputFinal, 'utf8');
      console.log(`Arquivo convertido e formatado: ${outputFileName}`);

    } catch (parseError) {
      console.error(`Erro ao processar o arquivo ${file}:`, parseError.message);
    }
  });

  console.log('\nConversão e formatação de todos os arquivos concluída!');
});