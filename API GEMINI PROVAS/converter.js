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
 * Função aprimorada para formatar fórmulas para LaTeX, segura para JSON.
 * A chave é "escapar" as barras invertidas para que elas sobrevivam ao JSON.stringify.
 * @param {string} texto O conteúdo a ser formatado.
 * @returns {string} O conteúdo com as fórmulas formatadas para LaTeX.
 */
function formatarFormulasLatex(texto) {
  // ADICIONE AQUI NOVAS REGRAS PARA CORRIGIR ERROS FUTUROS
  const substituicoes = [
    // --- Regra para escapar barras invertidas existentes (importante rodar primeiro) ---
    // Se o texto já tiver um \theta, garante que ele vire \\theta
    [/\\(theta|frac|sin|vec|cdot|rightarrow|le|Delta)/g, '\\\\$1'],
    
    // --- Notação Científica --- Ex: 1,0 x 10^-8  ->  $1,0 \times 10^{-8}$
    // Nota: A substituição agora usa \\ para escapar a barra invertida do \times.
    [/(\d[\d,.]*)\s*[x×]\s*10\^?(-?\d+)/g, '$$1 \\times 10^{$2}$'],

    // --- Equações Químicas (Ex: 2H2 + O2 -> 2H2O) ---
    // A função de callback agora insere \\rightarrow e formata subscritos
    [/([A-Z0-9\s()+]+?)\s*->\s*([A-Z0-9\s+()]+)/g, (match, reagentes, produtos) => {
      const formatarLado = (lado) => lado.trim().replace(/\b([A-Za-z]+)(\d+)/g, '$1_{$2}');
      const eq = `${formatarLado(reagentes)} \\rightarrow ${formatarLado(produtos)}`;
      return `$$${eq}$$`;
    }],

    // --- Símbolos e Variáveis (Ex: heta, theta_L, sen theta_L = n2/n1) ---
    // Regra corrigida para 'heta' e outros símbolos
    [/\b(lambda|theta|heta|alpha|pi)\b/g, (match) => {
      const comandoCorreto = (match === 'heta') ? 'theta' : match;
      return `$\\${comandoCorreto}$`;
    }],
    // Regra para frações (Ex: n2/n1)
    [/\b(\w+)\/(\w+)\b/g, '$\\frac{$1}{$2}$'],
    
    // --- Demais regras do seu script original ---
    [/\bDelta_L\b/g, '$\\Delta L$'],
    [/<=/g, '$\\le$'],
    [/\b([A-Z][a-z]?)(\d+)/g, '$1_{$2}'],
    [/\b(Li|Na)\+/g, '$1^+$'],
    [/\b([A-Za-z]+)(\d+)\b/g, '$1_{$2}'],
    [/(\w+)\^(\d+)\b/g, '$1^{$2}$'],
  ];

  let textoFormatado = texto;
  for (const [padrao, substituicao] of substituicoes) {
    textoFormatado = textoFormatado.replace(padrao, substituicao);
  }

  // Etapa final: Escapar todas as barras para a string JS final
  // Transforma `$\theta$` em `$\\theta$` para que o JS leia corretamente.
  // Esta é uma garantia extra.
  return textoFormatado.replace(/\\/g, '\\\\');
}


/**
 * NOVA FUNÇÃO: Processa um único objeto de questão e retorna a string formatada.
 * @param {object} q - O objeto da questão do JSON.
 * @param {object} data - Os dados gerais da prova (nome, ano).
 * @returns {string} A string formatada `createQuestion({...})`.
 */
function processarQuestao(q, data) {
  // 1. Extrai o enunciado principal e os sub-itens
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

  // 2. Aplica a formatação LaTeX APENAS no texto do enunciado
  principal = formatarFormulasLatex(principal);
  // Você também pode aplicar nos subItens se necessário
  // subItens.forEach(item => item.conteudo = formatarFormulasLatex(item.conteudo));

  // 3. Monta a string de saída, usando JSON.stringify para segurança
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


// --- FLUXO PRINCIPAL (MAIS LIMPO) ---
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

      // Mapeia cada questão usando a nova função de processamento
      const outputFinal = data.questoes.map(q => processarQuestao(q, data)).join('\n\n');

      fs.writeFileSync(outputFilePath, outputFinal, 'utf8');
      console.log(`Arquivo convertido e formatado: ${outputFileName}`);

    } catch (parseError) {
      console.error(`Erro ao processar o arquivo ${file}:`, parseError.message);
    }
  });

  console.log('\nConversão e formatação de todos os arquivos concluída!');
});