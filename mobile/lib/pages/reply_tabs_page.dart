import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/coming_soon_notice.dart';

/// Merges webapp/app/wrong/WrongClient.tsx and webapp/app/reply/ReplyClient.tsx
/// into a single 作答記錄 tab with two inner tabs -- the web app keeps them as
/// separate nav items, but mobile's bottom nav only has room for five slots
/// once 智慧練習 takes the prominent center one.
class ReplyTabsPage extends StatelessWidget {
  const ReplyTabsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('作答記錄'),
          bottom: const TabBar(
            tabs: [
              Tab(text: '錯題本'),
              Tab(text: '歷史紀錄'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            _WrongTab(),
            _HistoryTab(),
          ],
        ),
      ),
    );
  }
}

class _WrongTab extends StatelessWidget {
  const _WrongTab();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
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
    );
  }
}

/// 原本的「作答記錄」內容，改名為「歷史紀錄」分頁 (mirrors
/// webapp/app/reply/ReplyClient.tsx).
class _HistoryTab extends StatelessWidget {
  const _HistoryTab();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
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
    );
  }
}
