const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function computeSignaux(profilDominant, profilSecondaire, tasksActives) {
  const secondaireBlock = profilSecondaire
    ? `- Objectif secondaire (priorité 2) : ${JSON.stringify(profilSecondaire)}`
    : '- Pas d\'objectif secondaire actif';

  const prompt = `Tu es un coach de priorisation comportementale. L'utilisateur a les objectifs actifs suivants :
- Objectif dominant (priorité 1) : ${JSON.stringify(profilDominant)}
${secondaireBlock}

Règles de priorisation :
1. Les tâches liées à un non-négociable du profil dominant passent en premier
2. Les tâches avec une deadline dans les 48h suivantes montent automatiquement
3. Les tâches liées à un non-négociable du profil secondaire viennent ensuite
4. Les tâches admin sans lien direct avec un profil sont déprioritisées sauf deadline imminente

Sélectionne les 3 tâches les plus importantes pour demain.
Pour chaque tâche, attribue un signal :
- critique : lié à non-négociable dominant OU deadline < 48h
- important : lié à non-négociable secondaire OU impact financier élevé
- opportunite : action rapide à fort levier, pas urgente

Réponds UNIQUEMENT en JSON (tableau de 3 éléments) :
[
  {
    "taskId": "...",
    "content": "...",
    "signal": "critique|important|opportunite",
    "raison": "...",
    "profilLie": "...",
    "nonNegociableLie": "..."
  }
]

Tâches actives : ${JSON.stringify(tasksActives)}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'Tu es un coach de priorisation comportementale. Réponds uniquement en JSON valide, sans markdown, sans explication.',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`Réponse Claude invalide : ${text}`);
  const signaux = JSON.parse(match[0]);
  return signaux.slice(0, 3);
}

module.exports = { computeSignaux };
