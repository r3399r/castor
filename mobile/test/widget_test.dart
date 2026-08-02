import 'package:flutter_test/flutter_test.dart';

import 'package:castor_mobile/main.dart';

void main() {
  testWidgets('opens directly into 智慧練習 with all five bottom nav destinations', (tester) async {
    await tester.pumpWidget(const CastorApp());

    expect(find.text('制定今天的學習計畫，我們幫你挑出最適合的練習題目。'), findsOneWidget);
    expect(find.text('智慧練習'), findsOneWidget);
    expect(find.text('作答記錄'), findsOneWidget);
    expect(find.text('學習分析'), findsOneWidget);
    expect(find.text('禮物盒'), findsOneWidget);
    expect(find.text('個人資料'), findsOneWidget);
  });

  testWidgets('tapping 作答記錄 opens the merged page defaulting to the 錯題本 tab', (tester) async {
    await tester.pumpWidget(const CastorApp());

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
    await tester.pumpWidget(const CastorApp());

    await tester.tap(find.text('作答記錄'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('歷史紀錄'));
    await tester.pumpAndSettle();

    expect(find.text('回顧每次練習的題目、作答與得分。'), findsOneWidget);
  });
}
