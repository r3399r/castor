import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/coming_soon_notice.dart';

/// Mirrors webapp/app/reply/ReplyClient.tsx.
class ReplyPage extends StatelessWidget {
  const ReplyPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('作答記錄')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: const [
            Text(
              '回顧每次練習的題目、作答與得分。',
              style: TextStyle(fontSize: 14, color: AppColors.black500, height: 1.5),
            ),
            SizedBox(height: 20),
            ComingSoonNotice(
              message: '作答記錄尚未串接 API。之後這裡會列出你的歷史作答，並可依類別、科目、試卷、標籤篩選。',
            ),
          ],
        ),
      ),
    );
  }
}
