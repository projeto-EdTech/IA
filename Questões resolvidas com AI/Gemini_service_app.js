import 'dotenv/config';
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Exemplo de enunciado e gabarito
const ENUNCIADO = "Um fio condutor é percorrido por cerca de 2.10-14 C a cada microssegundo (10-6 s). Determine a intensidade da corrente que percorre o condutor";
const GABARITO = "2.10-8 A";

const prompt = `
Você receberá uma questão de vestibular com o enunciado e a alternativa correta já conhecida.
Sua tarefa é explicar, de forma **clara, objetiva e didática**, o raciocínio necessário para chegar até a alternativa correta. Não analise ou mencione as outras alternativas.
Adapte o estilo da explicação conforme a natureza da questão:
- Se for uma questão de **exatas** (Matemática, Física, Química), use fórmulas e mostre o passo a passo dos cálculos.
- Se for uma questão de **biológicas ou humanas** (História, Biologia, Geografia, Filosofia), explique com base nos conceitos teóricos e contexto histórico ou científico.
- Seja direto, mas sempre **ensine o raciocínio** como se estivesse explicando para um aluno que quer aprender o conteúdo, e não apenas a resposta final.

Formato de entrada:
- **Enunciado:** ${ENUNCIADO}
- **Alternativa correta:** ${GABARITO}

Comece sua resposta com:
**"Para chegar à alternativa correta, devemos..."**

`;

async function main() {
  const response = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  for await (const chunk of response) {
    console.log(chunk.text);
  }
}

await main();