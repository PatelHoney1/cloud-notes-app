// TEMPLATE — copy this file to js/firebase-config.js and fill in your own values.
//
//   Firebase Console -> Project settings -> General -> Your apps -> SDK setup and configuration
//
// js/firebase-config.js is gitignored, so each person running this app supplies
// their own project config. Do not put real values in this example file.

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

// Initialize Firebase (compat)
firebase.initializeApp(firebaseConfig);

// Create global auth & db objects
const auth = firebase.auth();
const db = firebase.firestore();
