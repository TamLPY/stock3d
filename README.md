# Stock 3D — version synchronisée

Cette version fonctionne sur téléphone, tablette et ordinateur. Toutes les opérations sont enregistrées dans une base Supabase et propagées en temps réel aux autres appareils connectés.

## Mise en ligne

### 1. Créer la base Supabase

1. Créer un projet sur Supabase.
2. Ouvrir **SQL Editor**.
3. Copier-coller tout le fichier `supabase/schema.sql`, puis cliquer sur **Run**.
4. Dans **Authentication > Providers > Email**, laisser le fournisseur Email activé.
5. Dans **Project Settings > API**, relever :
   - Project URL ;
   - clé publique `anon` / `publishable`.

### 2. Configurer l’application

Ouvrir `config.js` et remplacer les deux valeurs :

```js
window.STOCK3D_CONFIG = {
  supabaseUrl: "https://VOTRE-PROJET.supabase.co",
  supabaseAnonKey: "VOTRE_CLE_ANON_PUBLIQUE"
};
```

La clé publique peut être présente dans le navigateur. Ne jamais utiliser la clé `service_role`.

### 3. Héberger

Le dossier est un site statique. Il peut être déposé sur Vercel, Netlify, Cloudflare Pages ou un hébergement classique. Sur Vercel : créer un nouveau projet puis importer le dossier, sans commande de build particulière.

## Première connexion

Sur la page de connexion, saisir une adresse e-mail et un mot de passe puis cliquer sur **Créer un compte**. Selon les paramètres Supabase, un e-mail de confirmation pourra être envoyé.

## Synchronisation

Les tables `products`, `stock_movements`, `categories` et `technicians` sont configurées pour Supabase Realtime. Une sortie effectuée sur téléphone actualise automatiquement les autres appareils ouverts.

## Sécurité

- L’accès aux données exige une connexion.
- Les règles RLS refusent les utilisateurs non authentifiés.
- Une sortie et la diminution du stock sont exécutées dans une transaction SQL unique.
- Une sortie supérieure au stock disponible est refusée.

## Installation sur téléphone

Une fois le site ouvert dans Chrome ou Safari, utiliser **Ajouter à l’écran d’accueil**. L’application s’ouvrira ensuite comme une application classique.
