# Alexa Routines Setup — Discipline Touchpoints

## Vue d'ensemble

Cinq routines pilotent les touchpoints Alexa du système Discipline :

| Heure | Routine | Skill / Intent |
|-------|---------|----------------|
| 6h00  | Signal rouge du jour (LaunchRequest) | Skill **Signal Rouge** |
| 9h30  | Check conversationnel | Skill **Bilan Immo** → `CheckSignalRougeIntent` |
| 18h00 | Bilan de fin de journée | Skill **Bilan Immo** → `BilanSoirIntent` |
| 21h00 | Signaux du lendemain (LaunchRequest) | Skill **Mes Signaux** |
| Lun/Mer/Ven matin | Bilan hebdo / mensuel | Skill **Bilan Immo** → `LaunchRequest` |

---

## Nouveaux skills Alexa (création manuelle — console Alexa Developer)

### Skill "Signal Rouge"

1. Alexa Developer Console → **Create Skill**
2. **Skill name** : `Signal Rouge`
3. **Primary locale** : French (CA)
4. **Model** : Custom — **Hosting** : Provision your own
5. **Invocation name** : `signal rouge`
6. **Endpoint** → Lambda ARN : ARN de la Lambda Alexa existante (`discipline-alexa`)
7. **Build skill**
8. Copier l'**Application ID** (`amzn1.ask.skill.XXX`) → variable d'env `SKILL_ID_SIGNAL_ROUGE`

> Aucun intent custom nécessaire — seul `LaunchRequest` est utilisé.

### Skill "Mes Signaux"

Mêmes étapes avec :
- **Skill name** : `Mes Signaux`
- **Invocation name** : `mes signaux`
- Même Lambda ARN
- Application ID → variable d'env `SKILL_ID_MES_SIGNAUX`

---

## Routine 6h00 — Signal rouge du jour

**Déclencheur :** Heure fixe — 6h00, tous les jours

**Actions :**
1. Alexa dit → *"Il est 6 heures."*
2. **Skills** → `Signal Rouge` → ouvrir le skill

> Alexa lit uniquement le signal critique du jour via `handleSignalRouge()`. Pas de réponse attendue.

---

## Routine 9h30 — Check conversationnel

**Déclencheur :** Heure fixe — 9h30, tous les jours

**Actions :**
1. Ouvrir le skill **Bilan Immo** → utterance : **"bilan du matin"**

> Alexa pose la question sur le signal rouge et attend une réponse oui/non.
> - **Oui** → "Bien. Continue."
> - **Non** → Alexa cite l'objectif émotionnel du profil lié et relance.

---

## Routine 18h00 — Bilan de fin de journée

**Déclencheur :** Heure fixe — 18h00, lundi au vendredi

**Actions (dans l'ordre) :**
1. Alexa dit → *"Il est 18 heures. C'est l'heure de clore ta journée."*
2. Ouvrir le skill **Bilan Immo** → utterance : **"bilan du soir"**

> Alexa lit les signaux du jour et pose une question Oui/Non par tâche.
> - **Oui** → tâche marquée `done` dans `discipline_tasks`
> - **Non** → tâche flaggée `reconduire: true` → signal rouge prioritaire le lendemain

---

## Routine 21h00 — Signaux du lendemain

**Déclencheur :** Heure fixe — 21h00, tous les jours

**Actions (modifier la routine existante) :**
1. *(Garder)* Message texte existant sur le coucher
2. **Skills** → `Mes Signaux` → ouvrir le skill

> Les signaux sont calculés par `discipline-pilotage-soir` à 20h et sauvegardés dans
> `discipline_signaux_soir`. La routine 21h les lit directement via `handleMesSignaux()`.

---

## Variables d'environnement Lambda

Ajouter dans la configuration Lambda Alexa (`discipline-alexa` ou équivalent) :

```
TABLE_SIGNAUX = discipline_signaux_soir
TABLE_PROFILS = discipline_profils
TABLE_TASKS   = discipline_tasks
```

---

## Mise à jour du message 21h

Exécuter une seule fois pour mettre à jour le message dans DynamoDB :

```bash
cd seeds
node update-message-21h.js
```

---

## Test manuel

```bash
# Vérifier les signaux du jour dans DynamoDB
aws dynamodb get-item \
  --table-name discipline_signaux_soir \
  --key '{"userId":{"S":"akambi"},"date":{"S":"2026-06-06"}}' \
  --region us-east-1

# Tester dans Alexa Developer Console → Test
# → "quels sont mes signaux"          (LireSignauxIntent)
# → "ma priorité du jour"             (AnnoncerSignalRougeIntent)
# → "bilan du matin" puis "oui"/"non" (CheckSignalRougeIntent)
```
