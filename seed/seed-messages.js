// ============================================================
//  seed-messages.js  (v7)
//  Nouveaux placeholders stats disponibles dans les feedbacks :
//
//  {{serieActuelle}}       → ex: "tu enchaînes 5 semaines consécutives"
//  {{serieRecord}}         → ex: "ton record est de 8 semaines"
//  {{scoreMensuel}}        → score cumulé du mois
//  {{maxMensuel}}          → score max possible du mois
//  {{semValideesMois}}     → semaines validées ce mois
//  {{moisSansDecouvert}}   → compteur mois sans découvert (mode maitrise)
//  {{semainesSansCharge}}  → semaines sans nouvelle charge (mode alleg)
//  {{semainesSansRetrait}} → semaines sans retrait (mode epargne)
//  {{prenom}}              → prénom du client
//  {{typeBien}}            → type de bien
//  {{modeLabel}}           → libellé du mode actif
//  {{objectifTrimestre||fallback}} → objectif ou fallback générique
// ============================================================

const { DynamoDBClient }     = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE  = process.env.DYNAMO_MESSAGES_TABLE || 'coaching-immo-discipline-messages';
const REGION = process.env.AWS_REGION            || 'us-east-1';
const ddb    = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const ITEMS = [

  // ════════════════════════════════════════════
  //  GLOBAUX
  // ════════════════════════════════════════════
  {
    mode: 'global', type: 'onboarding_intro',
    texte: `Bienvenue dans le programme Discipline de Réussir à l'étranger. Je suis le système qui va t'aider à exécuter, rester motivé et atteindre ton objectif d'achat. Quel type de bien souhaites-tu acheter ? Maison, plex ou condo ?`,
  },
  {
    mode: 'global', type: 'onboarding_confirm',
    texte: `Parfait. Ton objectif est d'acheter {{typeBien}}. Tu commences en mode Allègement. Ton premier focus : réduire tes charges fixes. À partir de maintenant, ne casse pas le système.`,
  },
  {
    mode: 'global', type: 'repos',
    texte: `Bonjour {{prenom}}. Tu es toujours en mode {{modeLabel}}. Reste discipliné. Ne casse pas le système.`,
  },
  {
    mode: 'global', type: 'expire',
    texte: `Bonjour {{prenom}}. Ton programme de 18 mois est terminé. Félicitations pour ton parcours. Pour continuer, contacte ton coach.`,
  },

  // ════════════════════════════════════════════
  //  MODE 1 — ALLÈGEMENT
  // ════════════════════════════════════════════
  {
    mode: 'alleg', type: 'lundi',
    texte: `Bonjour {{prenom}}. Ton objectif est simple : acheter {{typeBien}}. Pour y arriver, ce trimestre, tu dois {{objectifTrimestre||dépenser moins chaque mois — logement, voiture, abonnements}}. Voici les règles non négociables : aucune nouvelle dépense fixe. Chaque dépense doit être utile, sinon tu la supprimes. Tu ne remplaces jamais ce que tu supprimes. L'argent gaspillé ne revient jamais. Ne casse pas le système. À vendredi.`,
  },
  {
    mode: 'alleg', type: 'mercredi',
    texte: `On est mercredi, {{prenom}}. Tu es toujours en mode Allègement. La question n'est pas ce que ça coûte — c'est pourquoi tu le gardes encore. Aucune nouvelle charge. Aucun remplacement. Ne casse pas le système. À vendredi.`,
  },
  {
    mode: 'alleg', type: 'vendredi_intro',
    texte: `Bilan de la semaine, {{prenom}}. Je vais te poser 3 questions simples. Réponds par oui ou par non.`,
  },
  {
    mode: 'alleg', type: 'mensuel_intro',
    texte: `Bonjour {{prenom}}, c'est l'heure des comptes mensuels. Je vais te poser 3 questions. Réponds par oui ou par non.`,
  },
  { mode: 'alleg', type: 'q1', texte: `Première question : as-tu souscrit une nouvelle charge fixe cette semaine ?`, key: 'nouvelle_charge', negatif: true },
  { mode: 'alleg', type: 'q2', texte: `Deuxième question : as-tu identifié au moins une charge à supprimer ou renégocier ?`, key: 'charge_identifiee', negatif: false },
  { mode: 'alleg', type: 'q3', texte: `Troisième question : tes charges fixes sont-elles en baisse par rapport au mois dernier ?`, key: 'charges_en_baisse', negatif: false },
  {
    mode: 'alleg', type: 'feedback_3',
    texte: `Bien joué {{prenom}}. Aucune charge ajoutée, une suppression identifiée, et la courbe descend. {{semainesSansCharge}} semaines sans nouvelle charge fixe. Score du mois : {{scoreMensuel}} sur {{maxMensuel}}. {{serieActuelle}}. Tu avances. À lundi.`,
  },
  {
    mode: 'alleg', type: 'feedback_2',
    texte: `Correct {{prenom}}. Deux points sur trois cette semaine. {{semainesSansCharge}} semaines sans nouvelle charge fixe. Score du mois : {{scoreMensuel}} sur {{maxMensuel}}. Il reste un point à corriger — identifie-le avant lundi. À lundi.`,
  },
  {
    mode: 'alleg', type: 'feedback_1',
    texte: `Semaine difficile {{prenom}}. Score du mois : {{scoreMensuel}} sur {{maxMensuel}}. Une charge ajoutée ou rien de supprimé, tu stagnes. Rappelle-toi pourquoi tu as commencé. À lundi.`,
  },

  // ════════════════════════════════════════════
  //  MODE 2 — MAÎTRISE
  // ════════════════════════════════════════════
  {
    mode: 'maitrise', type: 'lundi',
    texte: `Bonjour {{prenom}}. Ton objectif est simple : acheter {{typeBien}}. Pour y arriver, ton focus ce trimestre est de {{objectifTrimestre||reprendre le contrôle total de ton argent — chaque euro doit être décidé par toi, pas subi}}. Voici les règles non négociables : tu connais ton solde avant de dépenser. Zéro découvert, sans exception. Toute dépense non prévue attend le lendemain. Ne casse pas le système. À vendredi.`,
  },
  {
    mode: 'maitrise', type: 'mercredi',
    texte: `On est mercredi, {{prenom}}. Tu sais combien tu as en banque. Pas de découvert. Une dépense imprévue ? Tu attends demain. C'est tout. Ne casse pas le système. À vendredi.`,
  },
  {
    mode: 'maitrise', type: 'vendredi_intro',
    texte: `Bilan de la semaine, {{prenom}}. Je vais te poser 3 questions simples. Réponds par oui ou par non.`,
  },
  {
    mode: 'maitrise', type: 'mensuel_intro',
    texte: `Bonjour {{prenom}}, c'est l'heure des comptes mensuels. Je vais te poser 3 questions. Réponds par oui ou par non.`,
  },
  { mode: 'maitrise', type: 'q1', texte: `Première question : es-tu entré en découvert cette semaine ?`, key: 'decouvert', negatif: true },
  { mode: 'maitrise', type: 'q2', texte: `Deuxième question : as-tu vérifié ton solde avant chaque dépense importante ?`, key: 'solde_verifie', negatif: false },
  { mode: 'maitrise', type: 'q3', texte: `Troisième question : as-tu attendu avant de faire une dépense non prévue ?`, key: 'attente_depense', negatif: false },
  {
    mode: 'maitrise', type: 'feedback_3',
    texte: `Semaine propre {{prenom}}. Pas de découvert. Solde connu. Dépenses maîtrisées. {{moisSansDecouvert}} semaines sans découvert. Score du mois : {{scoreMensuel}} sur {{maxMensuel}}. {{serieActuelle}}. Continue. À lundi.`,
  },
  {
    mode: 'maitrise', type: 'feedback_2',
    texte: `Deux sur trois {{prenom}}. {{moisSansDecouvert}} semaines sans découvert. Score du mois : {{scoreMensuel}} sur {{maxMensuel}}. Un point a glissé — identifie-le avant lundi. À lundi.`,
  },
  {
    mode: 'maitrise', type: 'feedback_1',
    texte: `Attention {{prenom}}. Un découvert ou une dépense non maîtrisée cette semaine. Score du mois : {{scoreMensuel}} sur {{maxMensuel}}. Comprends pourquoi avant lundi. À lundi.`,
  },

  // ════════════════════════════════════════════
  //  MODE 3 — CRÉDIT
  // ════════════════════════════════════════════
  {
    mode: 'credit', type: 'lundi',
    texte: `Bonjour {{prenom}}. Ton objectif est simple : acheter {{typeBien}}. Pour y arriver, ton focus ce trimestre est de {{objectifTrimestre||remettre tes comptes en ordre — c'est ce que la banque regarde en premier}}. Voici les règles non négociables : tu rembourses tes dettes en priorité. Zéro nouveau crédit non prévu. Si un paiement est en danger, tu agis tout de suite. Protège ton historique bancaire. Ne casse pas le système. À vendredi.`,
  },
  {
    mode: 'credit', type: 'mercredi',
    texte: `On est mercredi, {{prenom}}. Remboursements en priorité. Aucun crédit impulsif. Si quelque chose cloche, tu le signales maintenant, pas après. Ne casse pas le système. À vendredi.`,
  },
  {
    mode: 'credit', type: 'vendredi_intro',
    texte: `Bilan de la semaine, {{prenom}}. Je vais te poser 3 questions simples. Réponds par oui ou par non.`,
  },
  {
    mode: 'credit', type: 'mensuel_intro',
    texte: `Bonjour {{prenom}}, c'est l'heure des comptes mensuels. Je vais te poser 3 questions. Réponds par oui ou par non.`,
  },
  { mode: 'credit', type: 'q1', texte: `Première question : tous tes remboursements ont-ils été effectués à temps cette semaine ?`, key: 'remboursements', negatif: false },
  { mode: 'credit', type: 'q2', texte: `Deuxième question : as-tu souscrit un crédit non planifié ce mois-ci ?`, key: 'nouveau_credit', negatif: true },
  { mode: 'credit', type: 'q3', texte: `Troisième question : ton taux d'endettement est-il stable ou en baisse ?`, key: 'taux_stable', negatif: false },
  {
    mode: 'credit', type: 'feedback_3',
    texte: `Ton profil est protégé {{prenom}}. Paiements à temps, aucun crédit impulsif, taux sous contrôle. Score du mois : {{scoreMensuel}} sur {{maxMensuel}}. {{serieActuelle}}. Chaque semaine comme celle-là rapproche ton dossier de l'approbation. À lundi.`,
  },
  {
    mode: 'credit', type: 'feedback_2',
    texte: `Acceptable {{prenom}}, mais en mode Crédit ça ne suffit pas. Une banque ne voit pas tes efforts — elle voit tes chiffres. Score du mois : {{scoreMensuel}} sur {{maxMensuel}}. Reprends le point manqué avant lundi. À lundi.`,
  },
  {
    mode: 'credit', type: 'feedback_1',
    texte: `Ton profil a pris un coup cette semaine {{prenom}}. Score du mois : {{scoreMensuel}} sur {{maxMensuel}}. Ça se répare avec de la constance. Commence maintenant. À lundi.`,
  },

  // ════════════════════════════════════════════
  //  MODE 4 — ÉPARGNE
  // ════════════════════════════════════════════
  {
    mode: 'epargne', type: 'lundi',
    texte: `Bonjour {{prenom}}. Ton objectif est simple : acheter {{typeBien}}. Pour y arriver, ton focus ce trimestre est d'{{objectifTrimestre||augmenter ton épargne — c'est ce qui te permet d'avancer vers ton projet}}. Voici les règles non négociables : tu épargnes avant de dépenser — jamais l'inverse. Ton épargne ne se touche pas, elle s'accumule. Tout revenu inattendu va directement dans ton épargne. Ne casse pas le système. À vendredi.`,
  },
  {
    mode: 'epargne', type: 'mercredi',
    texte: `On est mercredi, {{prenom}}. L'épargne passe en premier. Tu n'as pas touché à ta réserve. Et si un revenu imprévu arrive cette semaine, tu sais où il va. Ne casse pas le système. À vendredi.`,
  },
  {
    mode: 'epargne', type: 'vendredi_intro',
    texte: `Bilan de la semaine, {{prenom}}. Je vais te poser 3 questions simples. Réponds par oui ou par non.`,
  },
  {
    mode: 'epargne', type: 'mensuel_intro',
    texte: `Bonjour {{prenom}}, c'est l'heure des comptes mensuels. Je vais te poser 3 questions. Réponds par oui ou par non.`,
  },
  { mode: 'epargne', type: 'q1', texte: `Première question : as-tu épargné avant de dépenser ce mois-ci ?`, key: 'epargne_first', negatif: false },
  { mode: 'epargne', type: 'q2', texte: `Deuxième question : as-tu effectué un retrait sur ton épargne cette semaine ?`, key: 'retrait', negatif: true },
  { mode: 'epargne', type: 'q3', texte: `Troisième question : ton solde épargne est-il supérieur ou égal à celui du mois dernier ?`, key: 'solde_epargne', negatif: false },
  {
    mode: 'epargne', type: 'feedback_3',
    texte: `Capital en progression {{prenom}}. Tu as épargné en premier, pas de retrait, solde en hausse. {{semainesSansRetrait}} semaines sans toucher à ton épargne. Score du mois : {{scoreMensuel}} sur {{maxMensuel}}. {{serieActuelle}}. C'est comme ça qu'on construit. À lundi.`,
  },
  {
    mode: 'epargne', type: 'feedback_2',
    texte: `Deux sur trois {{prenom}}. {{semainesSansRetrait}} semaines sans retrait. Score du mois : {{scoreMensuel}} sur {{maxMensuel}}. Il y a eu une fissure — ferme-la avant lundi. À lundi.`,
  },
  {
    mode: 'epargne', type: 'feedback_1',
    texte: `L'épargne n'a pas été prioritaire cette semaine {{prenom}}. Score du mois : {{scoreMensuel}} sur {{maxMensuel}}. Chaque euro retiré aujourd'hui, c'est une semaine de plus avant ton projet. À lundi.`,
  },

  // ════════════════════════════════════════════
  //  MODE 5 — FINANCEMENT
  // ════════════════════════════════════════════
  {
    mode: 'financement', type: 'lundi',
    texte: `Bonjour {{prenom}}. Ton objectif est simple : acheter {{typeBien}}. Pour y arriver, ce trimestre, tu dois {{objectifTrimestre||préparer un dossier bancaire solide — dans quelques mois, une banque va analyser ta situation}}. Voici les règles non négociables : aucune décision financière sans réfléchir à l'impact sur ta capacité d'emprunt. Tes comptes doivent rester propres et à jour. Tu traites ton argent avec sérieux. Ne casse pas le système. À vendredi.`,
  },
  {
    mode: 'financement', type: 'mercredi',
    texte: `On est mercredi, {{prenom}}. Chaque mouvement financier cette semaine a un impact sur ton dossier. Reste propre. Reste cohérent. Ne casse pas le système. À vendredi.`,
  },
  {
    mode: 'financement', type: 'vendredi_intro',
    texte: `Bilan de la semaine, {{prenom}}. Je vais te poser 3 questions simples. Réponds par oui ou par non.`,
  },
  {
    mode: 'financement', type: 'mensuel_intro',
    texte: `Bonjour {{prenom}}, c'est l'heure des comptes mensuels. Je vais te poser 3 questions. Réponds par oui ou par non.`,
  },
  { mode: 'financement', type: 'q1', texte: `Première question : as-tu pris une décision financière importante sans mesurer l'impact sur ton dossier ?`, key: 'decision_risquee', negatif: true },
  { mode: 'financement', type: 'q2', texte: `Deuxième question : tes documents financiers sont-ils à jour cette semaine ?`, key: 'docs_a_jour', negatif: false },
  { mode: 'financement', type: 'q3', texte: `Troisième question : ton apport est-il stable ou en progression ?`, key: 'apport_stable', negatif: false },
  {
    mode: 'financement', type: 'feedback_3',
    texte: `Dossier solide {{prenom}}. Aucune décision risquée, documents à jour, apport stable. Score du mois : {{scoreMensuel}} sur {{maxMensuel}}. {{serieActuelle}}. Tu construis la version de toi que la banque va valider. À lundi.`,
  },
  {
    mode: 'financement', type: 'feedback_2',
    texte: `Semaine correcte {{prenom}}. Score du mois : {{scoreMensuel}} sur {{maxMensuel}}. Mais en mode Financement, chaque détail compte. Reprends le point manqué avant lundi. À lundi.`,
  },
  {
    mode: 'financement', type: 'feedback_1',
    texte: `Quelque chose a dérapé cette semaine {{prenom}}. Score du mois : {{scoreMensuel}} sur {{maxMensuel}}. Une décision non mesurée peut retarder ton dossier de plusieurs mois. Reprends le contrôle avant lundi. À lundi.`,
  },

  // ════════════════════════════════════════════
  //  MODE 6 — ACQUISITION
  // ════════════════════════════════════════════
  {
    mode: 'acquisition', type: 'lundi',
    texte: `Bonjour {{prenom}}. Ton objectif est simple : acheter {{typeBien}}. Pour y arriver, ce trimestre, tu dois {{objectifTrimestre||trouver le bon bien et faire une offre uniquement si toutes les conditions sont réunies}}. Voici les règles non négociables : aucune offre au dessus de ta capacité d'emprunt. Aucune précipitation, même si un bien te plaît beaucoup. Tu décides avec ta tête, pas avec l'émotion. Ne casse pas le système. À vendredi.`,
  },
  {
    mode: 'acquisition', type: 'mercredi',
    texte: `On est mercredi, {{prenom}}. Biens rentables. Critères respectés. Décision rationnelle. Si tu dois te convaincre que le bien rentre dans les cases — il n'y rentre pas. Ne casse pas le système. À vendredi.`,
  },
  {
    mode: 'acquisition', type: 'vendredi_intro',
    texte: `Bilan de la semaine, {{prenom}}. Je vais te poser 3 questions simples. Réponds par oui ou par non.`,
  },
  {
    mode: 'acquisition', type: 'mensuel_intro',
    texte: `Bonjour {{prenom}}, c'est l'heure des comptes mensuels. Je vais te poser 3 questions. Réponds par oui ou par non.`,
  },
  { mode: 'acquisition', type: 'q1', texte: `Première question : as-tu visité ou analysé un bien en dehors de tes critères cette semaine ?`, key: 'hors_criteres', negatif: true },
  { mode: 'acquisition', type: 'q2', texte: `Deuxième question : as-tu consulté ton courtier avant d'avancer sur une opportunité ?`, key: 'courtier', negatif: false },
  { mode: 'acquisition', type: 'q3', texte: `Troisième question : ta capacité de financement est-elle toujours validée ?`, key: 'financement_ok', negatif: false },
  {
    mode: 'acquisition', type: 'feedback_3',
    texte: `Tu restes dans les clous {{prenom}}. Critères respectés, courtier consulté, financement validé. Score du mois : {{scoreMensuel}} sur {{maxMensuel}}. {{serieActuelle}}. C'est comme ça qu'on achète bien. À lundi.`,
  },
  {
    mode: 'acquisition', type: 'feedback_2',
    texte: `Presque {{prenom}}. Score du mois : {{scoreMensuel}} sur {{maxMensuel}}. Un bien hors critères ou une décision sans courtier — c'est là que les gens font leur plus grande erreur. Reste dans les lignes. À lundi.`,
  },
  {
    mode: 'acquisition', type: 'feedback_1',
    texte: `Attention {{prenom}}. Score du mois : {{scoreMensuel}} sur {{maxMensuel}}. L'émotion prend le dessus sur la stratégie. Tu es trop près du but pour déraper maintenant. À lundi.`,
  },
  // ════ v8 ════
  {
    mode: 'global', type: 'prep_mensuel',
    texte: `Bonjour {{prenom}}. Vendredi prochain, c'est ton bilan mensuel. Avant vendredi, prépare ces 6 chiffres et garde-les à côté d'Alexa : ton solde d'épargne, tes dépenses épicerie et restaurants, tes abonnements, vêtements et divertissement, le montant utilisé sur toutes tes cartes et marges, et ton score de crédit. À lundi.`,
  },
  {
    mode: 'global', type: 'mensuel_intro',
    texte: `Bonjour {{prenom}}. C'est le bilan mensuel. Je vais te poser 6 questions. Tu peux répondre par un chiffre, ou dire passe si tu ne sais pas. On y va.`,
  },
  // ════ v8 — bilan mensuel ════
  {
    mode: 'global', type: 'prep_mensuel',
    texte: `Bonjour {{prenom}}. {{joursAvantBilan}}, c'est ton bilan mensuel. Avant ce {{bilanJourNom}}, prépare ces 6 chiffres et garde-les à côté d'Alexa : ton solde d'épargne, tes dépenses épicerie et restaurants, tes abonnements, vêtements et divertissement, le montant utilisé sur toutes tes cartes et marges, et ton score de crédit. À vendredi.`,
  },
  {
    mode: 'global', type: 'mensuel_intro',
    texte: `Bonjour {{prenom}}. C'est le bilan mensuel. Je vais te poser 6 questions. Tu peux répondre par un chiffre, ou dire passe si tu ne sais pas. On y va.`,
  }
];

async function seed() {
  console.log(`\nSeeding ${ITEMS.length} items → "${TABLE}" (${REGION})...\n`);
  let ok = 0, ko = 0;
  for (const item of ITEMS) {
    try {
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      console.log(`  ✅  ${item.mode} / ${item.type}`);
      ok++;
    } catch (e) {
      console.error(`  ❌  ${item.mode} / ${item.type} →`, e.message);
      ko++;
    }
  }
  console.log(`\nTerminé. ${ok} insérés, ${ko} erreurs.\n`);
}

seed().catch(console.error);
