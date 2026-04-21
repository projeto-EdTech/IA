/**
 * Formata as alternativas de um objeto JSON contendo questões,
 * garantindo que strings como "(A) Texto" virem {"letra": "A", "texto": "Texto"}
 */
export function formatarAlternativas(data) {
  if (data.questoes && Array.isArray(data.questoes)) {
    for (const questao of data.questoes) {
      const alternativas = questao.alternativas;

      if (Array.isArray(alternativas)) {
        const novas = [];
        for (const alt of alternativas) {
          if (typeof alt === "string") {
            const altMatch = alt.match(/^\(?([A-E])\)?\s*[)\-]?\s*(.*)/i);
            if (altMatch) {
              const letra = altMatch[1].toUpperCase();
              const texto = altMatch[2].trim();
              novas.push({
                letra: letra,
                texto: texto,
              });
            }
          } else {
            // Caso já seja um objeto, apenas mantém
            novas.push(alt);
          }
        }
        // Substituindo as alternativas pela versão formatada (lista de objetos)
        questao.alternativas = novas;
      }
    }
  }
  return data;
}
