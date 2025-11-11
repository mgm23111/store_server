const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

initializeApp({ credential: cert(serviceAccount) });

(async () => {
  const user = await getAuth().createUser({
    email: 'admin@miapp.com',
    password: '123456',
    displayName: 'Administrador',
  });
  console.log('Usuario creado en Auth:', user.uid);

  await getFirestore().collection('users').doc(user.uid).set({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName ?? '',
    dni: '12345678',
    roles: ['admin'],
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log('Perfil guardado en Firestore con DNI');
})().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
