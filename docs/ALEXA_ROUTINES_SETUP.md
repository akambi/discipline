# Alexa Routines Setup — Discipline Touchpoints

## Vue d'ensemble

Trois routines pilotent les touchpoints Alexa du système Discipline :

| Heure | Routine | Intent déclenché |
|-------|---------|-----------------|
| 6h00  | Signal rouge du jour (passif) | `AnnoncerSignalRougeIntent` |
| 9h30  | Check conversationnel | `CheckSignalRougeIntent` |
| 21h00 | Signaux du lendemain (existante, modifiée) | `LireSignauxIntent` |

---

## Routine 6h00 — Signal rouge du jour

**Déclencheur :** Heure fixe — 6h00, tous les jours

**Actions (dans l'ordre) :**
1. Alexa dit → *"Il est 6 heures."*
2. Ouvrir le skill **Bilan Immo** → utterance : **"ma priorité du jour"**

> Alexa lit uniquement le signal critique. Pas de réponse attendue.

---

## Routine 9h30 — Check conversationnel

**Déclencheur :** Heure fixe — 9h30, tous les jours

**Actions :**
1. Ouvrir le skill **Bilan Immo** → utterance : **"bilan du matin"**

> Alexa pose la question sur le signal rouge et attend une réponse oui/non.
> - **Oui** → "Bien. Continue."
> - **Non** → Alexa cite l'objectif émotionnel du profil lié et relance.

---

## Routine 21h00 — Signaux du lendemain (modifier l'existante)

**Déclencheur :** Heure fixe — 21h00, tous les jours

**Actions (modifier la routine existante) :**
1. *(Garder)* Message texte existant sur le coucher
2. Ajouter : Ouvrir le skill **Bilan Immo** → utterance : **"quels sont mes signaux"**

> Les signaux sont calculés par `discipline-pilotage-soir` à 20h et sauvegardés dans
> `discipline_signaux_soir`. La routine 21h les lit directement.

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
