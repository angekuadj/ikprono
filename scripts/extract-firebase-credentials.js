#!/usr/bin/env node

/**
 * Script pour extraire les identifiants Firebase Admin d'un fichier JSON
 * et les formater pour les variables d'environnement Render.
 *
 * Usage: node scripts/extract-firebase-credentials.js <chemin/vers/service-account.json>
 */

const fs = require('fs');
const path = require('path');

if (process.argv.length < 3) {
  console.error('Usage: node scripts/extract-firebase-credentials.js <chemin/vers/service-account.json>');
  process.exit(1);
}

const jsonPath = process.argv[2];

if (!fs.existsSync(jsonPath)) {
  console.error(`Erreur: Le fichier ${jsonPath} n'existe pas.`);
  process.exit(1);
}

try {
  const serviceAccount = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  console.log('\n=== Variables d\'environnement pour Render ===\n');
  console.log(`FIREBASE_PROJECT_ID=${serviceAccount.project_id}`);
  console.log(`FIREBASE_CLIENT_EMAIL=${serviceAccount.client_email}`);
  console.log(`FIREBASE_PRIVATE_KEY="${serviceAccount.private_key.replace(/\n/g, '\\n')}"`);
  console.log('\n=============================================\n');
  console.log('Copiez ces trois lignes et ajoutez-les aux variables d\'environnement');
  console.log('de votre service Render (Dashboard → Environment).');
  console.log('\n⚠️  IMPORTANT: Ne commitez jamais le fichier JSON ni les clés privées !\n');
} catch (error) {
  console.error('Erreur lors de la lecture du fichier JSON:', error.message);
  process.exit(1);
}
