# Alexa Routines Setup — Discipline Touchpoints

## Vue d'ensemble

Un seul skill **"Discipline"** gère les 4 plages horaires du système.
Le `LaunchRequestHandler` route automatiquement selon l'heure locale de Montréal (UTC-4).

| Heure locale Montréal | Comportement | Handler |
|-----------------------|--------------|---------|
| 06h00 – 08h59 | Signal rouge passif — annonce la priorité du jour | `handleSignalRouge` |
| 09h00 – 16h59 | Check conversationnel — "As-tu fait [tâche] ?" oui/non | `handleCheckMatin` |
| 17h00 – 19h59 | Bilan du soir — 3 questions oui/non sur les tâches | `handleBilanSoir` |
| 20h00 – 23h59 | Lecture des 3 signaux du lendemain | `handleMesSignaux` |
| 00h00 – 05h59 | Message par défaut — "Il est trop tôt, va dormir." | — |

| Jours Lun/Mer/Ven matin | Bilan hebdo / mensuel | **Bilan Immo** → `LaunchRequest` |

---

## Skill Alexa (création manuelle — console Alexa Developer)

Le skill pointe vers la même Lambda ARN (`alexa-coaching-immo-bilan-semaine`).
Aucun intent custom nécessaire — uniquement `LaunchRequest` est utilisé.

### Skill "Discipline"

1. Alexa Developer Console → **Create Skill**
2. **Skill name** : `Discipline`
3. **Primary locale** : French (CA)
4. **Model** : Custom → **Hosting** : Provision your own
5. **Invocation name** : `discipline`
6. **Endpoint** → Lambda ARN : ARN de la Lambda Alexa existante
7. **Build skill**
8. Copier l'**Application ID** → variable d'env `SKILL_ID_DISCIPLINE`

---

## Variables d'environnement Lambda (complètes)

```
SKILL_ID_DISCIPLINE    = amzn1.ask.skill.XXX   ← nouveau skill unique
SKILL_ID_BILAN_IMMO    = amzn1.ask.skill.XXX
TABLE_SIGNAUX          = discipline_signaux_soir
TABLE_PROFILS          = discipline_profils
TABLE_TASKS            = discipline_tasks
```

Variables supprimées :
```
# SKILL_ID_SIGNAL_ROUGE  ← supprimée
# SKILL_ID_MES_SIGNAUX   ← supprimée
# SKILL_ID_CHECK_MATIN   ← supprimée
# SKILL_ID_BILAN_SOIR    ← supprimée
```

---

## Routine 6h00 — Signal rouge du jour

**Déclencheur :** Heure fixe — 6h00, tous les jours

**Actions :**
1. **Skills** → `Discipline` → ouvrir le skill

> Heure 6h → `handleSignalRouge()` — Alexa lit uniquement le signal critique du jour. Pas de réponse attendue.

---

## Routine 9h30 — Check matin

**Déclencheur :** Heure fixe — 9h30, lundi au vendredi

**Actions :**
1. **Skills** → `Discipline` → ouvrir le skill

> Heure 9h → `handleCheckMatin()` — Alexa pose la question personnalisée sur le signal rouge et attend une réponse oui/non.
> - **Oui** → "Bien. Continue."
> - **Non** → Alexa cite l'objectif émotionnel du profil lié et relance.

---

## Routine 18h00 — Bilan du soir

**Déclencheur :** Heure fixe — 18h00, lundi au vendredi

**Actions (dans l'ordre) :**
1. Alexa dit → *"Il est 18 heures. C'est l'heure de clore ta journée."*
2. **Skills** → `Discipline` → ouvrir le skill

> Heure 17h → `handleBilanSoir()` — Alexa pose les 3 questions de bilan une par une (oui/non par tâche).
> - **Oui** → tâche marquée `done` dans `discipline_tasks`
> - **Non** → tâche flaggée `reconduire: true` → signal rouge prioritaire le lendemain

---

## Routine 21h00 — Signaux du lendemain

**Déclencheur :** Heure fixe — 21h00, tous les jours

**Actions (modifier la routine existante) :**
1. *(Garder)* Message texte existant sur le coucher
2. **Skills** → `Discipline` → ouvrir le skill

> Heure 20h → `handleMesSignaux()` — Les signaux calculés à 20h par `discipline-pilotage-soir` sont lus depuis `discipline_signaux_soir`.

---

## Test avec FORCE_HEURE

La variable d'env `FORCE_HEURE` permet de tester chaque plage sans attendre la bonne heure :

```
FORCE_HEURE=7   → teste signal rouge   (06h-08h)
FORCE_HEURE=10  → teste check matin    (09h-16h)
FORCE_HEURE=18  → teste bilan soir     (17h-19h)
FORCE_HEURE=21  → teste mes signaux    (20h-23h)
```

**Dans Alexa Developer Console → Test :**
1. Ajouter `FORCE_HEURE=7` dans les variables d'env Lambda
2. "ouvre discipline" → lit le signal rouge passif
3. Changer `FORCE_HEURE=10` → "ouvre discipline" → check matin
4. Retirer `FORCE_HEURE` avant la mise en production

---

## Test manuel DynamoDB

```bash
# Vérifier les signaux du jour dans DynamoDB
aws dynamodb get-item \
  --table-name discipline_signaux_soir \
  --key '{"userId":{"S":"akambi"},"date":{"S":"2026-06-06"}}' \
  --region us-east-1

# Tester dans Alexa Developer Console → Test
# → "ouvre discipline" à 6h   → lit le signal rouge passif
# → "ouvre discipline" à 9h30 → pose la question oui/non sur le signal rouge
# → "ouvre discipline" à 18h  → démarre le bilan avec la première tâche
# → "ouvre discipline" à 21h  → lit les 3 signaux du lendemain
```
