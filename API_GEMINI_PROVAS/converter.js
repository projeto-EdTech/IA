// Importa os módulos essenciais do Node.js usando a sintaxe ES Modules
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- CONFIGURAÇÃO DAS PASTAS ---
// Em ES Modules, __dirname não existe. Esta é a forma correta de obter o diretório atual.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define os caminhos relativos para as pastas de entrada e saída.
const inputDir = path.join(__dirname, 'Resultados_JSON');
const outputDir = path.join(__dirname, 'Saida_JS');

/**
 * Escapa caracteres especiais em uma string para que ela seja válida dentro
 * de uma string JavaScript.
 * @param {string} text - O texto a ser escapado.
 * @returns {string} - A string com os caracteres escapados.
 */
function escapeString(text) {
    if (typeof text !== 'string') {
        return "";
    }
    // Substitui barras invertidas, aspas duplas e caracteres de nova linha/tabulação
    return text
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
}

/**
 * Converte o conteúdo de um objeto JSON para o formato de script desejado.
 * @param {object} jsonData - O objeto JavaScript parseado do arquivo JSON.
 * @returns {string} - Uma string contendo todas as chamadas `createQuestion` formatadas.
 */
function convertJsonToScript(jsonData) {
    if (!jsonData || !Array.isArray(jsonData.questoes)) {
        return '';
    }

    const questoesValidas = jsonData.questoes.filter(questao => questao.opcaoCorreta !== null);

    const scriptBlocks = questoesValidas.map(questao => {
        const correctAnswerIndex = questao.opcaoCorreta.toString().toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
        
        let options;
        if (Array.isArray(questao.alternativas) && questao.alternativas.length > 0) {
            options = questao.alternativas
                .map(alt => `"${escapeString(alt.texto)}"`)
                .join(',\n      ');
        } else {
            options = '"A",\n      "B",\n      "C",\n      "D",\n      "E"';
        }
        
        const materias = new Set();
        const conteudos = [];

        if (Array.isArray(questao.conteudo)) {
            questao.conteudo.forEach(item => {
                const parts = item.split(' – ').map(s => s.trim());
                const materia = parts[0];
                const conteudoEspecifico = parts[1];

                if (materia) {
                    materias.add(materia);
                }
                if (conteudoEspecifico) {
                    conteudos.push(conteudoEspecifico);
                }
            });
        }
        
        // *** INÍCIO DA SOLUÇÃO ***
        // Formata tanto a matéria quanto o conteúdo como arrays de strings
        const materiaFinal = `[${Array.from(materias).map(m => `"${escapeString(m)}"`).join(', ')}]`;
        const conteudoFinal = `[${conteudos.map(c => `"${escapeString(c)}"`).join(', ')}]`;
        // *** FIM DA SOLUÇÃO ***

        return `createQuestion({
    id: ${questao.numeroEnunciado || 0},
    university: "${escapeString(jsonData.siglaUniversidade).toLowerCase()}",
    year: ${jsonData.ano},
    text: {
      principal: "${escapeString(questao.enunciado)}",
      subItens: []
    },
    options: [
      ${options}
    ],
    correctAnswer: ${correctAnswerIndex},
    materia: ${materiaFinal},
    conteudo: ${conteudoFinal},
    imageNames: []
})`;
    });

    return scriptBlocks.join(',\n\n');
}


// --- FUNÇÃO PRINCIPAL (MAIN) ---
function processFiles() {
    console.log('Iniciando o processo de conversão...');
    console.log('Verificando arquivos que precisam ser convertidos...');
    
    let files;
    try {
        files = fs.readdirSync(inputDir);
    } catch (error) {
        console.error(`\x1b[31m[ERRO] Não foi possível ler a pasta de entrada: ${inputDir}\x1b[0m`);
        console.error('Verifique se a pasta "Resultados_JSON" existe no mesmo local do script.');
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

            const universityName = jsonData.siglaUniversidade ? jsonData.siglaUniversidade.toLowerCase() : 'outros';
            const universityOutputDir = path.join(outputDir, universityName);

            const outputFileName = `${path.basename(fileName, '.json')}.js`;
            const outputFilePath = path.join(universityOutputDir, outputFileName);
            
            if (fs.existsSync(outputFilePath)) {
                return; 
            }
            
            if (!fs.existsSync(universityOutputDir)) {
                fs.mkdirSync(universityOutputDir, { recursive: true });
                console.log(`\x1b[34m[INFO] Subpasta criada em: ${universityOutputDir}\x1b[0m`);
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

    if (filesConverted === 0) {
        console.log('\x1b[36m[INFO] Nenhum arquivo novo para converter. A pasta de saída já está atualizada.\x1b[0m');
    } else {
        console.log(`\nProcesso de conversão concluído! ${filesConverted} arquivo(s) novo(s) convertido(s).`);
    }
}

// Inicia a execução da função principal
processFiles();