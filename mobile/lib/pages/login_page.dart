import 'package:flutter/material.dart';

import '../services/auth_service.dart';
import '../theme/app_theme.dart';

/// Shown by main.dart whenever FirebaseAuth.instance.authStateChanges() has
/// no signed-in user -- gates the entire app (not per-page like the web
/// app's AuthGuard.tsx), since every feature requires an account.
class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  bool _loading = false;
  String? _error;

  Future<void> _handleGoogleSignIn() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await AuthService.signInWithGoogle();
      // On success, FirebaseAuth.instance.authStateChanges() fires and
      // main.dart's StreamBuilder swaps this page out for RootShell -- no
      // navigation needed here.
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = '登入失敗，請再試一次。');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Castor',
                  style: TextStyle(
                    fontSize: 40,
                    fontWeight: FontWeight.bold,
                    color: AppColors.blue700,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  '登入以開始練習',
                  style: TextStyle(fontSize: 14, color: AppColors.black500),
                ),
                const SizedBox(height: 40),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: FilledButton.icon(
                    onPressed: _loading ? null : _handleGoogleSignIn,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.blue700,
                      foregroundColor: Colors.white,
                    ),
                    icon: _loading
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.login),
                    label: Text(_loading ? '登入中…' : '使用 Google 登入'),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    _error!,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.orange700,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
