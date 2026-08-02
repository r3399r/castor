import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/coming_soon_notice.dart';

/// Mirrors webapp/app/box/BoxClient.tsx.
class BoxPage extends StatelessWidget {
  const BoxPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('禮物盒')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: const [
            Text(
              '展示你收集到的成就與獎勵。未來會導入積分系統，你可以透過練習累積積分，在這裡解鎖成就或兌換獎品。',
              style: TextStyle(fontSize: 14, color: AppColors.black500, height: 1.5),
            ),
            SizedBox(height: 20),
            ComingSoonNotice(
              message: '積分與兌換系統即將推出。之後這裡會顯示你的收藏與可兌換的獎品。',
            ),
          ],
        ),
      ),
    );
  }
}
