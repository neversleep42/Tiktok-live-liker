# TikTok LIVE Like Assistant

Extension Chrome Manifest V3 qui réduit la friction des interactions manuelles sur un TikTok LIVE. Elle fournit une touche à maintenir, un contrôle flottant, un compteur par session et un mode simulation sans action TikTok.

Le mode simulation est activé par défaut. Aucun backend, tracking, scraping ou appel à une API TikTok privée n’est utilisé.

## Démarrage

Prérequis : une version récente de Node.js (20.19+, 22.12+ ou 24+) et Chrome/Chromium.

```bash
npm install
npm test
npm run build
```

Pour charger l’extension :

1. Ouvrir `chrome://extensions`.
2. Activer **Mode développeur**.
3. Cliquer sur **Charger l’extension non empaquetée**.
4. Sélectionner le dossier `dist/` généré par le build.

`npm run dev` lance Vite/CRXJS en mode développement. Après une modification, rechargez l’extension depuis `chrome://extensions` si Chrome ne la met pas à jour automatiquement.

## Utilisation

1. Ouvrir une URL de la forme `https://www.tiktok.com/@createur/live`.
2. Vérifier le statut dans le popup de l’extension.
3. En simulation, maintenir la touche **L** ou le bouton **Maintenir** dans le contrôle flottant. Le feedback `+1` et le compteur sont locaux.
4. Relâcher la touche ou le bouton pour arrêter immédiatement.

Le bouton **+1 Like** déclenche une seule interaction. Le compteur correspond aux interactions simulées ou envoyées par l’extension, pas aux likes confirmés par TikTok. Il est conservé en mémoire pour l’onglet courant et remis à zéro lors d’un changement de LIVE, d’un rechargement ou d’une réinitialisation manuelle.

Le maintien est interrompu si la touche ou le pointeur est relâché, si la page devient invisible, si la fenêtre perd le focus, si l’utilisateur quitte le LIVE, si la cible change ou disparaît, si le mode change, ou si l’extension est désactivée.

## Mode réel : limite importante

Une extension MV3 avec des permissions minimales ne peut pas fabriquer un clic de souris approuvé par le navigateur. Le mode réel appelle uniquement `HTMLElement.click()` sur un contrôle visible et non ambigu ; cet événement est synthétique (`isTrusted === false`) et TikTok peut l’ignorer.

Avant toute utilisation du maintien en mode réel, effectuer un test manuel d’une seule action :

1. Rester sur un LIVE avec le contrôle de like TikTok visible.
2. Désactiver la simulation dans le popup.
3. Utiliser uniquement le bouton **+1 Like**.
4. Vérifier directement dans l’interface TikTok que l’action est acceptée.

Si TikTok refuse ce clic, le mode réel n’est pas compatible avec cette version de son interface. Le projet ne doit pas contourner cette limite avec `chrome.debugger`, des coordonnées automatisées, une API privée ou des techniques anti-détection.

## Architecture

```text
src/
├── background/       initialisation et mises à jour des réglages
├── components/       contrôle flottant React
├── content/          détection, interaction, visibilité et compteur
├── popup/            statut et réglages de l’extension
└── shared/           types, messages, constantes et stockage
```

- Le content script est injecté uniquement sur `https://www.tiktok.com/*`.
- Le service worker reste sans état de session : Chrome peut le suspendre à tout moment.
- Les réglages globaux `enabled` et `simulationMode` utilisent `chrome.storage.local`.
- L’état du LIVE, la cible, le maintien et le compteur restent propres à chaque onglet.
- Le contrôle flottant vit dans un Shadow DOM afin de ne pas modifier les styles de TikTok.
- Un `MutationObserver` débouncé suit le DOM ; il ne déclenche jamais d’interaction.

## Permissions et vie privée

Le manifeste demande seulement :

- `storage`, pour les deux réglages locaux ;
- l’accès hôte à `https://www.tiktok.com/*`, pour le content script.

L’extension ne collecte ni compte, cookie, message, follower, historique de navigation ou autre donnée personnelle. Rien n’est transmis à un serveur.

## Adaptation aux changements TikTok

Les sélecteurs DOM autorisés sont regroupés dans `src/shared/constants.ts`. La résolution échoue volontairement si aucune cible valide n’est trouvée ou si plusieurs candidats sont présents. Dans ce cas, le maintien s’arrête et l’interface affiche **Contrôle introuvable**.

Pour prendre en charge un nouveau layout :

1. Observer manuellement l’élément interactif visible sur un LIVE de test.
2. Préférer un attribut `data-e2e` stable ou un nom accessible exact.
3. Ajouter un fixture DOM anonymisé et son test avant le sélecteur.
4. Vérifier qu’une page non-LIVE et un layout ambigu restent bloqués.

Ne pas utiliser de classe générée, de coordonnées écran ou de recherche « premier bouton trouvé ».

## Vérification manuelle MVP

- Simulation : touche L, relâchement, bouton maintenu, bouton +1 et animation.
- Sécurité : changement d’onglet, perte de focus et masquage de page arrêtent le compteur.
- Navigation : LIVE → page TikTok, page TikTok → LIVE et LIVE A → LIVE B.
- DOM : suppression ou remplacement du contrôle de like pendant le maintien.
- Popup : activation, simulation, statuts, compteur et remise à zéro.
- Multi-onglets : chaque LIVE conserve sa propre session en mémoire.
- Mode réel : une seule action de faisabilité, jamais un scénario automatisé en production.

## Scripts

```text
npm run dev       Vite/CRXJS en développement
npm run build     vérification TypeScript + build dans dist/
npm test          tests Vitest
npm run test:watch
```
