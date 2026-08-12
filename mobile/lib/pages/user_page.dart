import 'package:flutter/material.dart';

import '../services/auth_service.dart';
import '../theme/app_theme.dart';
import '../widgets/coming_soon_notice.dart';

/// Mirrors webapp/app/user/UserClient.tsx -- the user's own profile (avatar,
/// email, editable name, sign-out), not the learning-analysis page (that's
/// analysis_page.dart now, matching the web app's /analysis route).
class UserPage extends StatelessWidget {
  const UserPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('個人資料')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text(
              '管理你的頭像、暱稱與帳號設定。',
              style: TextStyle(fontSize: 14, color: AppColors.black500, height: 1.5),
            ),
            const SizedBox(height: 20),
            const ComingSoonNotice(
              message: '個人資料尚未串接 API。之後這裡會顯示你的頭像、Email，並可以編輯暱稱。',
            ),
            const SizedBox(height: 20),
            // Login is now a hard app-wide gate (see main.dart), so this is
            // the only way to sign out -- everything else on this page is
            // still the placeholder above, pending the API wiring it notes.
            OutlinedButton.icon(
              onPressed: () => AuthService.signOut(),
              icon: const Icon(Icons.logout, color: AppColors.orange700),
              label: const Text(
                '登出',
                style: TextStyle(color: AppColors.orange700),
              ),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: AppColors.orange700),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
