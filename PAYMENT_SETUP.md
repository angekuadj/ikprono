# Configuration des paiements Flutterwave

Ce document explique comment configurer les différentes méthodes de paiement supportées par Flutterwave pour IkProno.

## Méthodes de paiement supportées

L'application Flutterwave supporte nativement les méthodes suivantes en Afrique de l'Ouest :

- **MTN Mobile Money** : Disponible dans plusieurs pays (Côte d'Ivoire, Ghana, Nigeria, Ouganda, Rwanda, etc.)
- **Orange Money** : Disponible en Côte d'Ivoire, Sénégal, Mali, Guinée, etc.
- **WAVE** : Solution de paiement mobile spécifique au Sénégal
- **Moov** : Disponible au Bénin, Togo, Côte d'Ivoire
- **Carte bancaire** : Visa, Mastercard, etc.

## Configuration requise

### 1. Clés API Flutterwave

Assurez-vous que les variables d'environnement suivantes sont configurées dans votre fichier `.env` :

```env
# Clé publique (visible par le navigateur - normal)
NEXT_PUBLIC_FLW_PUBLIC_KEY=FLWPUBK_TEST-XXXXX

# Clé secrète (NE JAMAIS exposer - côté serveur uniquement)
FLW_SECRET_KEY=FLWSECK_TEST-XXXXX

# Clé de chiffrement (optionnel, pour paiements par carte directs)
FLW_ENCRYPTION_KEY=FLWSECK_TEST-XXXXX

# Webhook hash (voir section 3)
FLW_WEBHOOK_HASH=
```

### 2. Activation des providers dans le tableau de bord Flutterwave

Pour activer chaque méthode de paiement, vous devez configurer votre compte Flutterwave :

1. Connectez-vous à [Flutterwave Dashboard](https://dashboard.flutterwave.com/)
2. Allez dans **Settings** → **Payment Methods**
3. Activez les providers suivants selon vos pays cibles :

#### MTN Mobile Money
- Activez "MTN Mobile Money"
- Configurez les pays où vous opérez (Côte d'Ivoire, Ghana, etc.)
- Fournissez vos credentials MTN si nécessaire

#### Orange Money
- Activez "Orange Money"
- Configurez les pays (Côte d'Ivoire, Sénégal, Mali, Guinée)
- Fournissez vos credentials Orange

#### WAVE (Sénégal)
- Activez "WAVE"
- Configurez spécifiquement pour le Sénégal
- Fournissez vos credentials WAVE

#### Moov
- Activez "Moov"
- Configurez pour le Bénin, Togo ou Côte d'Ivoire
- Fournissez vos credentials Moov

#### Carte bancaire
- Activez "Card Payments"
- Configurez Visa et Mastercard
- Assurez-vous que 3D Secure est activé pour la sécurité

### 3. Configuration du Webhook

Pour recevoir les notifications de paiement automatiquement :

1. Dans le tableau de bord Flutterwave, allez dans **Settings** → **Webhooks**
2. Ajoutez l'URL de votre webhook : `https://votre-domaine.com/api/webhooks/flutterwave`
3. Sélectionnez les événements à surveiller :
   - `charge.success` (paiement réussi)
   - `transfer.success` (si vous faites des remboursements)
4. Copiez le `verif-hash` généré et ajoutez-le à votre `.env` :

```env
FLW_WEBHOOK_HASH=votre_verif_hash_ici
```

Le webhook est déjà implémenté dans `src/app/api/webhooks/flutterwave/route.ts`.

### 4. Passage en production

Pour passer de l'environnement de test à la production :

1. Dans le tableau de bord Flutterwave, passez en mode **Live**
2. Récupérez les nouvelles clés (remplacez `TEST` par `LIVE`)
3. Mettez à jour votre `.env` :

```env
# Production
NEXT_PUBLIC_FLW_PUBLIC_KEY=FLWPUBK_LIVE-votre-clé-publique
FLW_SECRET_KEY=FLWSECK_LIVE-votre-clé-secrète
FLW_ENCRYPTION_KEY=FLWSECK_LIVE-votre-clé-chiffrement
FLW_WEBHOOK_HASH=votre-verif-hash-production
```

4. Redéployez votre application

## Fonctionnement dans l'application

### Interface utilisateur

La page de paiement (`src/app/payment/page.tsx`) affiche automatiquement les options de paiement disponibles. Lorsqu'un utilisateur clique sur "S'abonner", la modale Flutterwave s'ouvre avec :

- **Carte bancaire** : Visa, Mastercard
- **Mobile Money** : MTN, Orange, WAVE, Moov (selon le pays détecté)
- **USSD** : Paiement par code USSD
- **Virement bancaire** : Option alternative

### Flux de paiement

1. L'utilisateur sélectionne une offre et clique sur "S'abonner"
2. Le serveur crée une intention de paiement dans Firestore (`/api/checkout/start`)
3. La modale Flutterwave s'ouvre avec les options configurées
4. L'utilisateur choisit sa méthode de paiement (MTN, Orange, WAVE, Moov, carte, etc.)
5. Après paiement, Flutterwave redirige vers le callback
6. Le serveur vérifie la transaction avec Flutterwave (`/api/checkout/verify`)
7. Si validé, l'offre est activée pour l'utilisateur

### Sécurité

- Le montant et l'offre sont fixés par le serveur, jamais par le client
- La clé secrète ne quitte jamais le serveur
- Chaque transaction est vérifiée auprès de Flutterwave avant activation
- Le webhook utilise un hash de signature pour éviter les requêtes falsifiées

## Dépannage

### Les options de paiement n'apparaissent pas

- Vérifiez que les providers sont activés dans le tableau de bord Flutterwave
- Assurez-vous que votre compte Flutterwave est vérifié
- Certains providers nécessitent une approbation manuelle

### Erreur "Payment not configured"

- Vérifiez que `FLW_SECRET_KEY` est défini dans votre `.env`
- Redémarrez le serveur après avoir modifié les variables d'environnement

### Paiement réussi mais offre non activée

- Vérifiez les logs du serveur pour les erreurs de vérification
- Assurez-vous que le webhook est correctement configuré
- Vérifiez que Firebase Admin est correctement configuré

### Webhook non reçu

- Vérifiez que l'URL du webhook est accessible publiquement
- Assurez-vous que `FLW_WEBHOOK_HASH` correspond à celui du tableau de bord
- Vérifiez les logs Flutterwave pour les tentatives d'envoi

## Ressources

- [Documentation Flutterwave](https://developer.flutterwave.com/docs)
- [Inline Payment Documentation](https://developer.flutterwave.com/docs/inline-payments)
- [Mobile Money Providers](https://developer.flutterwave.com/docs/momo-payments)
