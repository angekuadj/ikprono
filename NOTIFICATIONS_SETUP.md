# Notifications Firebase

IKProno uses Firebase Cloud Messaging (FCM) for web push, Firebase Admin to
register devices and send messages, Firestore to store match alert preferences,
and a scheduled GitHub Actions workflow to check subscribed matches.

## Firebase setup

1. In the Firebase Console, enable **Authentication** and **Cloud Firestore**.
   Add the site's production domain under Authentication's authorized domains.
2. Register a Web App in the Firebase project and copy its configuration into
   the `NEXT_PUBLIC_FIREBASE_*` variables listed in `.env.example`.
3. In **Project settings → Cloud Messaging → Web configuration**, create or
   copy the Web Push certificate key pair. Set its public key as
   `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
4. Create a service account for the same Firebase project. Keep its private
   key secret and configure the server-only variables:
   `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`.
   For Render, store the private key with escaped newlines (`\n`) or as a
   multiline value. Never use `NEXT_PUBLIC_` for Admin credentials.

## Hosting and scheduled checks

Set the Firebase client, Admin, and `NEXT_PUBLIC_SITE_URL` variables on the Web
Service, then deploy. The service worker is served at
`/firebase-messaging-sw.js`; it needs the public Firebase client configuration.

Set `MATCH_PUSH_CRON_SECRET` on the Web Service to a random value of at least
32 characters. The GitHub Actions workflow in
`.github/workflows/firebase-match-push.yml` calls the deployed check route
every five minutes. In GitHub, open **Settings → Secrets and variables →
Actions** and add a repository secret named `MATCH_PUSH_CRON_SECRET` with the
same value as the Web Service. Never put the secret in the workflow file or
commit it.

The schedule is free for this public GitHub repository. GitHub's scheduled
workflows can be delayed during high load and run on five-minute intervals at
minimum. The workflow must be present on the repository's default branch. Use
**Actions → Check match push notifications → Run workflow** to trigger a manual
check after adding the secret.

Only `/api/notifications/matches/check` is called by the scheduled workflow.
The app calls the device and subscription routes itself. After deploying, sign
in with a Firebase account, enable push in **Profile → Notifications Web Push**,
then open a match page and save the alerts you want. Use **Send a test** in the
profile to verify device registration and FCM delivery.

The match checker stores a baseline snapshot on its first run for a
subscription. It sends notifications for later changes (kick-off, goals, cards,
and full time). If delivery fails, inspect the GitHub Actions run logs and
verify that the service account, Firestore, FCM Web Push key, and check secret
all belong to the configured Firebase/site deployment.


Puis choisissez l'offre TV à ${TV_DAILY_PRICE_FCFA} FCFA/jour.

${TV_DAILY_PRICE_FCFA} XOF/day to watch every match.



connecter : Prenez l’offre TV à ${TV_DAILY_PRICE_FCFA} FCFA/jour pour regarder tous les matchs.