/**
 * Script pour définir un utilisateur Firebase comme administrateur.
 *
 * Usage:
 *   node scripts/set-admin.js <email>
 *
 * Exemple:
 *   node scripts/set-admin.js votre-email@gmail.com
 */

const admin = require('firebase-admin');
const serviceAccount = require('../service-account.local.json');

// Initialiser Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const USERS_COLLECTION = 'users';

async function setAdminRole(email) {
  try {
    console.log(`Recherche de l'utilisateur avec l'email: ${email}`);

    // Chercher l'utilisateur par email
    const snapshot = await db.collection(USERS_COLLECTION)
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.error(`❌ Aucun utilisateur trouvé avec l'email: ${email}`);
      console.log('\nAssurez-vous que:');
      console.log('1. Vous êtes connecté avec cet email sur l\'application');
      console.log('2. L\'utilisateur a déjà créé un compte (profil Firestore créé)');
      process.exit(1);
    }

    const doc = snapshot.docs[0];
    const userId = doc.id;
    const userData = doc.data();

    console.log(`✅ Utilisateur trouvé: ${userData.name} (${userId})`);
    console.log(`   Rôle actuel: ${userData.role || 'user'}`);

    // Mettre à jour le rôle
    await db.collection(USERS_COLLECTION).doc(userId).update({
      role: 'admin',
      plan: 'premium',
      updatedAt: new Date().toISOString()
    });

    console.log(`\n✅ L'utilisateur ${email} est maintenant administrateur!`);
    console.log(`   Rôle: admin`);
    console.log(`   Plan: premium`);
    console.log('\n🔄 Rechargez la page de profil pour voir l\'onglet Administration.');

  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  } finally {
    await admin.app().delete();
  }
}

// Vérifier les arguments
const email = process.argv[2];

if (!email) {
  console.log('Usage: node scripts/set-admin.js <email>');
  console.log('Exemple: node scripts/set-admin.js votre-email@gmail.com');
  process.exit(1);
}

setAdminRole(email);
