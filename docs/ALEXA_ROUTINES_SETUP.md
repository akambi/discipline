# Alexa Routines Setup — Discipline Touchpoints

## Vue d'ensemble

Cinq routines pilotent les touchpoints Alexa du système Discipline :

| Heure | Routine | Skill |
|-------|---------|-------|
| 6h00  | Signal rouge du jour (LaunchRequest) | **Discipline Signal Rouge** |
| 9h30  | Check conversationnel oui/non | **Discipline Check Matin** |
| 18h00 | Bilan de fin de journée | **Discipline Bilan Soir** |
| 21h00 | Signaux du lendemain (LaunchRequest) | **Discipline Mes Signaux** |
| Lun/Mer/Ven matin | Bilan hebdo / mensuel | **Bilan Immo** → `LaunchRequest` |

---

## Skills Alexa (création manuelle — console Alexa Developer)

Tous les skills pointent vers la même Lambda ARN (`alexa-coaching-immo-bilan-semaine`).
Aucun intent custom nécessaire — seul `LaunchRequest` est utilisé pour les 4 skills discipline.

### Skill "Discipline Signal Rouge"

1. Alexa Developer Console → **Create Skill**
2. **Skill name** : `Discipline Signal Rouge`
3. **Primary locale** : French (CA)
4. **Model** : Custom — **Hosting** : Provision your own
5. **Invocation name** : `discipline signal rouge`
6. **Endpoint** → Lambda ARN : ARN de la Lambda Alexa existante
7. **Build skill**
8. Copier l'**Application ID** → variable d'env `SKILL_ID_SIGNAL_ROUGE`

### Skill "Discipline Mes Signaux"

Mêmes étapes avec :
- **Skill name** : `Discipline Mes Signaux`
- **Invocation name** : `discipline mes signaux`
- Application ID → variable d'env `SKILL_ID_MES_SIGNAUX`

### Skill "Discipline Check Matin"

Mêmes étapes avec :
- **Skill name** : `Discipline Check Matin`
- **Invocation name** : `discipline check matin`
- Application ID → variable d'env `SKILL_ID_CHECK_MATIN`

### Skill "Discipline Bilan Soir"

Mêmes étapes avec :
- **Skill name** : `Discipline Bilan Soir`
- **Invocation name** : `discipline bilan soir`
- Application ID → variable d'env `SKILL_ID_BILAN_SOIR`

---

## Variables d'environnement Lambda (complètes)

```
SKILL_ID_SIGNAL_ROUGE  = amzn1.ask.skill.XXX
SKILL_ID_MES_SIGNAUX   = amzn1.ask.skill.XXX
SKILL_ID_CHECK_MATIN   = amzn1.ask.skill.XXX   ← nouveau
SKILL_ID_BILAN_SOIR    = amzn1.ask.skill.XXX   ← nouveau
TABLE_SIGNAUX          = discipline_signaux_soir
TABLE_PROFILS          = discipline_profils
TABLE_TASKS            = discipline_tasks
```

---

## Routine 6h00 — Signal rouge du jour

**Déclencheur :** Heure fixe — 6h00, tous les jours

**Actions :**
1. Alexa dit → *"Il est 6 heures."*
2. **Skills** → `Discipline Signal Rouge` → ouvrir le skill

> Alexa lit uniquement le signal critique du jour via `handleSignalRouge()`. Pas de réponse attendue.

---

## Routine 9h30 — Check matin

**Déclencheur :** Heure fixe — 9h30, lundi au vendredi

**Actions :**
1. **Skills** → `Discipline Check Matin` → ouvrir le skill

> Alexa pose la question personnalisée sur le signal rouge et attend une réponse oui/non.
> - **Oui** → "Bien. Continue."
> - **Non** → Alexa cite l'objectif émotionnel du profil lié et relance.

---

## Routine 18h00 — Bilan du soir

**Déclencheur :** Heure fixe — 18h00, lundi au vendredi

**Actions (dans l'ordre) :**
1. Alexa dit → *"Il est 18 heures. C'est l'heure de clore ta journée."*
2. **Skills** → `Discipline Bilan Soir` → ouvrir le skill

> Alexa pose les 3 questions de bilan une par une (oui/non par tâche).
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
# → "ouvre discipline signal rouge"   → lit le signal rouge passif
# → "ouvre discipline check matin"    → pose la question oui/non sur le signal rouge
# → "ouvre discipline bilan soir"     → démarre le bilan avec la première tâche
# → "ouvre discipline mes signaux"    → lit les 3 signaux du lendemain
```
