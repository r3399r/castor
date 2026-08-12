import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:castor_mobile/widgets/root_shell.dart';

// Pumps RootShell directly (not CastorApp) -- CastorApp now gates on
// FirebaseAuth.instance.authStateChanges() in main.dart, which needs
// Firebase.initializeApp() to have run first (native config files this
// test environment doesn't have; see mobile/README.md). RootShell is what
// actually owns the bottom-nav/tab-switching behavior under test here, so
// testing it directly (wrapped in a bare MaterialApp) is the more isolated
// unit test anyway, not just a workaround.
Widget wrap(Widget child) => MaterialApp(home: child);

void main() {
  testWidgets('opens directly into 智慧練習 with all five bottom nav destinations', (tester) async {
    await tester.pumpWidget(wrap(const RootShell()));

    expect(find.text('制定今天的學習計畫，我們幫你挑出最適合的練習題目。'), findsOneWidget);
    expect(find.text('智慧練習'), findsOneWidget);
    expect(find.text('作答記錄'), findsOneWidget);
    expect(find.text('學習分析'), findsOneWidget);
    expect(find.text('禮物盒'), findsOneWidget);
    expect(find.text('個人資料'), findsOneWidget);
  });

  testWidgets('tapping 作答記錄 opens the merged page defaulting to the 錯題本 tab', (tester) async {
    await tester.pumpWidget(wrap(const RootShell()));

    await tester.tap(find.text('作答記錄'));
    await tester.pumpAndSettle();

    expect(find.text('錯題本'), findsOneWidget);
    expect(find.text('歷史紀錄'), findsOneWidget);
    expect(
      find.text('作答時未拿到滿分的題目會自動收錄在這裡，答對後也不會自動移除，你可以自己加註記或移除。'),
      findsOneWidget,
    );
  });

  testWidgets('switching to the 歷史紀錄 tab shows its content', (tester) async {
    await tester.pumpWidget(wrap(const RootShell()));

    await tester.tap(find.text('作答記錄'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('歷史紀錄'));
    await tester.pumpAndSettle();

    expect(find.text('回顧每次練習的題目、作答與得分。'), findsOneWidget);
  });
}
