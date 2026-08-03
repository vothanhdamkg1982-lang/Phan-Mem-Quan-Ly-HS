// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDaY-ods_d-NkPuGRWroAPOx7501VEc0YM",
  authDomain: "gen-lang-client-0325287550.firebaseapp.com",
  projectId: "gen-lang-client-0325287550",
  storageBucket: "gen-lang-client-0325287550.firebasestorage.app",
  messagingSenderId: "545509298177",
  appId: "1:545509298177:web:b217a1d5ab246ddca97000",
  measurementId: "G-E7139PYKQP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);