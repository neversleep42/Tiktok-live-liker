# TikTok LIVE Like Assistant

Extension Chrome (Manifest V3) qui facilite l'envoi de likes pendant un
TikTok LIVE regardé sur desktop : touche à maintenir, contrôle flottant,
compteur de session et mode simulation sans action réelle.

> ⚠️ **AVERTISSEMENT IMPORTANT — RISQUE DE BANNISSEMENT**
>
> TikTok peut considérer l'envoi automatisé ou assisté de likes comme une
> violation de ses conditions d'utilisation. Utiliser cette extension
> expose votre compte TikTok à des sanctions : limitation, suspension ou
> **bannissement définitif**. En installant et en utilisant cette
> extension, **vous acceptez ce risque et l'assumez entièrement**.
> L'auteur décline toute responsabilité en cas de sanction appliquée à
> votre compte.

## Comment ça fonctionne

1. **Détection du LIVE** : le content script vérifie que l'onglet est un
   TikTok LIVE (URL `/@pseudo/live` et/ou preuve DOM `live-room` / player).
   Si la détection auto échoue, le popup propose une **activation
   manuelle** et un ciblage par **clic droit**.
2. **Tu vises, l'extension clique** : elle suit ton curseur. Quand tu
   maintiens la touche **L** (ou le bouton **Maintenir** du panneau
   flottant), elle rejoue un **double-clic** là où tu vises dans le LIVE —
   c'est le geste natif TikTok sur PC (il n'y a pas de bouton cœur sur
   web). Les zones avatar / profil / follow sont **exclues** : on ne like
   jamais la créatrice à la place du LIVE.
3. **Insensible au layout** : vidéo plein écran comme grille audio
   d'invités, la cible de repli est la racine du LIVE. Quand l'hôte change
   la disposition, l'ancienne cible est oubliée automatiquement.
4. **Arrêt immédiat** : relâchement de la touche/bouton, changement
   d'onglet, page cachée, perte de focus, sortie du LIVE ou désactivation
   → tout s'arrête aussitôt (contrôleur de visibilité + `MutationObserver`
   sans polling agressif).
5. **Compteur de session** : compte les envois **déclenchés**, pas les
   likes confirmés par TikTok. Conservé en mémoire par onglet, remis à
   zéro au changement de LIVE, rechargement ou réinitialisation manuelle.

## Installation

Prérequis : Node.js récent (20.19+, 22.12+ ou 24+) et Chrome/Chromium.

```bash
npm install
npm test
npm run build
```

Charger l'extension :

1. Ouvrir `chrome://extensions`.
2. Activer le **Mode développeur**.
3. Cliquer **Charger l'extension non empaquetée**.
4. Sélectionner le dossier `dist/` généré par le build.

> Après chaque `npm run build` : bouton reload sur `chrome://extensions`,
> puis **F5 obligatoire** sur chaque onglet TikTok déjà ouvert (sinon
> erreur `Extension context invalidated`).

## Utilisation

1. Ouvrir un LIVE : `https://www.tiktok.com/@createur/live`.
2. Si le popup dit `Aucun LIVE détecté` : cliquer **Activer ici**, ou
   **clic droit sur la zone du LIVE → ♥ Utiliser comme cible**
   (jamais sur un avatar).
3. Placer le curseur sur la **zone du LIVE** (pas sur une tuile invitée).
4. **Simulation ON** (défaut) : maintenir **L** → `+1` locaux + compteur,
   aucun like réel. **Simulation OFF** : mode réel, voir limites ci-dessous.
5. Relâcher pour arrêter. Le panneau flottant se réduit via le chevron `˅`.

Réglage **Puissance · cadence** (Doux / Équilibré / Intense) : intervalles
150–1000 ms entre deux envois pendant le maintien. Cadence fixe choisie
par l'utilisateur, sans imitation de comportement humain.

## Limites actuelles (à lire avant usage)

- **Événements synthétiques** : l'extension rejoue des événements
  `pointer/mouse/dblclick` avec `isTrusted === false`. TikTok peut les
  **ignorer** ; aucun envoi n'est confirmé. Le compteur = envois
  déclenchés, pas likes validés — un écart avec le compteur TikTok est
  normal (déduplication / rate-limit côté serveur).
- **Pas de bouton cœur sur PC** : le like passe par double-clic sur la
  zone du LIVE. Viser un avatar like la personne, pas le LIVE — d'où
  l'exclusion des avatars et la visée curseur.
- **Le popup se ferme** dès qu'il perd le focus (limite Chrome) : suivre
  le compteur sur le **panneau flottant** dans la page.
- **Layouts changeants** : si l'hôte modifie la disposition, re-viser la
  zone du LIVE ; la cible périmée est oubliée automatiquement.
- **Pas de fonctionnement autonome** : pas de likes en arrière-plan, onglet
  inactif ou sans maintien de l'utilisateur. Pas de contournement
  anti-bot, pas d'API TikTok privée, pas de `chrome.debugger`, pas de
  backend ni de collecte de données (voir `PRD — TikTok LIVE Like
  Assistant Chrome Extension.md`, §5 et §38).

## Vie privée

Permissions minimales : `storage` (réglages locaux) et hôte
`https://www.tiktok.com/*` (content script). `contextMenus` pour
l'option « Utiliser comme cible ». Aucune donnée personnelle collectée,
rien n'est envoyé à un serveur.

## Scripts

```text
npm run dev         Vite/CRXJS en développement
npm run build       vérification TypeScript + build dans dist/
npm test            tests Vitest
npm run test:watch
```

## Licence

Licence Propriétaire Source-Disponible v1.0 — voir [LICENSE](./LICENSE).
Fork et modifications autorisés **à usage non commercial uniquement**,
avec crédit obligatoire à **neversleep42** et lien vers le dépôt
d'origine : https://github.com/neversleep42/Tiktok-live-liker.
