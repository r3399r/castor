import 'package:flutter_test/flutter_test.dart';

import 'package:castor_mobile/main.dart';

void main() {
  testWidgets('opens directly into 智慧練習 with all four bottom nav destinations', (tester) async {
    await tester.pumpWidget(const CastorApp());

    expect(find.text('制定今天的學習計畫，我們幫你挑出最適合的練習題目。'), findsOneWidget);
    expect(find.text('智慧練習'), findsWidgets);
    expect(find.text('作答記錄'), findsOneWidget);
    expect(find.text('錯題本'), findsOneWidget);
    expect(find.text('學習分析'), findsOneWidget);
  });

  testWidgets('tapping a bottom nav destination switches pages', (tester) async {
    await tester.pumpWidget(const CastorApp());

    await tester.tap(find.text('作答記錄'));
    await tester.pumpAndSettle();

    expect(find.text('回顧每次練習的題目、作答與得分。'), findsOneWidget);
  });
}
