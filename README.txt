STOCK 3D — VERSION SANS CONNEXION

1. Dans Supabase > SQL Editor, ouvre le fichier :
   supabase/migration_sans_connexion.sql
   Copie tout, clique sur Run.

2. Sur GitHub, remplace les fichiers du projet par ceux de ce dossier :
   index.html, app.js, config.js, styles.css, manifest.webmanifest

3. Vercel redéploie automatiquement. Recharge ensuite :
   https://stock3d-three.vercel.app/

Aucun compte, aucun e-mail et aucun mot de passe ne sont nécessaires.
Les données déjà présentes dans Supabase sont conservées.

ATTENTION : toute personne disposant de l'adresse du site peut consulter et modifier le stock.

MISE À JOUR — LISTE DE COMMANDE AUTOMATIQUE
1. Dans Supabase > SQL Editor, exécuter une seule fois : supabase/migration_liste_commande.sql
2. Mettre ensuite les fichiers du projet à jour sur GitHub.
3. Pour chaque produit, renseigner :
   - Stock minimum : niveau qui déclenche l'apparition dans « À commander ».
   - Stock cible : niveau souhaité après réapprovisionnement.
4. La quantité recommandée est calculée automatiquement : Stock cible - Stock actuel.
