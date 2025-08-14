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

      // Verifica se o JSON tem a estrutura esperada
      if (!data.questoes || !Array.isArray(data.questoes)) {
        console.warn(`Arquivo ${file} não tem a estrutura esperada (chave 'questoes' não encontrada ou não é um array). Pulando.`);
        return;
      }

      // Constrói a saída no formato createQuestion
      const output = data.questoes.map(q => {
        // Extrair textos adicionais (Texto 1, Texto 2...) do enunciado
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

        // Texto principal = enunciado sem os "Texto X"
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

      // Salva a saída
      fs.writeFileSync(outputFilePath, output, 'utf8');
      console.log(`Arquivo convertido: ${outputFileName}`);

    } catch (parseError) {
      console.error(`Erro ao processar o arquivo ${file}:`, parseError.message);
    }
  });

  console.log('\nConversão de todos os arquivos concluída!');
});