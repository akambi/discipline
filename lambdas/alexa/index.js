// ============================================================
//  Alexa Skill – Discipline Coaching Immobilier  (v8)
//  Réussir à l'Étranger
//
//  v8 :
//  ✅ Bilan mensuel vocal avec questions numériques
//  ✅ PasserIntent ("je sais pas", "passe") → null stocké
//  ✅ Message de préparation le dernier vendredi du mois
//  ✅ Calcul progression mois N vs mois N-1 depuis DynamoDB
//  ✅ Make webhook → SMS formulaire pour chiffres manquants
//  ✅ Tout le reste identique à v7
// ============================================================

const Alexa  = require('ask-sdk-core');
const https  = require('https');
const urlMod = require('url');
const { DynamoDBClient }     = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { LireSignauxIntentHandler }                                                              = require('./intents/LireSignauxIntent');
const { AnnoncerSignalRougeIntentHandler }                                                      = require('./intents/AnnoncerSignalRougeIntent');
const { CheckSignalRougeIntentHandler, CheckSignalRougeOuiHandler, CheckSignalRougeNonHandler } = require('./intents/CheckSignalRougeIntent');
const { BilanSoirIntentHandler, BilanSoirOuiHandler, BilanSoirNonHandler }                    = require('./intents/BilanSoirIntent');
const { getLocalDate, getHeureLocale }                                                          = require('./utils');

// ──────────────────────────────────────────────
//  ⚙️  CONFIG
// ──────────────────────────────────────────────
const MAKE_SAVE_BILAN_URL    = process.env.MAKE_SAVE_BILAN_URL    || 'https://hook.eu2.make.com/wxnjhr1pkrmyemw7m9zskjntf33pktjl';
const MAKE_SAVE_MENSUEL_URL  = process.env.MAKE_SAVE_MENSUEL_URL  || 'https://hook.eu2.make.com/vnt49p5cmd0ur22eq7c8vuebhfp0kn5z';
const MAKE_DEACTIVATION_URL  = process.env.MAKE_DEACTIVATION_URL  || 'https://hook.eu2.make.com/zy45y8frvlnc2ygd4xa1zjmd6n9lgw4x';
const TABLE_USERS            = process.env.DYNAMO_TABLE           || 'coaching-immo-users';
const TABLE_MESSAGES         = process.env.DYNAMO_MESSAGES_TABLE  || 'coaching-immo-discipline-messages';
const TABLE_SIGNAUX          = process.env.TABLE_SIGNAUX          || 'discipline_signaux_soir';
const SKILL_ID_BILAN_IMMO   = process.env.SKILL_ID_BILAN_IMMO   || '';
const SKILL_ID_DISCIPLINE   = process.env.SKILL_ID_DISCIPLINE   || '';
const TIMEZONE_OFFSET        = -4;
const DUREE_COACHING_MOIS    = 18;
const SCORE_MIN_VALIDE       = 2;

// Questions bilan mensuel — dans l'ordre
const QUESTIONS_MENSUELLES = [
  {
    key:    'epargne',
    texte:  'Première question. Quel est le montant actuel de ton solde d\'épargne en dollars ?',
    type:   'number',
    label:  'épargne',
  },
  {
    key:    'epicerie_resto',
    texte:  'Deuxième question. Combien as-tu dépensé en épicerie et restaurants ce mois-ci ?',
    type:   'number',
    label:  'épicerie et restaurants',
  },
  {
    key:    'abonnements',
    texte:  'Troisième question. Combien as-tu dépensé en abonnements ce mois-ci ?',
    type:   'number',
    label:  'abonnements',
  },
  {
    key:    'vetements_divert',
    texte:  'Quatrième question. Combien as-tu dépensé en vêtements et divertissement ce mois-ci ?',
    type:   'number',
    label:  'vêtements et divertissement',
  },
  {
    key:    'solde_credit',
    texte:  'Cinquième question. Quel est le solde total utilisé sur toutes tes cartes et marges de crédit ? Additionne-les s\'il te plaît.',
    type:   'number',
    label:  'solde crédit',
  },
  {
    key:    'score_credit',
    texte:  'Sixième et dernière question. Quel est ton score de crédit ce mois-ci ?',
    type:   'number',
    label:  'score de crédit',
  },
];

// ──────────────────────────────────────────────
//  DynamoDB
// ──────────────────────────────────────────────
const ddb    = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
const _cache = {};

async function getProfil(userId) {
  try {
    const res = await ddb.send(new GetCommand({ TableName: TABLE_USERS, Key: { userId } }));
    return res.Item || null;
  } catch (e) { console.error('getProfil:', e); return null; }
}

async function saveProfil(profil) {
  try { await ddb.send(new PutCommand({ TableName: TABLE_USERS, Item: profil })); }
  catch (e) { console.error('saveProfil:', e); }
}

async function getMsg(mode, type) {
  const k = `${mode}#${type}`;
  if (_cache[k] !== undefined) return _cache[k];
  try {
    const res = await ddb.send(new GetCommand({ TableName: TABLE_MESSAGES, Key: { mode, type } }));
    _cache[k] = res.Item || null;
    return _cache[k];
  } catch (e) { console.error(`getMsg [${mode}/${type}]:`, e); _cache[k] = null; return null; }
}

async function getQuestions(mode) {
  const items = await Promise.all([getMsg(mode,'q1'), getMsg(mode,'q2'), getMsg(mode,'q3')]);
  return items.filter(Boolean);
}

// ──────────────────────────────────────────────
//  CALCUL JOUR
// ──────────────────────────────────────────────
// Retourne le prochain jour de bilan mensuel (1er lun/mer/ven du mois suivant)
function getDateBilanMensuelSuivant(localDate) {
  const moisSuivant = new Date(Date.UTC(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth() + 1,
    1
  ));
  const joursActifs = { 1: true, 3: true, 5: true };
  for (let i = 0; i <= 6; i++) {
    const d = new Date(Date.UTC(moisSuivant.getUTCFullYear(), moisSuivant.getUTCMonth(), 1 + i));
    if (joursActifs[d.getUTCDay()]) return d;
  }
  return moisSuivant;
}

// Retourne le jour de bilan mensuel du mois courant (1er lun/mer/ven du mois)
function getDateBilanMensuelCourant(localDate) {
  const joursActifs = { 1: true, 3: true, 5: true };
  for (let i = 0; i <= 6; i++) {
    const d = new Date(Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), 1 + i));
    if (joursActifs[d.getUTCDay()]) return d;
  }
  return null;
}

function getJourMode() {
  if (process.env.FORCE_JOUR) return process.env.FORCE_JOUR;

  const now   = new Date();
  const local = new Date(now.getTime() + TIMEZONE_OFFSET * 3600 * 1000);
  const jour  = local.getUTCDay();

  // Pas un jour actif (mar/jeu/sam/dim) → silence
  const joursActifs = { 1: 'lundi', 3: 'mercredi', 5: 'vendredi' };
  if (!joursActifs[jour]) return 'repos';

  // Est-ce que aujourd'hui est le jour du bilan mensuel ?
  const bilanCourant = getDateBilanMensuelCourant(local);
  if (bilanCourant &&
      bilanCourant.getUTCDate()  === local.getUTCDate() &&
      bilanCourant.getUTCMonth() === local.getUTCMonth()) {
    return 'mensuel';
  }

  // Fenêtre de préparation : entre 3 et 10 jours avant le prochain bilan mensuel
  // Couvre : mercredi et vendredi de la semaine précédant le bilan
  const bilanSuivant = getDateBilanMensuelSuivant(local);
  // Normaliser au début de journée pour éviter les erreurs d'heure
  const localSod      = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const diffJours     = Math.floor((bilanSuivant - localSod) / (1000 * 60 * 60 * 24));
  if (diffJours >= 3 && diffJours <= 10) return 'prep_mensuel';

  return joursActifs[jour];
}

function getMoisCourant() {
  const now   = new Date();
  const local = new Date(now.getTime() + TIMEZONE_OFFSET * 3600 * 1000);
  return local.toISOString().slice(0, 7); // "2026-04"
}

function getMoisPrecedent() {
  const now   = new Date();
  const local = new Date(now.getTime() + TIMEZONE_OFFSET * 3600 * 1000);
  local.setUTCMonth(local.getUTCMonth() - 1);
  return local.toISOString().slice(0, 7);
}

// ──────────────────────────────────────────────
//  STATS HEBDO
// ──────────────────────────────────────────────
function updateStats(profil, score, reponses, questions) {
  const moisCourant = getMoisCourant();
  const stats = profil.stats || {};
  if (stats.moisCourant !== moisCourant) {
    stats.moisCourant = moisCourant;
    stats.scoreMensuel = 0;
    stats.bilansMois = 0;
    stats.semValideesMois = 0;
  }
  stats.scoreMensuel    = (stats.scoreMensuel || 0) + score;
  stats.bilansMois      = (stats.bilansMois   || 0) + 1;
  stats.maxMensuel      = stats.bilansMois * questions.length;
  if (score >= SCORE_MIN_VALIDE) {
    stats.semValideesMois = (stats.semValideesMois || 0) + 1;
    stats.streak          = (stats.streak          || 0) + 1;
    stats.streakMax       = Math.max(stats.streak, stats.streakMax || 0);
  } else {
    stats.streak = 0;
  }
  const mode = profil.mode_actif;
  if (mode === 'maitrise') {
    stats.moisSansDecouvert   = reponses['decouvert']      === false ? (stats.moisSansDecouvert   || 0) + 1 : 0;
  }
  if (mode === 'alleg') {
    stats.semainesSansCharge  = reponses['nouvelle_charge'] === false ? (stats.semainesSansCharge  || 0) + 1 : 0;
  }
  if (mode === 'epargne') {
    stats.semainesSansRetrait = reponses['retrait']        === false ? (stats.semainesSansRetrait || 0) + 1 : 0;
  }
  stats.dernierBilan = new Date().toISOString().split('T')[0];
  return stats;
}

// ──────────────────────────────────────────────
//  CALCUL PROGRESSION MENSUELLE
// ──────────────────────────────────────────────
function calculerProgression(profil, donneesNouv) {
  const moisPrec  = getMoisPrecedent();
  const historique = profil.historique_mensuel || {};
  const prev      = historique[moisPrec] || {};
  const lignes    = [];
  const manquants = [];

  // Épargne
  if (donneesNouv.epargne !== null && prev.epargne !== undefined && prev.epargne !== null) {
    const diff = donneesNouv.epargne - prev.epargne;
    if (diff > 0) {
      lignes.push(`ton épargne est passée de ${prev.epargne} à ${donneesNouv.epargne} dollars — soit ${diff} dollars de plus ce mois-ci`);
    } else if (diff < 0) {
      lignes.push(`ton épargne a baissé de ${Math.abs(diff)} dollars ce mois-ci — elle est à ${donneesNouv.epargne} dollars`);
    } else {
      lignes.push(`ton épargne est stable à ${donneesNouv.epargne} dollars`);
    }
  } else if (donneesNouv.epargne !== null) {
    lignes.push(`ton épargne actuelle est de ${donneesNouv.epargne} dollars`);
  }

  // Score crédit
  if (donneesNouv.score_credit !== null && prev.score_credit !== undefined && prev.score_credit !== null) {
    const diff = donneesNouv.score_credit - prev.score_credit;
    if (diff > 0) {
      lignes.push(`ton score de crédit a progressé de ${diff} points — il est maintenant à ${donneesNouv.score_credit}`);
    } else if (diff < 0) {
      lignes.push(`ton score de crédit a baissé de ${Math.abs(diff)} points — il est à ${donneesNouv.score_credit}`);
    } else {
      lignes.push(`ton score de crédit est stable à ${donneesNouv.score_credit}`);
    }
  }

  // Dépenses variables
  const depNouv = (donneesNouv.epicerie_resto || 0) + (donneesNouv.abonnements || 0) + (donneesNouv.vetements_divert || 0);
  const depPrec = (prev.epicerie_resto || 0) + (prev.abonnements || 0) + (prev.vetements_divert || 0);
  if (depNouv > 0 && depPrec > 0) {
    const diff = depNouv - depPrec;
    if (diff < 0) {
      lignes.push(`tes dépenses variables ont baissé de ${Math.abs(diff)} dollars ce mois-ci`);
    } else if (diff > 0) {
      lignes.push(`tes dépenses variables ont augmenté de ${diff} dollars ce mois-ci`);
    }
  }

  // Chiffres manquants → SMS
  QUESTIONS_MENSUELLES.forEach(q => {
    if (donneesNouv[q.key] === null) manquants.push(q.label);
  });

  return { lignes, manquants };
}

// ──────────────────────────────────────────────
//  INTERPOLATION
// ──────────────────────────────────────────────
function interpolate(texte, vars = {}) {
  if (!texte) return '';
  let result = texte.replace(/\{\{(\w+)(?:\|\|([^}]*))?\}\}/g, (_, key, fallback) => {
    const val = vars[key];
    if (val !== undefined && val !== '') return val;
    return fallback !== undefined ? fallback : '';
  });
  result = result.replace(/Bonjour\s+\./g,   'Bonjour.');
  result = result.replace(/mercredi,\s+\./g, 'mercredi.');
  result = result.replace(/semaine,\s+\./g,  'semaine.');
  result = result.replace(/,\s{2,}/g,        ', ');
  result = result.replace(/\s{2,}/g,         ' ');
  result = result.replace(/,\s+\./g,         '.');
  return result.trim();
}

const MODE_LABELS = {
  alleg: 'Allègement', maitrise: 'Maîtrise', credit: 'Crédit',
  epargne: 'Épargne', financement: 'Financement', acquisition: 'Acquisition',
};

function buildSerieActuelle(streak) {
  if (streak === 0) return '';
  if (streak === 1) return "C'est ta première semaine validée — continue sur ta lancée";
  if (streak < 4)  return `Tu enchaînes ${streak} semaines consécutives`;
  if (streak < 8)  return `Bravo, tu maintiens ta régularité depuis ${streak} semaines consécutives`;
  return `Félicitations, tu es à ${streak} semaines consécutives sans interruption`;
}

function buildSerieRecord(streakMax) {
  if (streakMax <= 1) return '';
  return `Ton record est de ${streakMax} semaines consécutives`;
}

function buildVars(profil) {
  const s  = profil?.stats || {};
  const nb = s.bilansMois || 0;
  const qs = 3;

  // Calcul dynamique du delai avant le prochain bilan mensuel
  const now   = new Date();
  const local = new Date(now.getTime() + TIMEZONE_OFFSET * 3600 * 1000);
  const bilan = getDateBilanMensuelSuivant(local);
  const sod   = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const diff  = Math.floor((bilan - sod) / (1000 * 60 * 60 * 24));
  const jNomsBilan = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const joursAvantBilan = diff === 1 ? 'demain' : diff === 2 ? 'apres-demain' : 'dans ' + diff + ' jours';
  const bilanJourNom    = jNomsBilan[bilan.getUTCDay()];

  return {
    prenom:              profil?.prenom            || '',
    typeBien:            profil?.typeBien          || 'ton bien',
    objectifTrimestre:   profil?.objectifTrimestre || '',
    modeLabel:           MODE_LABELS[profil?.mode_actif] || 'Discipline',
    joursAvantBilan,
    bilanJourNom,
    streak:              s.streak              || 0,
    streakMax:           s.streakMax           || 0,
    scoreMensuel:        s.scoreMensuel        || 0,
    maxMensuel:          nb * qs               || 0,
    semValideesMois:     s.semValideesMois     || 0,
    bilansMois:          nb,
    moisSansDecouvert:   s.moisSansDecouvert   || 0,
    semainesSansCharge:  s.semainesSansCharge  || 0,
    semainesSansRetrait: s.semainesSansRetrait || 0,
    serieActuelle:       buildSerieActuelle(s.streak || 0),
    serieRecord:         buildSerieRecord(s.streakMax || 0),
  };
}

// ──────────────────────────────────────────────
//  UTILITAIRES
// ──────────────────────────────────────────────
function isExpired(profil) {
  if (!profil?.dateExpiration) return false;
  return new Date() > new Date(profil.dateExpiration);
}

function calcExpiration() {
  const d = new Date();
  d.setMonth(d.getMonth() + DUREE_COACHING_MOIS);
  return d.toISOString().split('T')[0];
}

function calcScore(reponses, questions) {
  return questions.reduce((acc, q) => {
    const rep = reponses[q.key];
    if (rep === undefined) return acc;
    return acc + ((q.negatif ? rep === false : rep === true) ? 1 : 0);
  }, 0);
}

function postToMake(urlStr, payload) {
  return new Promise((resolve) => {
    try {
      const data   = JSON.stringify(payload);
      const parsed = urlMod.parse(urlStr);
      const req    = https.request({
        hostname: parsed.hostname, path: parsed.path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      }, res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>resolve({ok:true})); });
      req.on('error', e => resolve({ ok: false }));
      req.write(data); req.end();
    } catch (e) { resolve({ ok: false }); }
  });
}

async function fetchPrenom(apiEndpoint, token) {
  return new Promise(resolve => {
    https.get({
      hostname: apiEndpoint.replace('https://', ''),
      path: '/v2/accounts/~current/settings/Profile.givenName',
      headers: { Authorization: `Bearer ${token}` },
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => { try { resolve(JSON.parse(b) || ''); } catch { resolve(''); } });
    }).on('error', () => resolve(''));
  });
}

// ──────────────────────────────────────────────
//  HANDLER SIGNAL ROUGE (6h)
// ──────────────────────────────────────────────
async function handleSignalRouge(h) {
  const userId = 'akambi'; // temporaire
  const today  = getLocalDate(-4);

  try {
    const result = await ddb.send(new GetCommand({
      TableName: TABLE_SIGNAUX,
      Key: { userId, date: today },
    }));

    if (!result.Item?.signaux?.length) {
      return h.responseBuilder
        .speak("Pas de signaux pour aujourd'hui. Capture des tâches avec ton raccourci Signal.")
        .getResponse();
    }

    const signaux = result.Item.signaux;
    const rouge   = signaux.find(s => s.signal === 'critique') || signaux[0];

    return h.responseBuilder
      .speak(`Ton signal rouge aujourd'hui : ${rouge.content}. C'est ta priorité absolue.`)
      .getResponse();
  } catch (e) {
    console.error('handleSignalRouge error:', e);
    return h.responseBuilder
      .speak("Je n'ai pas pu récupérer ton signal rouge.")
      .getResponse();
  }
}

// ──────────────────────────────────────────────
//  HANDLER MES SIGNAUX (21h)
// ──────────────────────────────────────────────
async function handleMesSignaux(h) {
  const userId = 'akambi'; // temporaire
  const today  = getLocalDate(-4);

  try {
    const result = await ddb.send(new GetCommand({
      TableName: TABLE_SIGNAUX,
      Key: { userId, date: today },
    }));

    if (!result.Item?.signaux?.length) {
      return h.responseBuilder
        .speak("Tes signaux pour demain ne sont pas encore prêts. Réessaie après 20 heures.")
        .getResponse();
    }

    const signaux  = result.Item.signaux;
    const labels   = { critique: 'rouge', important: 'orange', opportunite: 'vert' };
    const ordinals = ['Premier', 'Deuxième', 'Troisième'];

    let speech = 'Voici tes trois signaux pour demain. ';
    signaux.forEach((s, i) => {
      const couleur = labels[s.signal] || s.signal;
      speech += `${ordinals[i] || ''} signal ${couleur} : ${s.content}. `;
    });

    return h.responseBuilder.speak(speech).getResponse();
  } catch (e) {
    console.error('handleMesSignaux error:', e);
    return h.responseBuilder
      .speak("Je n'ai pas pu récupérer tes signaux.")
      .getResponse();
  }
}

// ── Handler Check Matin (9h30) ───────────────────────────────────────────────
async function handleCheckMatin(h) {
  const userId = 'akambi'; // temporaire
  const today  = getLocalDate(-4);

  try {
    const result = await ddb.send(new GetCommand({
      TableName: TABLE_SIGNAUX,
      Key: { userId, date: today },
    }));

    if (!result.Item?.signaux?.length) {
      return h.responseBuilder
        .speak("Pas de signaux pour aujourd'hui.")
        .getResponse();
    }

    const signaux = result.Item.signaux;
    const rouge   = signaux.find(s => s.signal === 'critique') || signaux[0];

    const sa = h.attributesManager.getSessionAttributes();
    sa.checkSignalRouge = {
      taskId:    rouge.taskId,
      content:   rouge.content,
      profilLie: rouge.profilLie,
    };
    h.attributesManager.setSessionAttributes(sa);

    const question = rouge.question
      || `Ton signal rouge : ${rouge.content}. C'est fait ?`;

    return h.responseBuilder
      .speak(question)
      .reprompt('Réponds par oui ou par non.')
      .getResponse();

  } catch (e) {
    console.error('handleCheckMatin error:', e);
    return h.responseBuilder
      .speak("Je n'ai pas pu récupérer ton signal rouge.")
      .getResponse();
  }
}

// ── Handler Bilan du Soir (18h00) ────────────────────────────────────────────
async function handleBilanSoir(h) {
  const userId = 'akambi'; // temporaire
  const today  = getLocalDate(-4);

  try {
    const result = await ddb.send(new GetCommand({
      TableName: TABLE_SIGNAUX,
      Key: { userId, date: today },
    }));

    if (!result.Item?.signaux?.length) {
      return h.responseBuilder
        .speak("Pas de signaux pour aujourd'hui. Capture d'abord des tâches avec ton raccourci Signal.")
        .getResponse();
    }

    const signaux = result.Item.signaux.filter(s => s.taskId);

    if (signaux.length === 0) {
      return h.responseBuilder
        .speak("Aucune tâche à valider pour aujourd'hui.")
        .getResponse();
    }

    const sa = h.attributesManager.getSessionAttributes();
    sa.bilanSoir = {
      signaux,
      currentIndex: 0,
      reponses: [],
      userId,
    };
    h.attributesManager.setSessionAttributes(sa);

    const premier  = signaux[0];
    const question = premier.question
      || `As-tu complété cette tâche : ${premier.content} ?`;

    return h.responseBuilder
      .speak(`Bilan de la journée. ${question}`)
      .reprompt('Réponds par oui ou par non.')
      .getResponse();

  } catch (e) {
    console.error('handleBilanSoir error:', e);
    return h.responseBuilder
      .speak("Je n'ai pas pu démarrer le bilan du soir.")
      .getResponse();
  }
}

// ── Handler Recalculer (à la demande) ────────────────────────────────────────
async function handleRecalculer(h) {
  const userId = 'akambi';

  try {
    const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
    const lambdaClient = new LambdaClient({ region: process.env.DYNAMODB_REGION || 'us-east-1' });

    await lambdaClient.send(new InvokeCommand({
      FunctionName: process.env.PILOTAGE_SOIR_FUNCTION || 'discipline-pilotage-soir',
      InvocationType: 'Event',
      Payload: JSON.stringify({ userId }),
    }));

    return h.responseBuilder
      .speak("Je recalcule tes priorités. Elles seront prêtes dans quelques instants. Redemande-moi tes signaux dans 30 secondes.")
      .getResponse();

  } catch (e) {
    console.error('handleRecalculer error:', e);
    return h.responseBuilder
      .speak("Je n'ai pas pu lancer le recalcul. Réessaie dans quelques instants.")
      .getResponse();
  }
}

// ── Custom Task Handler ──────────────────────────────────────────────────────
const TaskHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest'
      && h.requestEnvelope.request.task != null;
  },
  async handle(h) {
    const task     = h.requestEnvelope.request.task;
    const taskName = task.name?.split('.').pop();

    console.log(`TaskHandler invoked: ${taskName}`);

    switch (taskName) {
      case 'messignaux':  return handleMesSignaux(h);
      case 'signalrouge': return handleSignalRouge(h);
      case 'checkmatin':  return handleCheckMatin(h);
      case 'bilansoir':   return handleBilanSoir(h);
      case 'recalculer':  return handleRecalculer(h);
      default:
        return h.responseBuilder
          .speak("Tâche non reconnue.")
          .getResponse();
    }
  }
};

// ──────────────────────────────────────────────
//  HANDLERS
// ──────────────────────────────────────────────

const LaunchRequestHandler = {
  canHandle(h) { return Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest'; },

  async handle(h) {
    const skillId = h.requestEnvelope.session.application.applicationId;

    const SKILL_IDS_AUTORISES = [
      SKILL_ID_BILAN_IMMO,
      SKILL_ID_DISCIPLINE,
    ].filter(Boolean);

    if (SKILL_IDS_AUTORISES.length > 0 && !SKILL_IDS_AUTORISES.includes(skillId)) {
      return h.responseBuilder.speak('Skill non autorisé.').getResponse();
    }

    // ── Skill "discipline" — routing par heure ────────────────────────────
    if (skillId === SKILL_ID_DISCIPLINE) {
      const heure = getHeureLocale(-4);

      if (heure >= 6  && heure < 9)  return handleSignalRouge(h);
      if (heure >= 9  && heure < 17) return handleCheckMatin(h);
      if (heure >= 17 && heure < 20) return handleBilanSoir(h);
      if (heure >= 20)               return handleMesSignaux(h);

      return h.responseBuilder
        .speak("Il est trop tôt. Va dormir, Akambi.")
        .getResponse();
    }

    // ── Skill "bilan immo" — flow existant ────────────────────────────────
    const userId = h.requestEnvelope.session.user.userId;
    const profil = await getProfil(userId);

    if (profil && isExpired(profil)) {
      await postToMake(MAKE_DEACTIVATION_URL, { userId, prenom: profil.prenom });
      return h.responseBuilder.speak(`Bonjour ${profil.prenom || ''}. Ton programme est terminé. Pour continuer, contacte ton coach.`).getResponse();
    }

    if (!profil || !profil.typeBien) {
      let prenom = '';
      try { prenom = await fetchPrenom(h.requestEnvelope.context.System.apiEndpoint, h.requestEnvelope.context.System.apiAccessToken); } catch {}
      const sa = h.attributesManager.getSessionAttributes();
      sa.onboarding = true; sa.prenom = prenom;
      h.attributesManager.setSessionAttributes(sa);
      const msg = await getMsg('global', 'onboarding_intro');
      const txt = msg ? interpolate(msg.texte, { prenom })
        : `Bienvenue dans le programme Discipline. Quel type de bien souhaites-tu acheter ? Maison, plex ou condo ?`;
      return h.responseBuilder.speak(txt).reprompt('Maison, plex ou condo ?').getResponse();
    }

    const jourMode  = getJourMode();
    const modeActif = profil.mode_actif || 'alleg';
    const vars      = buildVars(profil);

    // Silence les jours non actifs
    const JOURS_ACTIFS = ['lundi', 'mercredi', 'vendredi', 'mensuel', 'prep_mensuel'];
    if (!JOURS_ACTIFS.includes(jourMode)) {
      return h.responseBuilder.getResponse();
    }

    // Message de préparation mensuelle
    if (jourMode === 'prep_mensuel') {
      const msg = await getMsg('global', 'prep_mensuel');
      const txt = msg ? interpolate(msg.texte, vars)
        : `Bonjour ${vars.prenom}. ${vars.joursAvantBilan}, c'est ton bilan mensuel. Avant ce ${vars.bilanJourNom}, prépare ces 6 chiffres et garde-les à côté d'Alexa : ton solde d'épargne, tes dépenses épicerie et restaurants, tes abonnements, vêtements et divertissement, le montant utilisé sur toutes tes cartes et marges, et ton score de crédit. À vendredi.`;
      return h.responseBuilder.speak(txt).getResponse();
    }

    // Lundi / Mercredi
    if (jourMode === 'lundi' || jourMode === 'mercredi') {
      const msg = await getMsg(modeActif, jourMode);
      const txt = msg ? interpolate(msg.texte, vars) : `Bonjour. Ne casse pas le système. À vendredi.`;
      return h.responseBuilder.speak(txt).getResponse();
    }

    // Bilan hebdomadaire (vendredi)
    if (jourMode === 'vendredi') {
      const [introMsg, questions] = await Promise.all([getMsg(modeActif, 'vendredi_intro'), getQuestions(modeActif)]);
      const intro = introMsg ? interpolate(introMsg.texte, vars)
        : `Bilan de la semaine. Je vais te poser 3 questions. Réponds par oui ou par non.`;
      if (questions.length === 0) return h.responseBuilder.speak(intro).getResponse();
      const sa = h.attributesManager.getSessionAttributes();
      sa.bilan = true; sa.modeActif = modeActif; sa.jourMode = 'vendredi';
      sa.questionIdx = 0; sa.reponses = {};
      sa.questions = questions.map(q => ({ key: q.key, negatif: q.negatif || false }));
      h.attributesManager.setSessionAttributes(sa);
      return h.responseBuilder.speak(`${intro} ${interpolate(questions[0].texte, vars)}`).reprompt('Réponds par oui ou par non.').getResponse();
    }

    // Bilan mensuel (1er du mois)
    if (jourMode === 'mensuel') {
      const msg = await getMsg('global', 'mensuel_intro');
      const intro = msg ? interpolate(msg.texte, vars)
        : `Bonjour ${vars.prenom}. C'est le bilan mensuel. Je vais te poser 6 questions. Tu peux répondre par un chiffre, ou dire passe si tu ne sais pas. On y va.`;
      const sa = h.attributesManager.getSessionAttributes();
      sa.bilanMensuel  = true;
      sa.modeActif     = modeActif;
      sa.questionIdx   = 0;
      sa.donneesMois   = {};
      h.attributesManager.setSessionAttributes(sa);
      const premiereQ = QUESTIONS_MENSUELLES[0].texte;
      return h.responseBuilder
        .speak(`${intro} ${premiereQ}`)
        .reprompt('Donne-moi un chiffre, ou dis passe.')
        .getResponse();
    }
  },
};

// ──────────────────────────────────────────────
//  ONBOARDING
// ──────────────────────────────────────────────
const ObjectifIntentHandler = {
  canHandle(h) {
    const sa = h.attributesManager.getSessionAttributes();
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'ObjectifIntent' && sa.onboarding;
  },
  async handle(h) {
    const userId = h.requestEnvelope.session.user.userId;
    const slot   = Alexa.getSlotValue(h.requestEnvelope, 'typeBien') || 'un bien immobilier';
    const sa     = h.attributesManager.getSessionAttributes();
    const profil = {
      userId, prenom: sa.prenom || '', typeBien: slot, mode_actif: 'alleg',
      dateInscription: new Date().toISOString().split('T')[0],
      dateExpiration: calcExpiration(), actif: true, stats: {}, historique_mensuel: {},
    };
    await saveProfil(profil);
    const vars = buildVars(profil);
    const msg  = await getMsg('global', 'onboarding_confirm');
    const txt  = msg ? interpolate(msg.texte, vars)
      : `Parfait. Ton objectif est d'acheter ${slot}. Tu commences en mode Allègement. Ne casse pas le système.`;
    return h.responseBuilder.speak(txt).getResponse();
  },
};

// ──────────────────────────────────────────────
//  BILAN HEBDOMADAIRE — OUI / NON
// ──────────────────────────────────────────────
const OuiNonIntentHandler = {
  canHandle(h) {
    const sa     = h.attributesManager.getSessionAttributes();
    const intent = Alexa.getIntentName(h.requestEnvelope);
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && (intent === 'AMAZON.YesIntent' || intent === 'AMAZON.NoIntent')
      && sa.bilan && !sa.checkSignalRouge;
  },
  async handle(h) {
    const reponse = Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.YesIntent';
    const sa      = h.attributesManager.getSessionAttributes();
    const qs      = sa.questions;
    const idx     = sa.questionIdx;
    sa.reponses[qs[idx].key] = reponse;
    sa.questionIdx = idx + 1;
    h.attributesManager.setSessionAttributes(sa);

    if (sa.questionIdx < qs.length) {
      const userId = h.requestEnvelope.session.user.userId;
      const profil = await getProfil(userId);
      const nextQ  = await getMsg(sa.modeActif, `q${sa.questionIdx + 1}`);
      const txt    = nextQ ? interpolate(nextQ.texte, buildVars(profil)) : 'Question suivante.';
      return h.responseBuilder.speak(txt).reprompt('Réponds par oui ou par non.').getResponse();
    }

    const score  = calcScore(sa.reponses, qs);
    const userId = h.requestEnvelope.session.user.userId;
    const profil = await getProfil(userId);
    const statsMAJ = updateStats(profil, score, sa.reponses, qs);
    profil.stats   = statsMAJ;
    await saveProfil(profil);
    const vars     = buildVars(profil);
    const fbMsg    = await getMsg(sa.modeActif, score >= 1 ? `feedback_${score}` : 'feedback_1');
    const feedback = fbMsg ? interpolate(fbMsg.texte, vars)
      : `Bilan enregistré. ${score} sur ${qs.length}. À vendredi.`;
    await postToMake(MAKE_SAVE_BILAN_URL, {
      userId, prenom: vars.prenom, mode: sa.modeActif, jourMode: 'vendredi',
      date: new Date().toISOString(), reponses: sa.reponses, score,
      taux: Math.round((score / qs.length) * 100), stats: statsMAJ,
    });
    return h.responseBuilder.speak(feedback).getResponse();
  },
};

// ──────────────────────────────────────────────
//  BILAN MENSUEL — NOMBRE
// ──────────────────────────────────────────────
const NombreIntentHandler = {
  canHandle(h) {
    const sa = h.attributesManager.getSessionAttributes();
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'NombreIntent'
      && sa.bilanMensuel;
  },
  async handle(h) {
    const sa      = h.attributesManager.getSessionAttributes();
    const idx     = sa.questionIdx;
    const qCourante = QUESTIONS_MENSUELLES[idx];
    const nombre  = parseFloat(Alexa.getSlotValue(h.requestEnvelope, 'nombre'));
    sa.donneesMois[qCourante.key] = isNaN(nombre) ? null : nombre;
    sa.questionIdx = idx + 1;
    h.attributesManager.setSessionAttributes(sa);

    if (sa.questionIdx < QUESTIONS_MENSUELLES.length) {
      const prochaineQ = QUESTIONS_MENSUELLES[sa.questionIdx].texte;
      return h.responseBuilder.speak(prochaineQ).reprompt('Donne-moi un chiffre, ou dis passe.').getResponse();
    }
    return await terminerBilanMensuel(h, sa);
  },
};

// ──────────────────────────────────────────────
//  BILAN MENSUEL — PASSER
// ──────────────────────────────────────────────
const PasserIntentHandler = {
  canHandle(h) {
    const sa = h.attributesManager.getSessionAttributes();
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'PasserIntent'
      && sa.bilanMensuel;
  },
  async handle(h) {
    const sa        = h.attributesManager.getSessionAttributes();
    const idx       = sa.questionIdx;
    const qCourante = QUESTIONS_MENSUELLES[idx];
    sa.donneesMois[qCourante.key] = null; // chiffre manquant
    sa.questionIdx = idx + 1;
    h.attributesManager.setSessionAttributes(sa);

    if (sa.questionIdx < QUESTIONS_MENSUELLES.length) {
      const prochaineQ = QUESTIONS_MENSUELLES[sa.questionIdx].texte;
      return h.responseBuilder.speak(`Pas de problème. ${prochaineQ}`).reprompt('Donne-moi un chiffre, ou dis passe.').getResponse();
    }
    return await terminerBilanMensuel(h, sa);
  },
};

// ──────────────────────────────────────────────
//  FIN DU BILAN MENSUEL
// ──────────────────────────────────────────────
async function terminerBilanMensuel(h, sa) {
  const userId  = h.requestEnvelope.session.user.userId;
  const profil  = await getProfil(userId);
  const moisCourant = getMoisCourant();
  const donnees = sa.donneesMois;

  // Sauvegarder dans historique
  if (!profil.historique_mensuel) profil.historique_mensuel = {};
  profil.historique_mensuel[moisCourant] = {
    ...donnees,
    date: new Date().toISOString(),
  };
  await saveProfil(profil);

  // Calculer progression
  const { lignes, manquants } = calculerProgression(profil, donnees);

  // ── Feedback vocal naturel pour Alexa ──
  const parties = [];

  // Accroche
  parties.push(`Mise à jour enregistrée${profil.prenom ? ', ' + profil.prenom : ''}.`);

  // Une phrase par indicateur qui a bougé
  for (const ligne of lignes) {
    // Capitaliser la première lettre
    parties.push(ligne.charAt(0).toUpperCase() + ligne.slice(1) + '.');
  }

  // Conclusion
  if (lignes.length > 0) {
    parties.push('Tu avances vers ton objectif.');
  } else {
    parties.push('Continue sur ta lancée.');
  }

  // SMS si chiffres manquants
  if (manquants.length > 0) {
    parties.push(`Je t'envoie un message pour compléter les chiffres manquants.`);
  }

  const feedback = parties.join(' ');

  // Envoi Make — mise à jour Sheet + SMS si manquants
  await postToMake(MAKE_SAVE_MENSUEL_URL, {
    userId,
    prenom:    profil.prenom || '',
    mois:      moisCourant,
    donnees,
    manquants,
    date:      new Date().toISOString(),
    envoyer_sms: manquants.length > 0,
  });

  return h.responseBuilder.speak(feedback).getResponse();
}

// ──────────────────────────────────────────────
//  FALLBACK / CANCEL / STOP / ERROR
// ──────────────────────────────────────────────
const FallbackHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.FallbackIntent';
  },
  handle(h) {
    const sa = h.attributesManager.getSessionAttributes();
    if (sa.bilan)        return h.responseBuilder.speak('Réponds par oui ou par non.').reprompt('Oui ou non ?').getResponse();
    if (sa.bilanMensuel) return h.responseBuilder.speak('Donne-moi un chiffre, ou dis passe.').reprompt('Un chiffre ou passe.').getResponse();
    return h.responseBuilder.speak('Je n\'ai pas compris.').getResponse();
  },
};

const CancelStopHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && (Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.CancelIntent'
        || Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.StopIntent');
  },
  handle(h) { return h.responseBuilder.speak('À bientôt.').getResponse(); },
};

const SessionEndedHandler = {
  canHandle(h) { return Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest'; },
  handle(h)    { return h.responseBuilder.getResponse(); },
};

const ErrorHandler = {
  canHandle() { return true; },
  handle(h, e) {
    console.error('Error:', e);
    return h.responseBuilder.speak('Une erreur est survenue. Réessaie dans quelques instants.').getResponse();
  },
};

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    TaskHandler,
    LaunchRequestHandler,
    ObjectifIntentHandler,
    LireSignauxIntentHandler,
    AnnoncerSignalRougeIntentHandler,
    CheckSignalRougeIntentHandler,
    CheckSignalRougeOuiHandler,
    CheckSignalRougeNonHandler,
    BilanSoirIntentHandler,
    BilanSoirOuiHandler,
    BilanSoirNonHandler,
    OuiNonIntentHandler,
    NombreIntentHandler,
    PasserIntentHandler,
    FallbackHandler,
    CancelStopHandler,
    SessionEndedHandler,
  )
  .addErrorHandlers(ErrorHandler)
  .withApiClient(new Alexa.DefaultApiClient())
  .lambda();
