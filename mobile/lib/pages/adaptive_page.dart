import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/coming_soon_notice.dart';

/// Mirrors webapp/app/adaptive/AdaptiveClient.tsx.
class AdaptivePage extends StatelessWidget {
  const AdaptivePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('智慧練習')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: const [
            Text(
              '制定今天的學習計畫，我們幫你挑出最適合的練習題目。',
              style: TextStyle(fontSize: 14, color: AppColors.black500, height: 1.5),
            ),
            SizedBox(height: 20),
            ComingSoonNotice(
              message: '練習流程尚未串接 API。之後這裡會依序選擇考試類別、科目、篩選條件，並開始作答。',
            ),
          ],
        ),
      ),
    );
  }
}
