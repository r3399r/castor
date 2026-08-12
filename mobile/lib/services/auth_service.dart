import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

import 'api_client.dart';

/// Thin wrapper around Firebase Auth + Google Sign-In -- holds no state of
/// its own. FirebaseAuth.instance.authStateChanges() (used in main.dart) is
/// the single source of truth for whether the app shows LoginPage or
/// RootShell; this class only performs the sign-in/sign-out actions that
/// feed into that stream.
class AuthService {
  AuthService._();

  /// Must be called once, before any sign-in attempt -- see main.dart. No
  /// explicit clientId: google_sign_in picks it up from the native config
  /// files (google-services.json / GoogleService-Info.plist) once those are
  /// in place.
  static Future<void> initialize() {
    return GoogleSignIn.instance.initialize();
  }

  /// Starts the Google account picker, then signs the result into Firebase
  /// and syncs the backend user row. Returns null if the user cancels the
  /// picker; rethrows any other failure so the caller can show an error.
  static Future<UserCredential?> signInWithGoogle() async {
    final GoogleSignInAccount account;
    try {
      account = await GoogleSignIn.instance.authenticate();
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) return null;
      rethrow;
    }

    final idToken = account.authentication.idToken;
    final credential = GoogleAuthProvider.credential(idToken: idToken);
    final userCredential = await FirebaseAuth.instance.signInWithCredential(
      credential,
    );

    // Mirrors webapp/contexts/AuthContext.tsx's post-sign-in sync call --
    // find-or-create the backend user row from this Firebase identity.
    // Passed explicitly (not left to ApiClient's currentUser fallback)
    // since currentUser may not have settled yet this soon after sign-in.
    final freshToken = await userCredential.user?.getIdToken();
    if (freshToken != null) {
      await ApiClient.post('user/sync', {}, token: freshToken);
    }

    return userCredential;
  }

  static Future<void> signOut() async {
    await GoogleSignIn.instance.signOut();
    await FirebaseAuth.instance.signOut();
  }
}
