import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Recriando __dirname para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Diretórios de entrada e saída
const inputDir = path.join(__dirname, 'Resultados');
const outputDir = path.join(__dirname, 'Saida_Convertida');

// Cria o diretório de saída se ele não existir
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Função para converter letra da alternativa em índice (A=0, B=1...)
function letraParaIndice(letra) {
  if (!letra) return null;
  const map = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4 };
  return map[letra.toUpperCase()] ?? null;
}

/**
 * Função que replica a lógica do script Python para formatar fórmulas para LaTeX.
 * Aplica uma série de substituições baseadas em regex.
 * @param {string} texto O conteúdo a ser formatado.
 * @returns {string} O conteúdo com as fórmulas formatadas.
 */
function formatarFormulasLatex(texto) {
  // Dicionário de regras de substituição: [padrão_regex, substituição_latex]
  // A ordem é importante: das mais específicas para as mais gerais.
  const substituicoes = [
    // --- Notação Científica --- Ex: 1,0 x 10^-8  ->  $1,0 \times 10^{-8}$
    [/(\d[\d,.]*)\s*[x×]\s*10\^?(-?\d+)/g, '$$1 \\times 10^{$2}$'],

    // --- Equações Químicas completas --- Ex: CH4 + 2O2 -> CO2 + 2H2O
    // Usamos uma função de callback para processamento mais complexo
    [/([A-Z0-9\s()]+)\s*->\s*([A-Z0-9\s+()]+)/g, (match) => {
      let eq = match.replace(/->/g, '\\rightarrow');
      eq = eq.replace(/([A-Za-z])(\d+)/g, '$1_{$2}'); // Adiciona subscrito
      return `$$${eq}$$`;
    }],

    // --- Símbolos e Variáveis Específicas ---
    [/\b(lambda|theta|heta|alpha|pi)\b/g,(match) => {
        const comandoCorreto = (match === 'heta') ? 'theta' : match;
        return `$\\${comandoCorreto}$`;
      }
    ],
    [/\bDelta_L\b/g, '$\\Delta L$'],
    [/<=/g, '\\le'],

    // --- Fórmulas Químicas (ex: H2O, CO2, NaHCO3) ---
    [/\b([A-Z][a-z]*)(\d+)([A-Z]*)(\d*)\b/g, '$$1_{$2}$3_{$4}$'],
    [/\b([A-Z])(\d+)\b/g, '$$1_{$2}$'],

    // --- Íons (ex: Li+, Na+) ---
    [/\b(Li|Na)\+/g, '$$1^+$'],

    // --- Variáveis com números (ex: a1, T0, Vco2) ---
    [/\b([A-Za-z]+)(\d+)\b/g, '$$1_{$2}$'],

    // --- Funções com expoentes (ex: x^2, 1s^2) ---
    [/(\w+)\^(\d+)\b/g, '$$1^{$2}$'],
  ];

  let textoFormatado = texto;
  // Aplica cada regra de substituição
  for (const [padrao, substituicao] of substituicoes) {
    textoFormatado = textoFormatado.replace(padrao, substituicao);
  }

  return textoFormatado;
}


// Lê todos os arquivos do diretório de entrada
fs.readdir(inputDir, (err, files) => {
  if (err) {
    return console.error('Não foi possível ler o diretório:', err);
  }

  // Filtra apenas por arquivos .json
  files.filter(file => path.extname(file) === '.json').forEach(file => {
    const inputFilePath = path.join(inputDir, file);
    const outputFileName = path.basename(file, '.json') + '.js';
    const outputFilePath = path.join(outputDir, outputFileName);

    try {
      // Lê o arquivo JSON original
      const data = JSON.parse(fs.readFileSync(inputFilePath, 'utf8'));

      if (!data.questoes || !Array.isArray(data.questoes)) {
        console.warn(`Arquivo ${file} não tem a estrutura esperada. Pulando.`);
        return;
      }

      // 1. CONSTRÓI A SAÍDA no formato createQuestion
      const outputInicial = data.questoes.map(q => {
        const subItens = [];
        const regex = /(Texto\s+\d+)([\s\S]*?)(?=Texto\s+\d+|$)/gi;
        let match;
        const enunciadoLimpo = q.enunciado || '';
        while ((match = regex.exec(enunciadoLimpo)) !== null) {
          subItens.push({
            titulo: match[1].trim(),
            conteudo: match[2].trim()
          });
        }
        const principal = enunciadoLimpo.replace(/Texto\s+\d+[\s\S]*?(?=Texto\s+\d+|$)/gi, '').trim();

        return `createQuestion({
    id: ${q.numeroEnunciado},
    university: "${data.nomeProva}",
    year: ${data.ano},
    text: {
      principal: ${JSON.stringify(principal)},
      subItens: ${JSON.stringify(subItens)}
    },
    options: ${JSON.stringify((q.alternativas || []).map(a => a.texto))},
    correctAnswer: ${letraParaIndice(q.opcaoCorreta)},
    materia: "${(q.conteudo && q.conteudo[0]) || ''}",
    conteudo: "${(q.conteudo && q.conteudo[1]) || ''}",
    imageNames: []
  }),`;
      }).join('\n\n');

      // 2. APLICA A FORMATAÇÃO LATEX na saída gerada
      console.log(`Formatando fórmulas LaTeX para ${outputFileName}...`);
      const outputFinalFormatado = formatarFormulasLatex(outputInicial);

      // 3. SALVA A SAÍDA final formatada
      fs.writeFileSync(outputFilePath, outputFinalFormatado, 'utf8');
      console.log(`Arquivo convertido e formatado: ${outputFileName}`);

    } catch (parseError) {
      console.error(`Erro ao processar o arquivo ${file}:`, parseError.message);
    }
  });

  console.log('\nConversão e formatação de todos os arquivos concluída!');
});