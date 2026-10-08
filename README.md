# TikTok LIVE Like Assistant

Extension Chrome (Manifest V3) qui facilite l'envoi de likes pendant un
TikTok LIVE regardé sur desktop : touche à maintenir, contrôle flottant,
compteur de session, modes manuel et automatique, et simulation sans action réelle.

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
2. **Ciblage** : maintien de **L** ou du bouton **Maintenir** pour envoyer
   un clic sur le bouton cœur du LIVE, ou un double-clic sur une zone vidéo.
   En mode réel, le service worker utilise le protocole de débogage Chrome
   pour produire une interaction navigateur acceptée par la page.
   Le ciblage par clic droit accepte aussi les zones sans rôle bouton.
   Les zones avatar / profil / follow identifiées sont exclues.
3. **Contrôle enfant** : le bouton dédié au LIVE et la vidéo sont ciblés
   avant leur conteneur. L'extension ne clique plus la racine générale du
   LIVE en repli. Si aucune cible n'est trouvée, sélectionner la zone qui
   réagit à un like manuel via **clic droit → Utiliser comme cible**.
4. **Mode automatique** : sélectionner Automatique dans le popup ou le panneau,
   puis cliquer **Démarrer** dans le LIVE (ou appuyer sur **L**). Les envois
   continuent sans maintien. **Arrêter**, **L** ou **Échap** coupe la boucle.
   Le démarrage reste explicite à chaque session.
5. **Arrêt immédiat** : relâchement de la touche/bouton en mode manuel, changement
   d'onglet, page cachée, perte de focus, sortie du LIVE ou désactivation
   → tout s'arrête aussitôt (contrôleur de visibilité + `MutationObserver`
   sans polling agressif).
6. **Compteur de session** : compte les envois **déclenchés**, pas les
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
4. Choisir **Manuel** : maintenir **L** ou le bouton, relâcher pour arrêter.
   Le bouton **+1** déclenche une seule interaction.
5. Choisir **Automatique** : cliquer **Démarrer** dans le panneau du LIVE,
   puis **Arrêter** pour couper. **L** alterne marche/arrêt, **Échap** arrête.
   Ce mode utilise la cible sélectionnée ou la zone du LIVE, sans suivre la souris.
6. **Simulation ON** (défaut) : uniquement des `+1` locaux, aucun like réel.
   Cliquer **Activer les likes réels** dans le panneau, ou désactiver
   **Mode simulation** dans le popup. Changer ce réglage arrête les envois
   mais conserve le compteur de session.
   Changer le mode manuel/automatique arrête aussi les envois en cours.
7. Le panneau se réduit via `˅` ; en automatique actif, **Arrêter** reste accessible.

Réglage **Puissance · cadence** : intervalles de **100 à 1500 ms**, soit de
**0,7 à 10 tentatives par seconde**, dans les deux modes. Préréglages **Doux**
(650 ms), **Normal** (250 ms) et **Rapide** (100 ms), accessibles aussi dans le
panneau. La cadence change pendant l’exécution sans redémarrage ni boucle
supplémentaire. Les réglages des installations existantes sont conservés ;
les nouvelles installations utilisent Normal en mode manuel.

La cadence est un objectif d’envoi, pas un nombre de likes validés par TikTok.
Le contrôleur attend la réponse de Chrome avant de compter l’envoi et de
programmer le suivant. Le temps d’envoi est déduit de l’intervalle : si Chrome
ralentit, aucun clic ne s’accumule dans une file d’attente. À l’arrêt, les envois
non commencés sont annulés ; un clic déjà pressé est relâché proprement.

### Mise à jour 0.3.1

Charger le dossier `dist/` reconstruit ou extraire `release/live-like-0.3.1.zip`.
Recharger l’extension dans `chrome://extensions`, puis les onglets TikTok.
Vérifier **0.3.1** dans le panneau. Pour envoyer rapidement : **Activer les likes
réels → Rapide → Automatique → Démarrer**. Le mode simulation reste explicite.
Le maintien au bouton n’est plus interrompu par les clics produits sur le LIVE.
La disparition de la vidéo est également détectée lorsqu’elle sert de cible.

Validation locale du 8 octobre 2026 : 118 tests Vitest, vérification TypeScript
et build Vite réussis. Extension chargée dans Chromium sur une fixture locale :
environ 9,3 envois/s pour Rapide, maintien souris et L, arrêt Échap,
double-clic vidéo, cible absente et popup vérifiés. Le signal de perte de focus
est injecté dans ce test headless ; les gardes de visibilité sont aussi testées
unitairement. Rendus inspectés à 1280 px et 390 px. Aucun lint n’est configuré.
L’acceptation des likes sur un véritable LIVE TikTok reste à vérifier.

## Limites actuelles (à lire avant usage)

- **Validation TikTok** : le mode réel utilise `chrome.debugger` pour envoyer
  l'interaction au navigateur. Chrome affiche donc son avertissement de
  débogage pendant l'exécution. TikTok peut encore dédupliquer ou limiter les
  interactions ; le compteur = envois
  déclenchés, pas likes validés — un écart avec le compteur TikTok est
  normal (déduplication / rate-limit côté serveur).
- **Cible variable** : les contrôles du site peuvent changer. Vérifier
  d'abord qu'un clic manuel sur la cible produit un like. Les tests locaux
  valident la réception des événements DOM, pas leur acceptation par TikTok.
- **Le popup se ferme** dès qu'il perd le focus (limite Chrome) : suivre
  le compteur sur le **panneau flottant** dans la page.
- **Layouts changeants** : si l'hôte modifie la disposition, re-viser la
  zone du LIVE ; la cible périmée est oubliée automatiquement.
- **Automatique au premier plan** : les likes continuent sans maintien après
  Démarrer, uniquement dans le LIVE visible et avec le focus. Changer d’onglet,
  quitter le LIVE ou perdre le focus arrête la boucle, sans reprise automatique.
  Pas d'API TikTok privée, pas de backend ni de collecte de données.
  Le PRD historique décrit la première
  version limitée au maintien ; ce README décrit les deux modes actuels.

## Vie privée

Permissions : `storage` (réglages locaux), `debugger` (clics navigateur) et hôte
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
