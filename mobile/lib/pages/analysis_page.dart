import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/coming_soon_notice.dart';

/// Mirrors webapp/app/analysis/AnalysisClient.tsx.
class AnalysisPage extends StatelessWidget {
  const AnalysisPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('學習分析')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: const [
            Text(
              '查看你的學習表現與各科目熟練度。',
              style: TextStyle(fontSize: 14, color: AppColors.black500, height: 1.5),
            ),
            SizedBox(height: 20),
            ComingSoonNotice(
              message: '學習分析尚未串接 API。之後這裡會顯示答題歷史、正確率、連續天數與各科目熟練度圖表。',
            ),
          ],
        ),
      ),
    );
  }
}
