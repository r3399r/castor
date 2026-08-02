import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/coming_soon_notice.dart';

/// Mirrors webapp/app/wrong/WrongClient.tsx.
class WrongPage extends StatelessWidget {
  const WrongPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('錯題本')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: const [
            Text(
              '作答時未拿到滿分的題目會自動收錄在這裡，答對後也不會自動移除，你可以自己加註記或移除。',
              style: TextStyle(fontSize: 14, color: AppColors.black500, height: 1.5),
            ),
            SizedBox(height: 20),
            ComingSoonNotice(
              message: '錯題本尚未串接 API。之後這裡會顯示每題最後答錯時間、得分、答錯次數，並可加註記或移除。',
            ),
          ],
        ),
      ),
    );
  }
}
