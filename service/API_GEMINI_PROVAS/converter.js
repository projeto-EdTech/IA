// Importa os módulos essenciais do Node.js usando a sintaxe ES Modules
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- CONFIGURAÇÃO DAS PASTAS ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const inputDir = path.join(__dirname, 'Resultados_JSON');
const outputDir = path.join(__dirname, 'Saida_JS');


// ==================================================================================
//                            LÓGICA DE FORMATAÇÃO LATEX
// ==================================================================================

/**
 * Prepara uma string para ser usada em um template literal de JS,
 * preservando a sintaxe Markdown e LaTeX (KaTeX).
 * @param {string} text - O texto a ser preparado.
 * @returns {string} - A string formatada.
 */
function prepareForMarkdown(text) {
    if (typeof text !== 'string') {
        return "";
    }
    // Garante a formatação LaTeX antes de escapar os caracteres
    const latexFormattedText = formatLatexExpressions(text);

    // Escapa caracteres para a string JS, preservando barras para LaTeX e novas linhas para Markdown
    return latexFormattedText
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');
}

/**
 * Função principal que analisa e formata o texto para LaTeX de forma robusta.
 * Ela "tokeniza" a string e envolve cada termo matemático individualmente.
 * @param {string} text - O texto bruto.
 * @returns {string} - O texto com expressões LaTeX devidamente formatadas.
 */
function formatLatexExpressions(text) {
    if (!text) return "";

    // Mapeamento de palavras-chave para seus equivalentes LaTeX
    const keywords = {
        'alpha': '\\alpha', 'beta': '\\beta', 'gamma': '\\gamma', 'delta': '\\delta',
        'epsilon': '\\epsilon', 'zeta': '\\zeta', 'eta': '\\eta', 'theta': '\\theta',
        'iota': '\\iota', 'kappa': '\\kappa', 'lambda': '\\lambda', 'mu': '\\mu',
        'nu': '\\nu', 'xi': '\\xi', 'pi': '\\pi', 'rho': '\\rho', 'sigma': '\\sigma',
        'tau': '\\tau', 'upsilon': '\\upsilon', 'phi': '\\phi', 'chi': '\\chi',
        'psi': '\\psi', 'omega': '\\omega',
        'sen': '\\sin', 'cos': '\\cos', 'tg': '\\tan', 'cotg': '\\cot', 'log': '\\log',
    };

    // Regex para identificar se um token (palavra) é um termo matemático potencial
    const mathTermRegex = new RegExp(
        `^(${Object.keys(keywords).join('|')})$|` + // Palavras-chave exatas
        `^[a-zA-Z0-9]+_[a-zA-Z0-9_]+$|` +        // Subscrito (ex: theta_L, v_0)
        `^[a-zA-Z0-9]+\\^[a-zA-Z0-9_]+$|` +       // Sobrescrito (ex: x^2)
        `^\\w+/\\w+$|` +                         // Divisão (ex: n2/n1)
        `^\\\\[a-zA-Z]+$`,                       // Comandos LaTeX (ex: \sqrt)
    'i');
    
    // Divide o texto em palavras e o que não for palavra (espaços, pontuação), mantendo tudo
    const tokens = text.split(/([a-zA-Z0-9_\\^/]+)/).filter(Boolean);
    
    const result = tokens.map(token => {
        const trimmedToken = token.trim();
        if (mathTermRegex.test(trimmedToken)) {
             // *** INÍCIO DA CORREÇÃO ***
            // Primeiro, verifica se a palavra-chave existe no token.
            // Ex: Em "theta_L", a palavra-chave é "theta".
            const keywordMatch = trimmedToken.match(new RegExp(`^(${Object.keys(keywords).join('|')})`, 'i'));
            let latexToken = trimmedToken;

            if (keywordMatch) {
                const keyword = keywordMatch[0];
                const restOfToken = trimmedToken.substring(keyword.length); // Pega o resto, ex: "_L"
                latexToken = keywords[keyword.toLowerCase()] + restOfToken; // Junta: \theta + _L = \theta_L
            }
            // *** FIM DA CORREÇÃO ***
            
            return `$${latexToken}$`;
        }
        // Se não for um termo matemático, retorna o token original (pode ser espaço, palavra, pontuação)
        return token;
    });

    return result.join('');
}


// ==================================================================================
//                       CONVERSOR PRINCIPAL (SEM ALTERAÇÕES)
// ==================================================================================

function convertJsonToScript(jsonData) {
    const provaData = jsonData.prova || jsonData;

    if (!provaData || !Array.isArray(provaData.questoes)) {
        return '';
    }

    const questoesValidas = provaData.questoes.filter(questao => questao.opcaoCorreta !== null);

    const scriptBlocks = questoesValidas.map(questao => {
        const correctAnswerIndex = (questao.opcaoCorreta?.toString().toUpperCase().charCodeAt(0) ?? 65) - 65;
        
        let options;
        if (Array.isArray(questao.alternativas) && questao.alternativas.length > 0) {
            options = questao.alternativas
                .map(alt => `"${prepareForMarkdown(alt.texto)}"`)
                .join(',\n      ');
        } else {
            options = '"A",\n      "B",\n      "C",\n      "D",\n      "E"';
        }
        
        const materias = new Set();
        const conteudos = [];

        if (Array.isArray(questao.conteudo)) {
            questao.conteudo.forEach(item => {
                if(typeof item === 'string'){
                    const parts = item.split(' – ').map(s => s.trim());
                    const materia = parts[0];
                    const conteudoEspecifico = parts[1];

                    if (materia) materias.add(materia);
                    if (conteudoEspecifico) conteudos.push(conteudoEspecifico);
                }
            });
        }
        
        const materiaFinal = `[${Array.from(materias).map(m => `"${prepareForMarkdown(m)}"`).join(', ')}]`;
        const conteudoFinal = `[${conteudos.map(c => `"${prepareForMarkdown(c)}"`).join(', ')}]`;
        
        return `createQuestion({
    id: ${questao.numeroEnunciado || 0},
    university: "${prepareForMarkdown(provaData.siglaUniversidade).toLowerCase()}",
    year: ${provaData.ano},
    text: {
      principal: "${prepareForMarkdown(questao.enunciado)}",
      subItens: []
    },
    options: [
      ${options}
    ],
    correctAnswer: ${correctAnswerIndex >= 0 ? correctAnswerIndex : 0},
    materia: ${materiaFinal},
    conteudo: ${conteudoFinal},
    imageNames: ${JSON.stringify(questao.imageNames || [])}
})`;
    });

    return scriptBlocks.join(',\n\n');
}

// --- FUNÇÃO PRINCIPAL (MAIN) ---
function processFiles() {
    console.log('Iniciando o processo de conversão...');
    
    let files;
    try {
        files = fs.readdirSync(inputDir);
    } catch (error) {
        console.error(`\x1b[31m[ERRO] Não foi possível ler a pasta de entrada: ${inputDir}\x1b[0m`);
        return;
    }

    const jsonFiles = files.filter(file => path.extname(file).toLowerCase() === '.json');

    if (jsonFiles.length === 0) {
        console.warn('\x1b[33m[AVISO] Nenhum arquivo .json encontrado na pasta "Resultados_JSON".\x1b[0m');
        return;
    }

    let filesConverted = 0;

    jsonFiles.forEach(fileName => {
        const inputFilePath = path.join(inputDir, fileName);
        
        try {
            const fileContent = fs.readFileSync(inputFilePath, 'utf8');
            const jsonData = JSON.parse(fileContent);

            const provaData = jsonData.prova || jsonData;
            const universityName = provaData.siglaUniversidade ? provaData.siglaUniversidade.toLowerCase() : 'outros';
            const universityOutputDir = path.join(outputDir, universityName);
            const outputFileName = `${path.basename(fileName, '.json')}.js`;
            const outputFilePath = path.join(universityOutputDir, outputFileName);
            
            if (fs.existsSync(outputFilePath)) {
                return; 
            }
            
            if (!fs.existsSync(universityOutputDir)) {
                fs.mkdirSync(universityOutputDir, { recursive: true });
            }

            filesConverted++;
            console.log(`\nProcessando novo arquivo: ${fileName}`);

            const scriptContent = convertJsonToScript(jsonData);

            if (scriptContent) {
                fs.writeFileSync(outputFilePath, scriptContent, 'utf8');
                console.log(`\x1b[32m[SUCESSO] Arquivo convertido salvo em: ${outputFilePath}\x1b[0m`);
            } else {
                 console.warn(`\x1b[33m[AVISO] Nenhum conteúdo gerado para o arquivo ${fileName}. O arquivo pode conter apenas questões anuladas ou estar mal formatado.\x1b[0m`);
            }

        } catch (error) {
            if (error instanceof SyntaxError) {
                console.error(`\x1b[31m[ERRO] O arquivo ${fileName} contém um JSON inválido e não pôde ser processado.\x1b[0m`);
            } else {
                console.error(`\x1b[31m[ERRO] Falha ao processar o arquivo ${fileName}: ${error.message}\x1b[0m`);
            }
        }
    });

    if (filesConverted > 0) {
        console.log(`\nProcesso de conversão concluído! ${filesConverted} arquivo(s) novo(s) convertido(s).`);
    } else {
        console.log('\x1b[36m[INFO] Nenhum arquivo novo para converter. A pasta de saída já está atualizada.\x1b[0m');
    }
}

// Inicia a execução da função principal
processFiles();