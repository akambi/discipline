const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function extractTask(content, profilsActifs) {
  const prompt = `Tu es un assistant de coaching comportemental. Voici une tâche capturée vocalement : "${content}"
Voici les profils d'objectif actifs de l'utilisateur :
${JSON.stringify(profilsActifs, null, 2)}
Pour chaque profil, les règles non-négociables sont listées.

Réponds UNIQUEMENT en JSON :
{
  "category": "admin|revenu|projet|personnel",
  "deadline": "YYYY-MM-DD ou null",
  "profilLie": "profilId ou null",
  "nonNegociableLie": "texte exact de la règle concernée ou null"
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: 'Tu es un assistant de coaching comportemental. Réponds uniquement en JSON valide, sans markdown, sans explication.',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Réponse Claude invalide : ${text}`);
  return JSON.parse(match[0]);
}

module.exports = { extractTask };
