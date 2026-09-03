# PRD — TikTok LIVE Like Assistant Chrome Extension

## 1. Informations générales

**Nom de travail :** TikTok LIVE Like Assistant  
**Type de produit :** Extension Google Chrome  
**Version :** MVP v1  
**Plateforme :** Google Chrome / navigateurs Chromium compatibles Manifest V3  
**Stack principale :**

- TypeScript
- React
- Vite
- Chrome Extension Manifest V3
- CSS
- Chrome Extensions APIs

Aucun backend n’est nécessaire pour le MVP.

---

# 2. Vision produit

TikTok LIVE Like Assistant est une extension Chrome destinée à simplifier l’interaction manuelle avec les lives TikTok depuis un navigateur desktop.

L’extension doit permettre à l’utilisateur de déclencher plus facilement des actions de like pendant qu’il regarde un TikTok LIVE, grâce à :

- un raccourci clavier ;
- un contrôle directement accessible depuis la page ;
- un compteur de session ;
- une interaction conditionnée à la présence active de l’utilisateur sur le LIVE.

L’extension ne doit pas chercher à se faire passer artificiellement pour un utilisateur humain afin de contourner des systèmes anti-bot ou des limitations de TikTok.

---

# 3. Problème

Sur desktop, liker régulièrement un TikTok LIVE peut demander des interactions répétitives avec l’interface TikTok.

Le produit cherche uniquement à réduire cette friction.

L’utilisateur doit rester à l’origine de l’interaction.

L’extension agit donc comme une couche d’assistance au-dessus de l’interface TikTok existante.

---

# 4. Objectif du MVP

Permettre à un utilisateur présent sur un TikTok LIVE de déclencher facilement des interactions de like depuis son clavier ou depuis un contrôle léger intégré dans la page.

Le MVP doit :

1. reconnaître qu’une page TikTok LIVE est ouverte ;
2. identifier la zone interactive nécessaire au fonctionnement de l’extension ;
3. permettre à l’utilisateur de déclencher une action depuis un raccourci ;
4. permettre un mode d’interaction maintenue ;
5. arrêter immédiatement les interactions lorsque l’utilisateur arrête son action ;
6. arrêter les interactions lorsque l’onglet n’est plus actif ;
7. afficher le nombre d’actions effectuées pendant la session ;
8. proposer un mode de simulation visuelle pour tester l’extension sans envoyer de vrais likes.

---

# 5. Non-objectifs

Le MVP ne doit pas inclure :

- système de contournement anti-bot ;
- mécanisme destiné à rendre l’automatisation indétectable ;
- fingerprint spoofing ;
- modification du navigateur pour masquer l’extension ;
- utilisation d’API TikTok privées ou non documentées ;
- authentification TikTok automatisée ;
- collecte de comptes TikTok ;
- gestion multi-comptes ;
- proxy rotation ;
- changement automatique d’IP ;
- CAPTCHA bypass ;
- fonctionnement autonome sans présence utilisateur ;
- likes lancés lorsque l’onglet n’est pas actif ;
- fonctionnement permanent en arrière-plan ;
- scraping de données TikTok ;
- dashboard SaaS ;
- backend ;
- base de données distante ;
- analytics externes.

---

# 6. Utilisateur cible

Le MVP est destiné à une personne qui :

- utilise TikTok depuis Chrome ;
- regarde des TikTok LIVE ;
- souhaite faciliter ses interactions pendant un live ;
- reste devant son navigateur pendant l’utilisation de l’extension.

Le produit n’est pas conçu comme une plateforme d’automatisation massive.

---

# 7. User flow principal

## Étape 1 — Installation

L’utilisateur installe l’extension dans Chrome.

L’extension dispose uniquement des permissions nécessaires à son fonctionnement.

---

## Étape 2 — Ouverture d’un TikTok LIVE

L’utilisateur ouvre une page TikTok LIVE.

Le content script analyse la page et vérifie si le contexte correspond à un LIVE compatible.

---

## Étape 3 — Détection

Lorsque le LIVE est détecté :

- l’extension passe dans l’état `LIVE_DETECTED` ;
- les contrôles deviennent disponibles ;
- le bouton flottant peut apparaître ;
- le popup Chrome indique que le LIVE est prêt.

Si aucun LIVE n’est détecté :

`NO_LIVE_DETECTED`

---

# 8. Modes d’interaction

## 8.1 Action simple

Une action utilisateur déclenche une action de like.

Exemple :

```text
raccourci clavier
      ↓
interaction-controller
      ↓
validation contexte
      ↓
action
      ↓
session-counter +1
```

Le déclenchement ne doit fonctionner que lorsque :

- un LIVE est détecté ;
- l’onglet est visible ;
- la fenêtre est active ;
- l’utilisateur se trouve toujours sur la page concernée.

---

# 9. Mode maintien

L’utilisateur peut maintenir une touche ou un contrôle prévu à cet effet.

Exemple :

```text
keydown
   ↓
startInteraction()
   ↓
actions pendant maintien
   ↓
keyup
   ↓
stopInteraction()
```

Le relâchement du contrôle doit immédiatement arrêter l’interaction.

Aucune interaction ne doit continuer indépendamment de l’utilisateur.

---

# 10. Conditions d’arrêt

L’extension doit immédiatement arrêter une interaction active lorsque :

- la touche est relâchée ;
- le bouton est relâché ;
- l’utilisateur change d’onglet ;
- `document.visibilityState !== "visible"` ;
- la fenêtre perd le focus ;
- l’utilisateur quitte le TikTok LIVE ;
- l’élément nécessaire à l’interaction disparaît ;
- le content script détecte une navigation incompatible ;
- l’utilisateur désactive l’extension.

---

# 11. Bouton flottant

Un contrôle léger peut être injecté dans la page TikTok LIVE.

Il doit rester :

- discret ;
- compact ;
- facilement identifiable ;
- déplaçable uniquement si cela reste simple à implémenter dans le MVP.

Le contrôle doit permettre au minimum :

```text
LIKE
START / STOP
SESSION COUNT
```

L’interface ne doit pas modifier profondément l’apparence de TikTok.

---

# 12. Popup Chrome

Le popup de l’extension fournit une interface simple.

## Informations affichées

### Statut

```text
TikTok LIVE detected
```

ou :

```text
No TikTok LIVE detected
```

### Compteur

```text
Session interactions
124
```

### Activation

```text
Extension
ON / OFF
```

### Simulation

```text
Simulation mode
ON / OFF
```

Aucun dashboard complexe.

---

# 13. Compteur de session

L’extension maintient un compteur local des interactions déclenchées pendant la session.

Exemple :

```ts
interface SessionState {
  interactionCount: number;
  startedAt: number;
}
```

Le compteur n’a pas besoin d’être envoyé vers un serveur.

Le stockage peut utiliser :

```text
chrome.storage.local
```

ou rester uniquement en mémoire lorsque cela suffit.

---

# 14. Mode simulation

Le produit doit disposer d’un mode :

```text
SIMULATION
```

Ce mode permet de tester :

- les raccourcis ;
- les événements clavier ;
- le bouton flottant ;
- le compteur ;
- les zones d’interaction ;
- les animations visuelles ;
- les conditions start/stop.

Mais aucune action TikTok réelle ne doit être déclenchée.

Exemple :

```text
User interaction
       ↓
Interaction Controller
       ↓
Simulation Mode?
   ↙            ↘
 YES             NO
 ↓               ↓
visual feedback   real UI interaction
```

---

# 15. Indicateur visuel de simulation

Lorsque le mode simulation est actif, l’extension peut afficher un feedback local.

Par exemple :

```text
+1
```

ou une petite animation temporaire autour de la zone testée.

Cette animation appartient uniquement à l’extension.

Elle ne doit pas modifier les données TikTok.

---

# 16. Architecture fonctionnelle

Architecture cible :

```text
Chrome Extension
│
├── Content Script
│   │
│   ├── Live Detector
│   │
│   ├── Interaction Controller
│   │
│   ├── Visibility Controller
│   │
│   ├── Session Counter
│   │
│   └── Floating UI
│
├── Background Service Worker
│
├── Popup React
│
└── Shared
    ├── Types
    ├── Messages
    └── Constants
```

---

# 17. Structure de projet

```text
tiktok-live-like-assistant/
│
├── manifest.json
│
├── src/
│   │
│   ├── background/
│   │   └── service-worker.ts
│   │
│   ├── content/
│   │   ├── content-script.ts
│   │   ├── live-detector.ts
│   │   ├── interaction-controller.ts
│   │   ├── visibility-controller.ts
│   │   └── session-counter.ts
│   │
│   ├── components/
│   │   └── FloatingController.tsx
│   │
│   ├── popup/
│   │   ├── Popup.tsx
│   │   ├── main.tsx
│   │   └── popup.css
│   │
│   └── shared/
│       ├── constants.ts
│       ├── messages.ts
│       └── types.ts
│
├── public/
│   └── icons/
│
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

# 18. `live-detector`

Responsabilité unique :

déterminer si l’utilisateur se trouve actuellement dans un TikTok LIVE compatible.

Interface possible :

```ts
interface LiveDetector {
  isLivePage(): boolean;
  start(): void;
  stop(): void;
}
```

Le detector ne doit pas gérer :

- les raccourcis ;
- les likes ;
- le compteur ;
- l’UI.

---

# 19. `interaction-controller`

Responsabilité :

centraliser les interactions déclenchées par l’utilisateur.

```ts
interface InteractionController {
  trigger(): void;
  start(): void;
  stop(): void;
}
```

Avant chaque action, le controller vérifie les conditions nécessaires.

```ts
if (!liveDetected) return;
if (!document.hasFocus()) return;
if (document.visibilityState !== "visible") return;
```

---

# 20. `visibility-controller`

Responsabilité :

surveiller l’état actif du navigateur.

Événements :

```text
visibilitychange
focus
blur
```

Lorsque la page perd son état actif :

```ts
interactionController.stop();
```

---

# 21. `session-counter`

Responsabilité :

maintenir le nombre d’interactions déclenchées.

API :

```ts
increment()
reset()
getCount()
```

Il ne doit connaître ni TikTok ni le DOM.

---

# 22. Communication extension

Les différents contextes Chrome communiquent via :

```text
chrome.runtime.sendMessage
chrome.runtime.onMessage
```

Exemple :

```ts
type ExtensionMessage =
  | { type: "GET_STATUS" }
  | { type: "LIVE_DETECTED" }
  | { type: "SESSION_COUNT"; count: number }
  | { type: "ENABLE" }
  | { type: "DISABLE" };
```

---

# 23. État global minimal

```ts
interface ExtensionState {
  enabled: boolean;
  liveDetected: boolean;
  interacting: boolean;
  simulationMode: boolean;
  interactionCount: number;
}
```

Pas de state management externe nécessaire.

React state + Chrome storage suffisent.

---

# 24. Manifest V3

Le projet utilise :

```json
{
  "manifest_version": 3
}
```

Les permissions doivent rester minimales.

Conceptuellement :

```text
activeTab
storage
scripting
```

ainsi que les host permissions strictement nécessaires aux pages TikTok concernées.

---

# 25. Mutation du DOM

TikTok étant une application dynamique, le detector doit supporter les changements de DOM et la navigation côté client.

Lorsque nécessaire :

```text
MutationObserver
```

peut être utilisé afin de détecter :

- apparition du LIVE ;
- disparition du LIVE ;
- changement de contenu ;
- changement d’état de l’interface.

Le `MutationObserver` ne doit pas lancer directement d’actions.

Il sert uniquement à maintenir l’état du detector.

---

# 26. Séparation des responsabilités

Règle importante :

```text
Detection ≠ Interaction ≠ UI ≠ State
```

### Detection

Comprend l’état de la page.

### Interaction

Exécute l’action demandée.

### UI

Permet à l’utilisateur de contrôler le produit.

### State

Conserve l’état minimal nécessaire.

Cette séparation permet d’adapter l’extension si l’interface TikTok change.

---

# 27. UX/UI

Direction artistique :

- très minimaliste ;
- légère ;
- pas de dashboard ;
- pas de cartes inutiles ;
- interface compacte ;
- typographie système ou Inter ;
- icônes Lucide si nécessaire ;
- gris neutres ;
- une couleur d’accent maximum.

Références d’esprit :

- Linear ;
- Notion ;
- Attio ;
- Chrome native UI.

Sans copier directement leurs interfaces.

---

# 28. États UI

Le produit doit afficher clairement :

```text
DISABLED
```

```text
READY
```

```text
NO LIVE
```

```text
ACTIVE
```

```text
SIMULATION
```

---

# 29. Gestion des erreurs

Si l’extension ne parvient plus à identifier l’élément nécessaire :

```text
INTERACTION_TARGET_NOT_FOUND
```

L’interaction est arrêtée.

Pas de boucle agressive de retry.

Le detector peut ensuite réévaluer le DOM.

---

# 30. Navigation TikTok

TikTok utilise une navigation dynamique.

Le système doit donc détecter :

```text
LIVE → autre page TikTok
autre page TikTok → LIVE
LIVE A → LIVE B
```

sans exiger nécessairement un rechargement complet de la page.

---

# 31. Sécurité du contrôleur

Le contrôleur doit avoir un mécanisme central :

```ts
function canInteract(): boolean
```

qui vérifie au minimum :

```text
extension enabled
AND
live detected
AND
document visible
AND
window focused
AND
valid target
AND
user interaction active
```

Si une condition devient fausse :

```text
STOP
```

---

# 32. Performance

Le content script doit rester léger.

À éviter :

- polling DOM agressif ;
- boucles permanentes inutiles ;
- scan complet du DOM plusieurs fois par seconde ;
- grosses dépendances frontend ;
- re-renders React constants.

Préférer :

```text
event listeners
MutationObserver
state transitions
```

---

# 33. Vie privée

Le MVP ne collecte aucune donnée personnelle.

Aucune donnée n’est envoyée vers un serveur.

Les données de session restent locales.

Le produit ne doit pas collecter :

- identifiants TikTok ;
- cookies TikTok ;
- historique de navigation ;
- messages ;
- followers ;
- données privées du compte.

---

# 34. Tests

## Unit tests

À tester :

```text
LiveDetector
SessionCounter
VisibilityController
InteractionController
State transitions
```

---

## Integration tests

Tester :

```text
keydown → action
keyup → stop

blur → stop

visibility hidden → stop

LIVE removed → stop

simulation → aucune action réelle
```

---

# 35. Cas critiques

### Cas 1

L’utilisateur maintient la commande puis change d’onglet.

Résultat attendu :

```text
interaction stops immediately
```

### Cas 2

Le LIVE disparaît.

Résultat :

```text
interaction stops
liveDetected = false
```

### Cas 3

L’élément DOM attendu change.

Résultat :

```text
interaction stops
detector attempts rediscovery
```

### Cas 4

Simulation activée.

Résultat :

```text
visual interaction
counter increment
no real TikTok interaction
```

---

# 36. Critères d’acceptation MVP

Le MVP est considéré fonctionnel lorsque :

- l’extension peut être chargée via Chrome Developer Mode ;
- TikTok LIVE est correctement détecté ;
- le popup affiche l’état du LIVE ;
- le bouton flottant apparaît dans le contexte prévu ;
- le raccourci utilisateur déclenche l’action prévue ;
- le mode maintien fonctionne ;
- le relâchement arrête immédiatement l’action ;
- le changement d’onglet arrête immédiatement l’action ;
- la perte de focus arrête immédiatement l’action ;
- le compteur de session fonctionne ;
- le mode simulation fonctionne ;
- aucune interaction réelle n’est produite en simulation ;
- aucune API TikTok privée n’est utilisée ;
- aucune infrastructure backend n’est nécessaire.

---

# 37. Périmètre technique final

```text
Browser
└── Chrome Extension MV3
    ├── React popup
    ├── TypeScript content scripts
    ├── background service worker
    ├── TikTok LIVE detector
    ├── user interaction controller
    ├── visibility safety controller
    ├── local session counter
    ├── floating control
    └── simulation mode
```

---

# 38. Principe produit à conserver

Le produit est :

> une couche d’assistance entre l’utilisateur et l’interface TikTok LIVE.

Il n’est pas conçu comme :

> un robot autonome chargé d’imiter un utilisateur ou de contourner les systèmes de protection de TikTok.

Toutes les évolutions futures doivent conserver cette séparation.