import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'pages/login_page.dart';
import 'services/auth_service.dart';
import 'theme/app_theme.dart';
import 'widgets/root_shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // No `options:` -- Android/iOS-only app, so firebase_core reads native
  // config (google-services.json / GoogleService-Info.plist) directly
  // rather than needing a generated firebase_options.dart. Those two files
  // must exist under android/app/ and ios/Runner/ respectively (see
  // mobile/README.md) or this throws at startup.
  await Firebase.initializeApp();
  await AuthService.initialize();
  runApp(const CastorApp());
}

class CastorApp extends StatelessWidget {
  const CastorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Castor',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: StreamBuilder<User?>(
        stream: FirebaseAuth.instance.authStateChanges(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            );
          }
          return snapshot.hasData ? const RootShell() : const LoginPage();
        },
      ),
    );
  }
}
