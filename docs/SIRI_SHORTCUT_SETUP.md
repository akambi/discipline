# Raccourci Siri — Signal (capture de tâches)

Ce raccourci permet de dicter une tâche vocalement depuis iPhone et de l'envoyer automatiquement au moteur de priorisation Discipline.

## Prérequis

- iPhone avec iOS 16+
- App **Raccourcis** installée (native Apple)
- URL de l'API Gateway et clé API (`DISCIPLINE_API_KEY`) disponibles

---

## Étapes de configuration

### 1. Créer un nouveau raccourci

Ouvrir l'app **Raccourcis** → appuyer sur **+** (nouveau raccourci)

---

### 2. Ajouter l'action "Dicter du texte"

- Appuyer **Ajouter une action**
- Rechercher : **Dicter du texte**
- Langue : **Français**
- Laisser les autres options par défaut

---

### 3. Ajouter l'action "Obtenir le contenu de l'URL"

- Appuyer **+** pour ajouter une action
- Rechercher : **Obtenir le contenu de l'URL**
- Configurer comme suit :

| Champ    | Valeur |
|----------|--------|
| URL      | `https://{API_GATEWAY_URL}/tasks/capture` |
| Méthode  | `POST` |

**En-têtes :**

| Clé             | Valeur                           |
|-----------------|----------------------------------|
| Authorization   | `Bearer {DISCIPLINE_API_KEY}`    |
| Content-Type    | `application/json`               |

**Corps (JSON) :**

```json
{
  "userId": "aka",
  "content": "{Texte dicté}"
}
```

> Remplacer `{Texte dicté}` par la variable de sortie de l'action "Dicter du texte" (appuyer sur le champ et sélectionner la variable dans la liste).

---

### 4. Ajouter l'action "Afficher le résultat"

- Appuyer **+** → rechercher **Afficher le résultat** (ou **Notification**)
- Message : `Tâche capturée ✓`

> Optionnel : parser le JSON retourné pour afficher la catégorie et le profil lié.

---

### 5. Nommer et ajouter à l'écran d'accueil

1. Appuyer sur le nom du raccourci en haut → renommer en **Signal**
2. Appuyer sur l'icône → choisir une couleur et une icône (ex. icône microphone)
3. Appuyer **...** (3 points) → **Ajouter à l'écran d'accueil**

---

## Test

1. Appuyer sur le raccourci **Signal** depuis l'écran d'accueil
2. Dicter : *"Envoyer facture client Dupont avant vendredi"*
3. Vérifier la réponse JSON : `{ "success": true, "category": "admin", "profilLie": "achat_maison", ... }`

---

## Sécurité

- La clé API `DISCIPLINE_API_KEY` est stockée en clair dans le raccourci. Ne pas partager le raccourci exporté.
- Pour plus de sécurité, stocker la clé dans le trousseau iCloud via l'action **Obtenir le mot de passe du trousseau**.
